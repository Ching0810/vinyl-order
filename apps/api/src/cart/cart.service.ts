import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { AddCartItemInput, Cart as CartContract } from '@vinyl-order/shared';

import type { Offer, Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { isRecordNotFound } from '../prisma/record-not-found';

/** 409 body: a code the web can branch on, not a message it has to match. */
const outOfStock = (): ConflictException =>
  new ConflictException({
    statusCode: 409,
    code: 'OUT_OF_STOCK',
    message: 'That record can’t be bought right now.',
  });

/** The cart's own per-line ceiling (the shared quantitySchema's). */
const MAX_PER_LINE = 99;

/**
 * Copies left to sell (tracker.md §8): the shop's count less the demo's
 * holds, never below 0. Null when the shop gives no count.
 */
const availableOf = (offer: Pick<Offer, 'stockQty' | 'reservedQty'>): number | null =>
  offer.stockQty === null ? null : Math.max(offer.stockQty - offer.reservedQty, 0);

/** The most a line of this offer may hold. */
const lineCapOf = (offer: Pick<Offer, 'stockQty' | 'reservedQty'>): number =>
  Math.min(availableOf(offer) ?? MAX_PER_LINE, MAX_PER_LINE);

/**
 * An offer the demo sells, or 404/409: in stock, with a copy left. Sold out
 * and pre-orders aren't sold (§8).
 */
const sellable = (offer: Offer | null): Offer => {
  if (!offer) throw new NotFoundException('Offer not found');
  if (offer.availability !== 'in_stock' || lineCapOf(offer) === 0) throw outOfStock();
  return offer;
};

/** A cart row joined to everything needed to price and render it. */
const withItems = {
  items: {
    include: {
      offer: true,
      product: { select: { id: true, title: true, imageUrl: true, artistRef: true } },
    },
    orderBy: { createdAt: 'asc' },
  },
} satisfies Prisma.CartInclude;

type CartWithItems = Prisma.CartGetPayload<{ include: typeof withItems }>;

/**
 * A customer's cart: a line an offer — one shop's version of a record
 * (tracker.md §5.6).
 *
 * Every method is scoped by `userId` rather than taking a cart id: the routes
 * are all "my cart", so a caller can never address someone else's by guessing
 * an identifier.
 *
 * Totals are computed on read from the offer's price as last read from the
 * shop (§8). The cart stores no money — it records what was chosen, and what
 * that costs is whatever the shop's page said. Freezing a price belongs at
 * checkout, on the order.
 */
@Injectable()
export class CartService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * The user's cart, created if absent.
   *
   * `upsert` on the unique `userId` rather than find-then-create: two rapid
   * first adds would both find nothing and both insert, and the second would
   * hit Cart_userId_key. One statement makes that race impossible.
   */
  private ensureCart(userId: string): Promise<CartWithItems> {
    return this.prisma.cart.upsert({
      where: { userId },
      create: { userId },
      update: {},
      include: withItems,
    });
  }

  /** Shape a cart row for the wire, pricing each line from its offer. */
  private toContract(cart: CartWithItems | null): CartContract {
    const items = (cart?.items ?? []).map(({ id, offerId, quantity, offer, product }) => ({
      id,
      offerId,
      quantity,
      offer: {
        id: offer.id,
        supplier: offer.supplier,
        sourceTitle: offer.sourceTitle,
        url: offer.url,
        imageUrl: offer.imageUrl,
        priceCents: offer.priceCents,
        currency: offer.currency,
        availability: offer.availability,
        available: availableOf(offer),
        lastCheckedAt: offer.lastCheckedAt.toISOString(),
      },
      product: {
        id: product.id,
        title: product.title,
        // Every record made from a catalog has one; the string column it
        // replaces goes in step 5's contract migration.
        artist: product.artistRef?.name ?? '',
        imageUrl: product.imageUrl,
      },
      lineTotalCents: offer.priceCents * quantity,
    }));

    return {
      items,
      subtotalCents: items.reduce((sum, item) => sum + item.lineTotalCents, 0),
      itemCount: items.reduce((sum, item) => sum + item.quantity, 0),
    };
  }

  /**
   * Read the cart. Deliberately does not create one — the header calls this on
   * every page for every signed-in visitor, and a GET that writes would leave
   * an empty row behind for people who never add anything.
   */
  async find(userId: string): Promise<CartContract> {
    const cart = await this.prisma.cart.findUnique({
      where: { userId },
      include: withItems,
    });
    return this.toContract(cart);
  }

  /**
   * Add an offer, or increase it if already present. The composite unique on
   * (cartId, offerId) is what lets this be one upsert instead of a read
   * followed by a decision.
   *
   * Asking for more copies than remain caps the line at what's left rather
   * than failing: every write answers with the whole cart, so the caller sees
   * the quantity that was actually set. An offer that can't be bought is
   * different — there is no quantity to cap to — and is refused.
   */
  async addItem(userId: string, { offerId, quantity }: AddCartItemInput): Promise<CartContract> {
    const offer = sellable(await this.prisma.offer.findUnique({ where: { id: offerId } }));
    const cart = await this.ensureCart(userId);

    await this.prisma.cartItem.upsert({
      where: { cartId_offerId: { cartId: cart.id, offerId } },
      create: { cartId: cart.id, offerId, productId: offer.productId, quantity },
      update: { quantity: { increment: quantity } },
    });
    await this.capToStock(cart.id, offerId, lineCapOf(offer));

    return this.find(userId);
  }

  /**
   * Set an absolute quantity on a line, so a retry lands on the same result.
   * Capped at what's left, like addItem.
   */
  async updateItem(userId: string, offerId: string, quantity: number): Promise<CartContract> {
    const cart = await this.prisma.cart.findUnique({ where: { userId } });
    if (!cart) throw new NotFoundException('Cart not found');

    const offer = sellable(await this.prisma.offer.findUnique({ where: { id: offerId } }));

    try {
      await this.prisma.cartItem.update({
        where: { cartId_offerId: { cartId: cart.id, offerId } },
        data: { quantity: Math.min(quantity, lineCapOf(offer)) },
      });
    } catch (error) {
      // No such line in this cart.
      if (isRecordNotFound(error)) throw new NotFoundException('That offer is not in your cart');
      throw error;
    }

    return this.find(userId);
  }

  async removeItem(userId: string, offerId: string): Promise<CartContract> {
    const cart = await this.prisma.cart.findUnique({ where: { userId } });
    if (!cart) throw new NotFoundException('Cart not found');

    // deleteMany rather than delete: removing something already gone is the
    // outcome the caller wanted, so it shouldn't be an error.
    await this.prisma.cartItem.deleteMany({ where: { cartId: cart.id, offerId } });
    return this.find(userId);
  }

  /**
   * Bring a line back down to its cap if the write just pushed it over.
   *
   * A second statement rather than a read-then-write: whatever quantity the
   * upsert's increment produced, including one from a request that raced this
   * one, this corrects it. It is housekeeping, not a guarantee — stock can
   * fall a moment later, and only checkout's conditional hold decides.
   */
  private async capToStock(cartId: string, offerId: string, cap: number): Promise<void> {
    await this.prisma.cartItem.updateMany({
      where: { cartId, offerId, quantity: { gt: cap } },
      data: { quantity: cap },
    });
  }

  /** Empty the cart, keeping the cart row itself. */
  async clear(userId: string): Promise<CartContract> {
    const cart = await this.prisma.cart.findUnique({ where: { userId } });
    if (cart) await this.prisma.cartItem.deleteMany({ where: { cartId: cart.id } });
    return this.find(userId);
  }
}
