import type { Availability } from '../generated/prisma/enums';

/**
 * One availability for every shop (tracker.md §6.2), from what its product
 * page says: whether it can be bought now, and whether it is a pre-order —
 * a flag, a tag or the title's "預購".
 *
 * Not buyable is sold out, pre-order or not: a pre-order the shop has
 * closed can't be ordered either.
 */
export const availabilityOf = (facts: { available: boolean; preOrder: boolean }): Availability => {
  if (!facts.available) return 'sold_out';
  return facts.preOrder ? 'pre_order' : 'in_stock';
};
