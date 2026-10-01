import type {
  CancelReason,
  Order as OrderContract,
  OrderStatus,
  OrderSummary,
} from '@vinyl-order/shared';

import type { SameUnion } from '../common/type-checks';
import type {
  Prisma,
  CancelReason as DbCancelReason,
  OrderStatus as DbOrderStatus,
} from '../generated/prisma/client';

// The database enums and the wire enums are written twice — once in the Prisma
// schema, once in @vinyl-order/shared — so these fail to compile the moment
// either side gains a value the other lacks.
true satisfies SameUnion<DbOrderStatus, OrderStatus>;
true satisfies SameUnion<DbCancelReason, CancelReason>;

// OrderItem has no timestamps — lines are written once and never edited — so
// title orders them, and id breaks ties between records sharing a title (two
// pressings of one album).
const lineOrder = [
  { title: 'asc' },
  { id: 'asc' },
] satisfies Prisma.OrderItemOrderByWithRelationInput[];

/** An order row joined to the lines it is rendered from. */
export const withItems = {
  items: { orderBy: lineOrder },
} satisfies Prisma.OrderInclude;

type OrderWithItems = Prisma.OrderGetPayload<{ include: typeof withItems }>;

/**
 * An order row with only what a history row shows: how many lines it has,
 * counted in the same query rather than by loading them.
 */
export const withLineCount = {
  _count: { select: { items: true } },
} satisfies Prisma.OrderInclude;

type OrderWithLineCount = Prisma.OrderGetPayload<{ include: typeof withLineCount }>;

/** Shape an order row for the wire. Nothing here reads a live product. */
export const toOrderContract = (order: OrderWithItems): OrderContract => {
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

  return { ...toBase(order, items.length), items };
};

/** Shape an order row for a history row: the order, and how many lines. */
export const toOrderSummary = (order: OrderWithLineCount): OrderSummary =>
  toBase(order, order._count.items);

/** The fields a summary and a full order share. */
const toBase = (
  order: Pick<
    OrderWithItems,
    | 'id'
    | 'status'
    | 'subtotalCents'
    | 'currency'
    | 'createdAt'
    | 'expiresAt'
    | 'cancelledAt'
    | 'cancelReason'
    | 'paidAt'
    | 'shippedAt'
  >,
  lineCount: number,
) => ({
  id: order.id,
  status: order.status,
  subtotalCents: order.subtotalCents,
  currency: order.currency,
  lineCount,
  // ISO strings, matching what actually crosses JSON.
  createdAt: order.createdAt.toISOString(),
  expiresAt: order.expiresAt.toISOString(),
  cancelledAt: order.cancelledAt?.toISOString() ?? null,
  cancelReason: order.cancelReason,
  paidAt: order.paidAt?.toISOString() ?? null,
  shippedAt: order.shippedAt?.toISOString() ?? null,
});
