import { ConflictException, Injectable } from '@nestjs/common';
import type { InsufficientStockItem, Order as OrderContract } from '@vinyl-order/shared';

import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/** An order row joined to the lines it is rendered from. */
const withItems = {
  // OrderItem has no timestamps — lines are written once and never edited — so
  // title is the only stable order for a deterministic response.
  items: { orderBy: { title: 'asc' } },
} satisfies Prisma.OrderInclude;

type OrderWithItems = Prisma.OrderGetPayload<{ include: typeof withItems }>;

/** A cart line joined to the product it copies into the order. */
type CartLine = Prisma.CartItemGetPayload<{ include: { product: true } }>;

/**
 * Thrown inside the transaction when a line can't be fulfilled.
 *
 * A private error rather than a ConflictException because the response needs
 * `available`, the stock actually left — and reading it inside the transaction
 * would report our own about-to-be-rolled-back numbers. So it carries only what
 * is known inside, and the handler reads the real stock after the rollback.
 */
class ShortStockError extends Error {
  constructor(readonly lines: Omit<InsufficientStockItem, 'available'>[]) {
    super('INSUFFICIENT_STOCK');
  }
}

/** 409 body: a code the web can branch on, not a message it has to match. */
const conflict = (code: string, message: string, extra: object = {}): ConflictException =>
  new ConflictException({ statusCode: 409, code, message, ...extra });

/**
 * Turning a cart into an order.
 *
 * Everything correctness-critical happens in one transaction, and both guards
 * follow the same rule: never read, decide, then write. Each write carries its
 * own condition and reports how many rows it touched, so there is no gap
 * between checking and acting for a concurrent checkout to race through.
 *
 * - Overselling is prevented by `UPDATE ... WHERE stock >= qty`, checked via
 *   the affected-row count.
 * - Duplicate orders are prevented by deleting the cart lines *first* and
 *   checking the delete count: whoever removes the rows owns them.
 */
@Injectable()
export class OrdersService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Place the signed-in user's cart as an order.
   *
   * Nothing slow may go in here. The transaction holds a row lock on every
   * product it decrements until it commits, so anything waiting on those
   * records waits for us — payment and email belong after the commit, against
   * a `pending` order.
   */
  async checkout(userId: string): Promise<OrderContract> {
    try {
      const order = await this.prisma.$transaction(
        async (tx) => {
          const lines = await tx.cartItem.findMany({
            where: { cart: { userId } },
            include: { product: true },
          });
          if (lines.length === 0) {
            throw conflict('CART_EMPTY', 'Your cart is empty.');
          }

          // One order carries one total, so it can only carry one currency.
          // The storefront already assumes a single currency; this enforces it
          // rather than inventing multi-currency totals nobody needs yet.
          const currency = lines[0].product.currency;
          if (lines.some((line) => line.product.currency !== currency)) {
            throw conflict('MIXED_CURRENCY', 'All records in an order must share one currency.');
          }

          await this.claimCartLines(tx, lines);
          await this.takeStock(tx, lines);

          return tx.order.create({
            data: {
              userId,
              currency,
              // Stored, not derived: an order's total must not move if a
              // product is repriced later.
              subtotalCents: lines.reduce(
                (sum, line) => sum + line.product.priceCents * line.quantity,
                0,
              ),
              // status defaults to `pending` in the database — the one place
              // "a new order starts pending" is defined.
              items: {
                create: lines.map((line) => ({
                  productId: line.productId,
                  quantity: line.quantity,
                  // Copied at purchase and never read from Product again. This
                  // is what lets an order survive a reprice or a delete.
                  unitPriceCents: line.product.priceCents,
                  title: line.product.title,
                  artist: line.product.artist,
                  imageUrl: line.product.imageUrl,
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
    } catch (error) {
      if (!(error instanceof ShortStockError)) throw error;

      // The transaction has rolled back, so this reads the real current stock
      // rather than our own reverted decrements. It is informational only: by
      // the time the customer reads it, someone else may have taken more.
      const products = await this.prisma.product.findMany({
        where: { id: { in: error.lines.map((line) => line.productId) } },
        select: { id: true, stock: true },
      });
      const stockById = new Map(products.map((product) => [product.id, product.stock]));

      throw conflict(
        'INSUFFICIENT_STOCK',
        'Some records no longer have enough stock.',
        // Every short line at once, so the customer fixes them in one pass
        // instead of one per attempt.
        {
          items: error.lines.map((line) => ({
            ...line,
            available: stockById.get(line.productId) ?? 0,
          })),
        },
      );
    }
  }

  /**
   * Consume the cart lines this checkout is ordering, and prove we were the
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
  private async claimCartLines(tx: Prisma.TransactionClient, lines: CartLine[]): Promise<void> {
    // the number of cartItem delete from user cart
    const { count } = await tx.cartItem.deleteMany({
      where: { id: { in: lines.map((line) => line.id) } },
    });

    // if delete count did not match with target count, it means part of cartItem already been claim to a order
    if (count !== lines.length) {
      throw conflict(
        'CART_CHANGED',
        'Your cart changed while checking out. Please review it and try again.',
      );
    }
  }

  /**
   * Decrement stock for every line, or fail the whole order.
   *
   * `updateMany` rather than `update` because it returns a count instead of
   * throwing when the WHERE matches nothing: "not enough stock" becomes a value
   * to check, not an exception to catch. The condition lives inside the write,
   * so a concurrent checkout cannot slip between the check and the decrement —
   * after waiting on the row lock, Postgres re-evaluates `stock >= quantity`
   * against the newly committed row.
   *
   * Every line is attempted before failing, so the error can list them all.
   */
  // this method prevent last product order by multiple orders
  private async takeStock(tx: Prisma.TransactionClient, lines: CartLine[]): Promise<void> {
    // Lock ordering: every checkout takes product locks in the same global
    // order, so two carts holding the same records in opposite order queue
    // instead of deadlocking. Sequential on purpose — running these in parallel
    // would throw that ordering away (and a transaction is one connection).
    const ordered = [...lines].sort((a, b) => a.productId.localeCompare(b.productId));

    const short: Omit<InsufficientStockItem, 'available'>[] = [];
    for (const line of ordered) {
      const { count } = await tx.product.updateMany({
        where: { id: line.productId, stock: { gte: line.quantity } },
        data: { stock: { decrement: line.quantity } },
      });

      if (count === 0) {
        short.push({
          productId: line.productId,
          title: line.product.title,
          requested: line.quantity,
        });
      }
    }

    // Throwing rolls back the decrements that did succeed: the customer gets
    // every record or none, never a partial order.
    if (short.length > 0) throw new ShortStockError(short);
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

    return {
      id: order.id,
      status: order.status,
      subtotalCents: order.subtotalCents,
      currency: order.currency,
      itemCount: items.reduce((sum, item) => sum + item.quantity, 0),
      // ISO string, matching what actually crosses JSON.
      createdAt: order.createdAt.toISOString(),
      items,
    };
  }
}
