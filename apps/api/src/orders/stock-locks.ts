/**
 * The one order every transaction locks product rows in.
 *
 * Checkout takes stock and cancelling returns it, each touching several
 * products in one transaction. If both lock them in the same global order, two
 * transactions over the same records queue behind each other; in opposite
 * orders, Postgres would find a deadlock and abort one. Sharing the comparator
 * keeps that ordering a rule rather than a coincidence.
 */
export const byProductId = (a: { productId: string }, b: { productId: string }): number =>
  a.productId.localeCompare(b.productId);
