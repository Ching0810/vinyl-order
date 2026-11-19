// Offers contract shared by apps/web (the product page's comparison) and
// apps/api: a record, and each shop's listing of it (docs/design/tracker.md
// §5.1, §5.2).
//
// An offer is what one shop says about the record — price, availability,
// stock, expected date — as last read from its page. What a shop doesn't
// publish is null, never a guess. `lastCheckedAt` is how fresh it is; a
// refresh that failed keeps the last good values and says so in `lastError`.
import { z } from 'zod';

import { supplierSchema } from './supplier-order';

export const availabilitySchema = z.enum(['in_stock', 'pre_order', 'sold_out']);
export type Availability = z.infer<typeof availabilitySchema>;

export const offerSchema = z.object({
  id: z.uuid(),
  supplier: supplierSchema,
  /** The shop's own id for the listing, the last part of its URL. */
  externalId: z.string(),
  url: z.url(),
  /** The shop's own name for the record, to check a match against. */
  sourceTitle: z.string(),
  priceCents: z.number().int(),
  currency: z.string(),
  availability: availabilitySchema,
  /** The shop's count; null when it doesn't say. */
  stockQty: z.number().int().nullable(),
  /** `YYYY-MM-DD`: a release or restock date the shop gave. */
  expectedAt: z.iso.date().nullable(),
  lastCheckedAt: z.iso.datetime(),
  lastErrorAt: z.iso.datetime().nullable(),
  /** Why the last refresh failed, as a short phrase; null once one succeeds. */
  lastError: z.string().nullable(),
});
export type Offer = z.infer<typeof offerSchema>;

/** A record, its artist and every shop's offer, oldest offer first. */
export const productWithOffersSchema = z.object({
  id: z.uuid(),
  title: z.string(),
  imageUrl: z.url().nullable(),
  format: z.array(z.string()),
  edition: z.string().nullable(),
  artist: z.object({ id: z.uuid(), name: z.string() }),
  offers: z.array(offerSchema),
});
export type ProductWithOffers = z.infer<typeof productWithOffersSchema>;

/**
 * POST /admin/products/from-catalog: the listing a record is created from.
 * `artistId` picks the artist when the listing's names belong to more than
 * one (409 ARTIST_AMBIGUOUS); `artistName` names one when its title gives
 * none (422 ARTIST_UNREAD).
 */
export const createProductFromCatalogSchema = z.object({
  catalogEntryId: z.uuid(),
  artistId: z.uuid().optional(),
  artistName: z.string().trim().min(1).max(200).optional(),
});
export type CreateProductFromCatalogInput = z.infer<typeof createProductFromCatalogSchema>;

/**
 * Why creating a record from a listing, or refreshing one, was refused — a
 * code so the page can branch without matching on text.
 *
 * - `OFFER_ALREADY_TRACKED` (409): the listing is already an offer; the body
 *   has its `productId`, to open instead.
 * - `ARTIST_AMBIGUOUS` (409): the listing's names belong to more than one
 *   artist; the body lists them as `artists`, to pick one as `artistId`.
 * - `ARTIST_UNREAD` (422): no artist could be read from the title; send
 *   `artistName`.
 * - `SHOP_NOT_SUPPORTED` (422): no adapter reads this shop yet.
 * - `SHOP_PAGE_UNREADABLE` (502): the shop's page couldn't be fetched or read.
 */
export const offerErrorCodeSchema = z.enum([
  'OFFER_ALREADY_TRACKED',
  'ARTIST_AMBIGUOUS',
  'ARTIST_UNREAD',
  'SHOP_NOT_SUPPORTED',
  'SHOP_PAGE_UNREADABLE',
]);
export type OfferErrorCode = z.infer<typeof offerErrorCodeSchema>;
