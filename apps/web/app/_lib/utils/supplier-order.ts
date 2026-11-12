import type {
  Supplier,
  SupplierOrder,
  SupplierOrderItem,
  SupplierOrderStatus,
} from '@vinyl-order/shared';

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

/**
 * What tells the user each shop's order has moved on (tracker.md §9.5), as
 * the end of "Mark … when …". Every step is by hand until the import reads
 * that notice; then its entry changes, so the page never promises an update
 * that won't come.
 *
 * - shipped: null where the shop sends no shipping notice, so the hint skips
 *   straight to the parcel reaching the store.
 * - arrived: what says it is at the convenience store.
 */
const NEXT_SIGNAL: Record<Supplier, { shipped: string | null; arrived: string }> = {
  tht: {
    shipped: 'THT emails that it has shipped',
    arrived: 'the convenience store texts you (THT sends no email for it)',
  },
  cosmic: {
    shipped: 'CM ships it',
    arrived: 'the convenience store texts you (CM sends no email for it)',
  },
  rotten_blues: {
    shipped: "Rotten Blues emails that it's on its way",
    arrived: 'Rotten Blues emails that it has arrived (已送達)',
  },
  candlelight: {
    shipped: null,
    arrived: 'PayNow emails that it has reached the store',
  },
};

/**
 * What the user does next for an order, shown on its card, or null once
 * there is nothing left to do.
 *
 * @param order - the order, open or finished
 */
export const nextStepHint = (order: SupplierOrder): string | null => {
  const signal = NEXT_SIGNAL[order.supplier];
  switch (order.status) {
    case 'ordered':
    case 'preparing':
      if (signal.shipped) return `Mark Shipped when ${signal.shipped}.`;
      return `Mark Ready for pickup when ${signal.arrived}.`;
    case 'shipped':
      return `Mark Ready for pickup when ${signal.arrived}.`;
    case 'ready_for_pickup':
      return 'Pick it up, then mark Delivered.';
    case 'delivered':
    case 'cancelled':
      return null;
  }
};

/** Unpaid: no payment day, and not cancelled — a cancelled order is owed nothing. */
export const isUnpaid = (order: SupplierOrder): boolean =>
  order.paidAt === null && order.status !== 'cancelled';

/** Statuses whose orders are still to arrive, so an expected month matters. */
const isOpen = (status: SupplierOrderStatus): boolean => GROUP_RANK[status] < GROUP_RANK.delivered;

/**
 * When the whole order is expected: the latest month among its lines, or
 * null if none has one (tracker.md §5.5). An order ships as one parcel —
 * one status, one tracking number — so it waits for its last record; the
 * soonest month would promise it early. `YYYY-MM` sorts as text, so no Date
 * is needed.
 */
const orderExpectedMonth = (order: SupplierOrder): string | null =>
  order.items
    .map((item) => item.expectedMonth)
    .filter((month): month is string => month !== null)
    .sort()
    .at(-1) ?? null;

/**
 * The expected month a card shows beside one of its records: the record's
 * own, so each one's promise is seen, while the order is still to arrive.
 * Once delivered or cancelled it is past telling, so none.
 *
 * @param order - the order the record is in
 * @param item - one of its records
 */
export const shownExpectedMonth = (order: SupplierOrder, item: SupplierOrderItem): string | null =>
  isOpen(order.status) ? item.expectedMonth : null;

/** Newest order first; id keeps orders placed the same day in a stable order. */
const byOrderedAtDesc = (a: SupplierOrder, b: SupplierOrder): number =>
  b.orderedAt.localeCompare(a.orderedAt) || a.id.localeCompare(b.id);

/**
 * Soonest expected order first, so the next arrival is on top; orders with no
 * month yet go last, since nothing says they are coming soon. Within one
 * month, newest order first.
 */
const byExpected = (a: SupplierOrder, b: SupplierOrder): number => {
  const [monthA, monthB] = [orderExpectedMonth(a), orderExpectedMonth(b)];
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
 * GROUP_RANK order. Open groups sort by the order's expected month;
 * finished ones by when they were ordered, since their expected months are
 * past.
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
      const order = isOpen(status) ? byExpected : byOrderedAtDesc;
      return { status, orders: group.toSorted(order) };
    });
};

/**
 * The list's status filter, in order. "Not shipped" joins ordered and
 * preparing: both are still with the shop. Each choice's statuses are all
 * open or all finished, so one sort fits it.
 */
export const STATUS_FILTERS = [
  { value: 'all', label: 'All statuses', statuses: null },
  { value: 'pickup', label: 'To pick up', statuses: ['ready_for_pickup'] },
  { value: 'shipped', label: 'Shipped', statuses: ['shipped'] },
  { value: 'not_shipped', label: 'Not shipped', statuses: ['ordered', 'preparing'] },
  { value: 'delivered', label: 'Delivered', statuses: ['delivered'] },
  { value: 'cancelled', label: 'Cancelled', statuses: ['cancelled'] },
] as const satisfies readonly {
  value: string;
  label: string;
  statuses: readonly SupplierOrderStatus[] | null;
}[];

export type StatusFilter = (typeof STATUS_FILTERS)[number]['value'];

/**
 * The status filter a `?status=` value names; "all" for none, or for one
 * that isn't a choice (an old or mistyped link), rather than an empty page.
 *
 * @param value - the query parameter, or null when absent
 */
export const toStatusFilter = (value: string | null): StatusFilter =>
  STATUS_FILTERS.find((filter) => filter.value === value)?.value ?? 'all';

/** The list's shop filter: one shop, or all of them. */
export type SupplierFilter = Supplier | 'all';

/**
 * The shop a `?shop=` value names; "all" for none or an unknown one.
 *
 * @param value - the query parameter, or null when absent
 */
export const toSupplierFilter = (value: string | null): SupplierFilter =>
  (Object.keys(SUPPLIER_LABEL) as Supplier[]).find((supplier) => supplier === value) ?? 'all';

/**
 * The orders in one status filter, sorted as groupByStatus sorts a group:
 * open ones by expected month, finished ones newest first. Not for "all",
 * which is shown grouped.
 *
 * @param orders - the user's orders, in any order
 * @param statuses - the filter's statuses
 */
export const ordersWithStatus = (
  orders: SupplierOrder[],
  statuses: readonly SupplierOrderStatus[],
): SupplierOrder[] =>
  orders
    .filter((order) => statuses.includes(order.status))
    .toSorted(isOpen(statuses[0]) ? byExpected : byOrderedAtDesc);

/**
 * The orders at one shop, or all of them.
 *
 * @param orders - the user's orders
 * @param supplier - the shop filter
 */
export const ordersAtShop = (orders: SupplierOrder[], supplier: SupplierFilter): SupplierOrder[] =>
  supplier === 'all' ? orders : orders.filter((order) => order.supplier === supplier);

/**
 * How many orders a pair of filters leaves — for a filter's choices, and
 * for what a drawer's choices would show before they are applied.
 *
 * @param orders - the user's orders
 * @param status - the status filter
 * @param supplier - the shop filter
 */
export const countOrders = (
  orders: SupplierOrder[],
  status: StatusFilter,
  supplier: SupplierFilter,
): number => {
  const atShop = ordersAtShop(orders, supplier);
  const { statuses } = STATUS_FILTERS.find((filter) => filter.value === status)!;
  return statuses ? ordersWithStatus(atShop, statuses).length : atShop.length;
};
