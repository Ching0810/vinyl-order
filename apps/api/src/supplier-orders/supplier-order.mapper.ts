import type {
  Supplier,
  SupplierOrder as SupplierOrderContract,
  SupplierOrderStatus,
} from '@vinyl-order/shared';

import type { SameUnion } from '../common/type-checks';
import type {
  Prisma,
  Supplier as DbSupplier,
  SupplierOrderStatus as DbSupplierOrderStatus,
} from '../generated/prisma/client';

// Written twice — in the Prisma schema and in @vinyl-order/shared — so these
// fail to compile the moment either side gains a value the other lacks.
true satisfies SameUnion<DbSupplier, Supplier>;
true satisfies SameUnion<DbSupplierOrderStatus, SupplierOrderStatus>;

// Lines have no timestamps, so title orders them and id breaks ties, as for
// the demo store's order lines.
const lineOrder = [
  { title: 'asc' },
  { id: 'asc' },
] satisfies Prisma.SupplierOrderItemOrderByWithRelationInput[];

/** A supplier order row joined to the lines it is rendered from. */
export const withItems = {
  items: { orderBy: lineOrder },
} satisfies Prisma.SupplierOrderInclude;

type SupplierOrderWithItems = Prisma.SupplierOrderGetPayload<{ include: typeof withItems }>;

/**
 * A `@db.Date` column as `YYYY-MM-DD`. Prisma reads it as midnight UTC, so the
 * UTC date is the stored day; local-time methods could shift it by one.
 */
const toDay = (date: Date): string => date.toISOString().slice(0, 10);

/** `YYYY-MM-DD` as the Date Prisma writes to a `@db.Date` column: midnight UTC. */
export const fromDay = (day: string): Date => new Date(`${day}T00:00:00.000Z`);

/** Shape a row for the wire. No userId: the caller already knows it's theirs. */
export const toSupplierOrderContract = (order: SupplierOrderWithItems): SupplierOrderContract => ({
  id: order.id,
  supplier: order.supplier,
  orderNumber: order.orderNumber,
  orderedAt: toDay(order.orderedAt),
  status: order.status,
  totalCents: order.totalCents,
  currency: order.currency,
  trackingNumber: order.trackingNumber,
  note: order.note,
  items: order.items.map((item) => ({
    id: item.id,
    offerId: item.offerId,
    title: item.title,
    quantity: item.quantity,
    unitPriceCents: item.unitPriceCents,
    lineTotalCents: item.unitPriceCents * item.quantity,
    // Stored as the same `YYYY-MM` text the contract carries.
    expectedMonth: item.expectedMonth,
    imageUrl: item.imageUrl,
  })),
  createdAt: order.createdAt.toISOString(),
  updatedAt: order.updatedAt.toISOString(),
});
