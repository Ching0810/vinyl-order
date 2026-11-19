import type { Offer as OfferContract, ProductWithOffers } from '@vinyl-order/shared';

import type { Offer, Prisma } from '../generated/prisma/client';
import type { PrismaService } from '../prisma/prisma.service';
import type { ParsedOffer } from './supplier-adapter';

/** What the mapper reads: the record, its artist, its offers oldest first. */
export const productWithOffersInclude = {
  artistRef: true,
  offers: { orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] },
} satisfies Prisma.ProductInclude;

type ProductRow = Prisma.ProductGetPayload<{ include: typeof productWithOffersInclude }>;

/**
 * A tracked record with its offers, or null. Only records created from a
 * shop have an artist row; the demo store's older ones aren't tracked, and
 * read as not found.
 */
export const findProductWithOffers = async (
  prisma: Pick<PrismaService, 'product'>,
  id: string,
): Promise<ProductWithOffers | null> => {
  const product = await prisma.product.findUnique({
    where: { id },
    include: productWithOffersInclude,
  });
  return product?.artistRef
    ? toProductWithOffers({ ...product, artistRef: product.artistRef })
    : null;
};

const toProductWithOffers = (
  product: ProductRow & { artistRef: NonNullable<ProductRow['artistRef']> },
): ProductWithOffers => ({
  id: product.id,
  title: product.title,
  imageUrl: product.imageUrl,
  format: product.format,
  edition: product.edition,
  artist: { id: product.artistRef.id, name: product.artistRef.name },
  offers: product.offers.map(toOfferContract),
});

const toOfferContract = (offer: Offer): OfferContract => ({
  id: offer.id,
  supplier: offer.supplier,
  externalId: offer.externalId,
  url: offer.url,
  sourceTitle: offer.sourceTitle,
  priceCents: offer.priceCents,
  currency: offer.currency,
  availability: offer.availability,
  stockQty: offer.stockQty,
  expectedAt: offer.expectedAt ? offer.expectedAt.toISOString().slice(0, 10) : null,
  lastCheckedAt: offer.lastCheckedAt.toISOString(),
  lastErrorAt: offer.lastErrorAt?.toISOString() ?? null,
  lastError: offer.lastError,
});

/**
 * An offer's columns as a read of the shop's page sets them. A `@db.Date`
 * takes midnight UTC, so the day stays the one the shop wrote.
 */
export const offerValuesOf = (parsed: ParsedOffer) => ({
  url: parsed.url,
  sourceTitle: parsed.sourceTitle,
  priceCents: parsed.priceCents,
  currency: parsed.currency,
  availability: parsed.availability,
  stockQty: parsed.stockQty,
  expectedAt: parsed.expectedAt ? new Date(`${parsed.expectedAt}T00:00:00Z`) : null,
});

/** The columns a snapshot keeps (tracker.md §5.3), from an offer's values. */
export const snapshotOf = (values: ReturnType<typeof offerValuesOf>) => ({
  priceCents: values.priceCents,
  availability: values.availability,
  stockQty: values.stockQty,
  expectedAt: values.expectedAt,
});
