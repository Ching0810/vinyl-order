import type { Supplier, SupplierOrder, SupplierOrderStatus } from '@vinyl-order/shared';

/**
 * Each shop under the name it goes by. A Record over Supplier, so a shop added
 * to the shared enum fails the build here until it has a name.
 *
 * Proper names, so in Chinese even in the English UI: what the shop calls
 * itself is what a buyer recognises.
 */
export const SUPPLIER_LABEL: Record<Supplier, string> = {
  candlelight: '燭光唱片',
  tht: 'THT唱片',
  cosmic: 'CM唱片',
  rotten_blues: '爛調唱片',
};

/**
 * Label and colour per status, for its badge and its group's heading. A
 * Record, so a new status fails the build until it has both.
 */
export const SUPPLIER_ORDER_STATUS: Record<
  SupplierOrderStatus,
  { label: string; palette: string }
> = {
  ordered: { label: 'Ordered', palette: 'gray' },
  preparing: { label: 'Preparing', palette: 'orange' },
  shipped: { label: 'Shipped', palette: 'blue' },
  ready_for_pickup: { label: 'Ready for pickup', palette: 'purple' },
  delivered: { label: 'Delivered', palette: 'green' },
  cancelled: { label: 'Cancelled', palette: 'red' },
};

/**
 * Where each status's group sits on the page, top first. What waits at a
 * store comes first, since it is the one that asks something of me
 * (tracker.md §9.2); then the other open orders, nearest to arriving first:
 * what's on its way, then what the shop confirmed, then what's only placed;
 * then finished ones.
 *
 * A Record over SupplierOrderStatus, so a new status needs a place here.
 */
const GROUP_RANK: Record<SupplierOrderStatus, number> = {
  ready_for_pickup: 0,
  shipped: 1,
  preparing: 2,
  ordered: 3,
  delivered: 4,
  cancelled: 5,
};

/** Statuses whose orders are still to arrive, so an expected month matters. */
const isOpen = (status: SupplierOrderStatus): boolean => GROUP_RANK[status] < GROUP_RANK.delivered;

/**
 * The earliest expected month among an order's lines, or null if none has
 * one. `YYYY-MM` sorts as text, so no Date is needed.
 */
export const nextExpectedMonth = (order: SupplierOrder): string | null =>
  order.items
    .map((item) => item.expectedMonth)
    .filter((month): month is string => month !== null)
    .sort()[0] ?? null;

/** Newest order first; id keeps orders placed the same day in a stable order. */
const byOrderedAtDesc = (a: SupplierOrder, b: SupplierOrder): number =>
  b.orderedAt.localeCompare(a.orderedAt) || a.id.localeCompare(b.id);

/**
 * Soonest expected first, so the next arrival is on top; orders with no month
 * yet go last, since nothing says they are coming soon. Within one month,
 * newest order first.
 */
const byNextExpected = (a: SupplierOrder, b: SupplierOrder): number => {
  const [monthA, monthB] = [nextExpectedMonth(a), nextExpectedMonth(b)];
  if (monthA !== monthB) {
    if (monthA === null) return 1;
    if (monthB === null) return -1;
    return monthA.localeCompare(monthB);
  }
  return byOrderedAtDesc(a, b);
};

export type SupplierOrderGroup = { status: SupplierOrderStatus; orders: SupplierOrder[] };

/**
 * The page's sections (tracker.md §9.2): one per status that has orders, in
 * GROUP_RANK order. Open groups sort by next expected month; finished ones by
 * when they were ordered, since their expected months are past.
 *
 * Pure and separate from the component, so the rule reads in one place.
 *
 * @param orders - the user's orders, in any order
 */
export const groupByStatus = (orders: SupplierOrder[]): SupplierOrderGroup[] => {
  const groups = new Map<SupplierOrderStatus, SupplierOrder[]>();
  for (const order of orders) {
    groups.set(order.status, [...(groups.get(order.status) ?? []), order]);
  }

  return [...groups.entries()]
    .sort(([a], [b]) => GROUP_RANK[a] - GROUP_RANK[b])
    .map(([status, group]) => {
      const order = isOpen(status) ? byNextExpected : byOrderedAtDesc;
      return { status, orders: group.toSorted(order) };
    });
};
