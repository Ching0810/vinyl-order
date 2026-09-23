/**
 * A short, readable reference for an order: the first 8 characters of its
 * UUID, upper-cased (e.g. "3F9A1C2E").
 *
 * For display only — a customer can quote it, and it is plenty to tell their
 * own orders apart. It is not unique across the shop, so nothing looks an order
 * up by it; links and requests always use the full id.
 *
 * @param id - the order's UUID
 */
export const orderReference = (id: string): string => id.slice(0, 8).toUpperCase();
