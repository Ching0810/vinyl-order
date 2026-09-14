import { Injectable, NotFoundException } from '@nestjs/common';
import type { AddCartItemInput, Cart as CartContract } from '@vinyl-order/shared';

import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/** A cart row joined to everything needed to price and render it. */
const withItems = {
  items: {
    include: { product: { include: { categories: true } } },
    orderBy: { createdAt: 'asc' },
  },
} satisfies Prisma.CartInclude;

type CartWithItems = Prisma.CartGetPayload<{ include: typeof withItems }>;

/**
 * A customer's cart.
 *
 * Every method is scoped by `userId` rather than taking a cart id: the routes
 * are all "my cart", so a caller can never address someone else's by guessing
 * an identifier.
 *
 * Totals are computed on read from the product's current price. The cart
 * stores no money — it records what was chosen, and what that costs is
 * whatever the shop charges right now. Freezing a price belongs at checkout,
 * on the order.
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

  /** Shape a cart row for the wire, pricing each line from the live product. */
  private toContract(cart: CartWithItems | null): CartContract {
    const items = (cart?.items ?? []).map((item) => ({
      id: item.id,
      productId: item.productId,
      quantity: item.quantity,
      product: item.product,
      lineTotalCents: item.product.priceCents * item.quantity,
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
   * Add a product, or increase it if already present. The composite unique on
   * (cartId, productId) is what lets this be one upsert instead of a read
   * followed by a decision.
   */
  async addItem(userId: string, { productId, quantity }: AddCartItemInput): Promise<CartContract> {
    const product = await this.prisma.product.findUnique({ where: { id: productId } });
    if (!product) throw new NotFoundException('Product not found');

    const cart = await this.ensureCart(userId);

    await this.prisma.cartItem.upsert({
      where: { cartId_productId: { cartId: cart.id, productId } },
      create: { cartId: cart.id, productId, quantity },
      update: { quantity: { increment: quantity } },
    });

    return this.find(userId);
  }

  /** Set an absolute quantity on a line, so a retry lands on the same result. */
  async updateItem(userId: string, productId: string, quantity: number): Promise<CartContract> {
    const cart = await this.prisma.cart.findUnique({ where: { userId } });
    if (!cart) throw new NotFoundException('Cart not found');

    try {
      await this.prisma.cartItem.update({
        where: { cartId_productId: { cartId: cart.id, productId } },
        data: { quantity },
      });
    } catch (error) {
      // P2025 = no such line in this cart.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
        throw new NotFoundException('That product is not in your cart');
      }
      throw error;
    }

    return this.find(userId);
  }

  async removeItem(userId: string, productId: string): Promise<CartContract> {
    const cart = await this.prisma.cart.findUnique({ where: { userId } });
    if (!cart) throw new NotFoundException('Cart not found');

    // deleteMany rather than delete: removing something already gone is the
    // outcome the caller wanted, so it shouldn't be an error.
    await this.prisma.cartItem.deleteMany({ where: { cartId: cart.id, productId } });
    return this.find(userId);
  }

  /** Empty the cart, keeping the cart row itself. */
  async clear(userId: string): Promise<CartContract> {
    const cart = await this.prisma.cart.findUnique({ where: { userId } });
    if (cart) await this.prisma.cartItem.deleteMany({ where: { cartId: cart.id } });
    return this.find(userId);
  }
}
