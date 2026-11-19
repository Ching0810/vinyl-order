import type { Prisma } from '../generated/prisma/client';

/**
 * The demo store reads a record's own `priceCents` until step 5 drops it
 * (tracker.md §14): kept at its first offer's, oldest first, whenever the
 * offers change. A record with none keeps what it had.
 */
export const syncDemoPrice = async (
  prisma: Pick<Prisma.TransactionClient, 'offer' | 'product'>,
  productId: string,
): Promise<void> => {
  const first = await prisma.offer.findFirst({
    where: { productId },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    select: { priceCents: true, currency: true },
  });
  if (!first) return;
  await prisma.product.update({ where: { id: productId }, data: first });
};
