import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type {
  Connection,
  InsufficientStockItem,
  Order as OrderContract,
  OrderSummary,
  PageArgs,
} from '@vinyl-order/shared';

import { paginate } from '../common/pagination';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';

// OrderItem has no timestamps — lines are written once and never edited — so
// title orders them, and id breaks ties between records sharing a title (two
// pressings of one album).
const lineOrder = [
  { title: 'asc' },
  { id: 'asc' },
] satisfies Prisma.OrderItemOrderByWithRelationInput[];

/** An order row joined to the lines it is rendered from. */
const withItems = {
  items: { orderBy: lineOrder },
} satisfies Prisma.OrderInclude;

type OrderWithItems = Prisma.OrderGetPayload<{ include: typeof withItems }>;

/**
 * An order row with only what a history row shows: how many lines it has,
 * counted in the same query rather than by loading them.
 */
const withLineCount = {
  _count: { select: { items: true } },
} satisfies Prisma.OrderInclude;

type OrderWithLineCount = Prisma.OrderGetPayload<{ include: typeof withLineCount }>;

/**
 * Newest first. id breaks ties between orders placed in the same millisecond,
 * which cursor paging needs to be deterministic.
 */
const orderHistoryOrder = [
  { createdAt: 'desc' },
  { id: 'desc' },
] satisfies Prisma.OrderOrderByWithRelationInput[];

/** A cart item joined to the product it copies into the order. */
type CartItemWithProduct = Prisma.CartItemGetPayload<{ include: { product: true } }>;

/**
 * Thrown inside the transaction when a cart item can't be fulfilled.
 *
 * A private error rather than a ConflictException because the response needs
 * `available`, the stock actually left — and reading it inside the transaction
 * would report our own about-to-be-rolled-back numbers. So it carries only what
 * is known inside, and the handler reads the real stock after the rollback.
 */
class ShortStockError extends Error {
  constructor(readonly shortItems: Omit<InsufficientStockItem, 'available'>[]) {
    super('INSUFFICIENT_STOCK');
  }
}

/** What checkout answered with, and whether it placed the order just now. */
export interface CheckoutResult {
  order: OrderContract;
  /** False when an idempotency key matched an order an earlier request placed. */
  created: boolean;
}

/**
 * Did this write lose the race for an idempotency key?
 *
 * P2002 is Prisma's unique-constraint violation, and the target names the
 * index — so a clash on some other unique, were one added to Order, is not
 * mistaken for a repeated checkout.
 */
const isDuplicateKey = (error: unknown): boolean =>
  error instanceof Prisma.PrismaClientKnownRequestError &&
  error.code === 'P2002' &&
  JSON.stringify(error.meta?.target ?? '').includes('idempotencyKey');

/** 409 body: a code the web can branch on, not a message it has to match. */
const conflict = (code: string, message: string, extra: object = {}): ConflictException =>
  new ConflictException({ statusCode: 409, code, message, ...extra });

/**
 * Turning a cart into an order, and reading a customer's orders back.
 *
 * Every read is scoped by userId inside the query itself, so another
 * customer's order is simply not found — there is no separate ownership check
 * to forget.
 *
 * In checkout, everything correctness-critical happens in one transaction, and both guards
 * follow the same rule: never read, decide, then write. Each write carries its
 * own condition and reports how many rows it touched, so there is no gap
 * between checking and acting for a concurrent checkout to race through.
 *
 * - Overselling is prevented by `UPDATE ... WHERE stock >= qty`, checked via
 *   the affected-row count.
 * - Duplicate orders are prevented by deleting the cart items *first* and
 *   checking the delete count: whoever removes the rows owns them.
 */
