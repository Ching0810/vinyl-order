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
 * Where each status's group sits on the page, top first. Open orders before
 * finished ones, and among the open, the nearest to arriving first: what's on
 * its way, then what the shop confirmed, then what's only placed.
 *
 * A Record over SupplierOrderStatus, so a new status needs a place here.
 */
const GROUP_RANK: Record<SupplierOrderStatus, number> = {
  shipped: 0,
  preparing: 1,
  ordered: 2,
  delivered: 3,
  cancelled: 4,
};

/** Statuses whose orders are still to arrive, so an expected date matters. */
const isOpen = (status: SupplierOrderStatus): boolean => GROUP_RANK[status] < GROUP_RANK.delivered;

/**
 * The earliest expected date among an order's lines, or null if none has one.
 * `YYYY-MM-DD` sorts as text, so no Date is needed.
 */
export const nextExpectedAt = (order: SupplierOrder): string | null =>
  order.items
    .map((item) => item.expectedAt)
    .filter((day): day is string => day !== null)
    .sort()[0] ?? null;

/** Newest order first; id keeps orders placed the same day in a stable order. */
const byOrderedAtDesc = (a: SupplierOrder, b: SupplierOrder): number =>
  b.orderedAt.localeCompare(a.orderedAt) || a.id.localeCompare(b.id);

/**
 * Soonest expected first, so the next arrival is on top; orders with no date
 * yet go last, since nothing says they are coming soon.
 */
const byNextExpected = (a: SupplierOrder, b: SupplierOrder): number => {
  const [dayA, dayB] = [nextExpectedAt(a), nextExpectedAt(b)];
  if (dayA !== dayB) {
    if (dayA === null) return 1;
    if (dayB === null) return -1;
    return dayA.localeCompare(dayB);
  }
  return byOrderedAtDesc(a, b);
};

export type SupplierOrderGroup = { status: SupplierOrderStatus; orders: SupplierOrder[] };

/**
 * The page's sections (tracker.md §9.2): one per status that has orders, in
 * GROUP_RANK order. Open groups sort by next expected date; finished ones by
 * when they were ordered, since their expected dates are past.
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
