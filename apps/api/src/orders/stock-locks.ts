/**
 * The one order every transaction locks catalog rows in.
 *
 * Checkout holds stock and cancelling releases it, each touching several
 * listings in one transaction. If both lock them in the same global order, two
 * transactions over the same listings queue behind each other; in opposite
 * orders, Postgres would find a deadlock and abort one. Sharing the comparator
 * keeps that ordering a rule rather than a coincidence.
 */
export const byCatalogEntryId = (
  a: { catalogEntryId: string },
  b: { catalogEntryId: string },
): number => a.catalogEntryId.localeCompare(b.catalogEntryId);