@Injectable()
export class OrdersService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * The user's order history, newest first, cursor-paginated.
   *
   * A foreign or unknown cursor can't leak anything: `where` still limits the
   * page to this user's orders, and a cursor Prisma can't find gives an empty
   * page.
   */
  list(userId: string, args: PageArgs): Promise<Connection<OrderSummary>> {
    return paginate(
      args,
      (window) =>
        this.prisma.order.findMany({
          where: { userId },
          orderBy: orderHistoryOrder,
          include: withLineCount,
          ...window,
        }),
      (order) => this.toSummary(order),
    );
  }

  /**
   * One of the user's orders with every line.
   *
   * 404 rather than 403 for someone else's order: a 403 would confirm that the
   * id exists.
   */
  async findOne(userId: string, id: string): Promise<OrderContract> {
    const order = await this.prisma.order.findFirst({
      where: { id, userId },
      include: withItems,
    });
    if (!order) throw new NotFoundException('Order not found');
    return this.toContract(order);
  }

  /**
   * Place the signed-in user's cart as an order.
   *
   * With an idempotency key, a retry of the same attempt answers with the
   * order the first request placed rather than placing a second one. The
   * lookup here is only an optimisation — it saves doing the work — and the
   * unique index on (userId, idempotencyKey) is what actually decides, at
   * write time, the way the stock guard and the cart claim do.
   *
   * @param userId - the customer checking out
   * @param idempotencyKey - the client's id for this attempt, if it sent one
   */
  async checkout(userId: string, idempotencyKey?: string): Promise<CheckoutResult> {
    if (idempotencyKey) {
      const existing = await this.findByIdempotencyKey(userId, idempotencyKey);
      if (existing) return { order: existing, created: false };
    }

    try {
      return { order: await this.placeOrder(userId, idempotencyKey), created: true };
    } catch (error) {
      const order = await this.orderFromLostRace(userId, idempotencyKey, error);
      return { order, created: false };
    }
  }

  /** The order an earlier request placed under this key, if it has committed. */
  private async findByIdempotencyKey(
    userId: string,
    idempotencyKey: string,
  ): Promise<OrderContract | null> {
    const order = await this.prisma.order.findUnique({
      where: { userId_idempotencyKey: { userId, idempotencyKey } },
      include: withItems,
    });
    return order ? this.toContract(order) : null;
  }

  /**
   * Turn the cart into an order, or throw.
   *
   * Nothing slow may go in here. The transaction holds a row lock on every
   * product it decrements until it commits, so anything waiting on those
   * records waits for us — payment and email belong after the commit, against
   * a `pending` order.
   */
  private async placeOrder(userId: string, idempotencyKey?: string): Promise<OrderContract> {
    const order = await this.prisma.$transaction(
      async (transaction) => {
        const cartItems = await transaction.cartItem.findMany({
          where: { cart: { userId } },
          include: { product: true },
        });
        if (cartItems.length === 0) {
          throw conflict('CART_EMPTY', 'Your cart is empty.');
        }

        // One order carries one total, so it can only carry one currency.
        // The storefront already assumes a single currency; this enforces it
        // rather than inventing multi-currency totals nobody needs yet.
        const currency = cartItems[0].product.currency;
        if (cartItems.some((cartItem) => cartItem.product.currency !== currency)) {
          throw conflict('MIXED_CURRENCY', 'All records in an order must share one currency.');
        }

        await this.claimCartItems(transaction, cartItems);
        await this.takeStock(transaction, cartItems);

        return transaction.order.create({
          data: {
            userId,
            currency,
            // Stored, not derived: an order's total must not move if a
            // product is repriced later.
            subtotalCents: cartItems.reduce(
              (sum, cartItem) => sum + cartItem.product.priceCents * cartItem.quantity,
              0,
            ),
            // Null when the client sent no key. Nulls don't collide in a
            // Postgres unique index, so keyless checkouts never compete.
            idempotencyKey: idempotencyKey ?? null,
            // status defaults to `pending` in the database — the one place
            // "a new order starts pending" is defined.
            items: {
              create: cartItems.map((cartItem) => ({
                productId: cartItem.productId,
                quantity: cartItem.quantity,
                // Copied at purchase and never read from Product again. This
                // is what lets an order survive a reprice or a delete.
                unitPriceCents: cartItem.product.priceCents,
                title: cartItem.product.title,
                artist: cartItem.product.artist,
                imageUrl: cartItem.product.imageUrl,
              })),
            },
          },
          include: withItems,
        });
      },
      // Prisma's defaults, stated so they read as a choice. Checkouts queue
      // behind each other on hot records, but each one is a handful of fast
      // statements; a timeout here means something is holding locks too long
      // and is worth investigating rather than raising.
      { maxWait: 2_000, timeout: 5_000 },
    );

    return this.toContract(order);
  }

  /**
   * A checkout failed: decide whether it lost a race it should be forgiven for.
   *
   * A retry carrying a key the winner already used — beaten to the cart lines,
   * or to the unique index — is answered with the winner's order, which is the
   * whole point of the key. The exception is the narrow window where the
   * winner has not committed yet: there is nothing to read back, so the client
   * is asked to retry rather than told something untrue.
   */
  private async orderFromLostRace(
    userId: string,
    idempotencyKey: string | undefined,
    error: unknown,
  ): Promise<OrderContract> {
    if (idempotencyKey) {
      const existing = await this.findByIdempotencyKey(userId, idempotencyKey);
      if (existing) return existing;

      if (isDuplicateKey(error)) {
        throw conflict(
          'CHECKOUT_IN_PROGRESS',
          'Your earlier attempt is still being processed. Try again in a moment.',
        );
      }
    }

    throw await this.toClientError(error);
  }

  /**
   * Shape a failed checkout as the error the client should see: short stock
   * becomes the 409 listing every line that couldn't be filled; anything else
   * passes through as it is.
   */
  private async toClientError(error: unknown): Promise<unknown> {
    if (!(error instanceof ShortStockError)) return error;

    // The transaction has rolled back, so this reads the real current stock
    // rather than our own reverted decrements. It is informational only: by
    // the time the customer reads it, someone else may have taken more.
    const products = await this.prisma.product.findMany({
      where: { id: { in: error.shortItems.map((item) => item.productId) } },
      select: { id: true, stock: true },
    });
    const stockById = new Map(products.map((product) => [product.id, product.stock]));

    return conflict(
      'INSUFFICIENT_STOCK',
      'Some records no longer have enough stock.',
      // Every short item at once, so the customer fixes them in one pass
      // instead of one per attempt.
      {
        items: error.shortItems.map((item) => ({
          ...item,
          available: stockById.get(item.productId) ?? 0,
        })),
      },
    );
  }

  /**
   * Consume the cart items this checkout is ordering, and prove we were the
   * ones who consumed them.
   *
   * Deleting is the claim, not a check before one: two transactions cannot both
   * delete the same row, so the count is a fact. A second tab that read the
   * same rows blocks here on their locks, then wakes to find them gone and
   * fails with 0 — rolling back before it has touched any stock.
   *
   * Deleting by id (rather than clearing the cart) leaves a record added
   * mid-checkout in the cart, where it belongs: it was never charged for.
   *
   * Known gap: another tab *editing a quantity* keeps the same row id, so the
   * count still matches and the order uses the quantity read at step 1 — which
   * is the quantity the customer saw when they pressed the button.
   */

  // this method prevent same cartItem add to order twice
  private async claimCartItems(
    transaction: Prisma.TransactionClient,
    cartItems: CartItemWithProduct[],
  ): Promise<void> {
    // the number of cartItem delete from user cart
    const { count } = await transaction.cartItem.deleteMany({
      where: { id: { in: cartItems.map((cartItem) => cartItem.id) } },
    });

    // if delete count did not match with target count, it means part of cartItem already been claim to a order
    if (count !== cartItems.length) {
      throw conflict(
        'CART_CHANGED',
        'Your cart changed while checking out. Please review it and try again.',
      );
    }
  }

  /**
   * Decrement stock for every cart item, or fail the whole order.
   *
   * `updateMany` rather than `update` because it returns a count instead of
   * throwing when the WHERE matches nothing: "not enough stock" becomes a value
   * to check, not an exception to catch. The condition lives inside the write,
   * so a concurrent checkout cannot slip between the check and the decrement —
   * after waiting on the row lock, Postgres re-evaluates `stock >= quantity`
   * against the newly committed row.
   *
   * Every cart item is attempted before failing, so the error can list them all.
   */
  // this method prevent last product order by multiple orders
  private async takeStock(
    transaction: Prisma.TransactionClient,
    cartItems: CartItemWithProduct[],
  ): Promise<void> {
    // Lock ordering: every checkout takes product locks in the same global
    // order, so two carts holding the same records in opposite order queue
    // instead of deadlocking. Sequential on purpose — running these in parallel
    // would throw that ordering away (and a transaction is one connection).
    const cartItemsByProductId = [...cartItems].sort((a, b) =>
      a.productId.localeCompare(b.productId),
    );

    const shortItems: Omit<InsufficientStockItem, 'available'>[] = [];
    for (const cartItem of cartItemsByProductId) {
      const { count } = await transaction.product.updateMany({
        where: { id: cartItem.productId, stock: { gte: cartItem.quantity } },
        data: { stock: { decrement: cartItem.quantity } },
      });

      if (count === 0) {
        shortItems.push({
          productId: cartItem.productId,
          title: cartItem.product.title,
          requested: cartItem.quantity,
        });
      }
    }

    // Throwing rolls back the decrements that did succeed: the customer gets
    // every record or none, never a partial order.
    if (shortItems.length > 0) throw new ShortStockError(shortItems);
  }

  /** Shape an order row for the wire. Nothing here reads a live product. */
  private toContract(order: OrderWithItems): OrderContract {
    const items = order.items.map((item) => ({
      id: item.id,
      productId: item.productId,
      quantity: item.quantity,
      unitPriceCents: item.unitPriceCents,
      title: item.title,
      artist: item.artist,
      imageUrl: item.imageUrl,
      // Derived, but unlike the cart's it can't go stale: both inputs were
      // frozen at purchase.
      lineTotalCents: item.unitPriceCents * item.quantity,
    }));

    return { ...this.toBase(order, items.length), items };
  }

  /** Shape an order row for a history row: the order, and how many lines. */
  private toSummary(order: OrderWithLineCount): OrderSummary {
    return this.toBase(order, order._count.items);
  }

  /** The fields a summary and a full order share. */
  private toBase(
    order: Pick<OrderWithItems, 'id' | 'status' | 'subtotalCents' | 'currency' | 'createdAt'>,
    lineCount: number,
  ) {
    return {
      id: order.id,
      status: order.status,
      subtotalCents: order.subtotalCents,
      currency: order.currency,
      lineCount,
      // ISO string, matching what actually crosses JSON.
      createdAt: order.createdAt.toISOString(),
    };
  }
}
