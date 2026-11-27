import type { Supplier } from '@vinyl-order/shared';

import type { PrismaService } from '../prisma/prisma.service';

/** A listing as a split knows it (tracker.md §5.9). */
type ListingKey = { supplier: Supplier; externalId: string };

/**
 * Which of these listings the admin split out of their albums (§7.3), as a
 * test for each: one query, for grouping and for tracking alike.
 */
export const splitsAmong = async (
  prisma: Pick<PrismaService, 'albumSplit'>,
  listings: ListingKey[],
): Promise<(listing: ListingKey) => boolean> => {
  if (listings.length === 0) return () => false;
  const splits = await prisma.albumSplit.findMany({
    where: { OR: listings.map(({ supplier, externalId }) => ({ supplier, externalId })) },
    select: { supplier: true, externalId: true },
  });
  const split = new Set(splits.map(({ supplier, externalId }) => `${supplier}/${externalId}`));
  return ({ supplier, externalId }) => split.has(`${supplier}/${externalId}`);
};
