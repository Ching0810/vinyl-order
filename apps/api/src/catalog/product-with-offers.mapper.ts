import type {
  Artist as ArtistContract,
  Offer as OfferContract,
  ProductWithOffers,
} from '@vinyl-order/shared';

import type { Offer, Prisma } from '../generated/prisma/client';
import type { PrismaService } from '../prisma/prisma.service';
import type { ParsedOffer } from './supplier-adapter';

/** What the mapper reads: the record, its artist and aliases, its offers; oldest first. */
export const productWithOffersInclude = {
  artistRef: { include: { aliases: { orderBy: [{ createdAt: 'asc' }, { name: 'asc' }] } } },
  offers: { orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] },
} satisfies Prisma.ProductInclude;

type ProductRow = Prisma.ProductGetPayload<{ include: typeof productWithOffersInclude }>;

/**
 * A tracked record with its offers, or null. Only records created from a
 * shop have an artist row; the demo store's older ones aren't tracked, and
 * read as not found.
 */
export const findProductWithOffers = async (
  prisma: Pick<PrismaService, 'product' | 'catalogEntry'>,
  id: string,
): Promise<ProductWithOffers | null> => {
  const product = await prisma.product.findUnique({
    where: { id },
    include: productWithOffersInclude,
  });
  if (!product?.artistRef) return null;

  // Each offer's listing in the copied catalog, which the demo cart buys
  // (tracker.md §8): the same (supplier, externalId).
  const entries = await prisma.catalogEntry.findMany({
    where: {
      OR: product.offers.map(({ supplier, externalId }) => ({ supplier, externalId })),
    },
    select: { id: true, supplier: true, externalId: true },
  });
  const entryIdOf = (offer: Offer): string | null =>
    entries.find(
      (entry) => entry.supplier === offer.supplier && entry.externalId === offer.externalId,
    )?.id ?? null;

  return toProductWithOffers({ ...product, artistRef: product.artistRef }, entryIdOf);
};

const toProductWithOffers = (
  product: ProductRow & { artistRef: NonNullable<ProductRow['artistRef']> },
  entryIdOf: (offer: Offer) => string | null,
): ProductWithOffers => ({
  id: product.id,
  title: product.title,
  imageUrl: product.imageUrl,
  format: product.format,
  edition: product.edition,
  artist: toArtistContract(product.artistRef),
  offers: product.offers.map((offer) => toOfferContract(offer, entryIdOf(offer))),
});

/** An artist with its aliases, as the API returns one. */
export const toArtistContract = (artist: {
  id: string;
  name: string;
  aliases: { id: string; name: string }[];
}): ArtistContract => ({
  id: artist.id,
  name: artist.name,
  aliases: artist.aliases.map((alias) => ({ id: alias.id, name: alias.name })),
});

const toOfferContract = (offer: Offer, catalogEntryId: string | null): OfferContract => ({
  id: offer.id,
  supplier: offer.supplier,
  externalId: offer.externalId,
  catalogEntryId,
  url: offer.url,
  sourceTitle: offer.sourceTitle,
  imageUrl: offer.imageUrl,
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
  imageUrl: parsed.imageUrl,
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
