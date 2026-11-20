// Tracking contract shared by apps/web (the search page's "Track", the home
// page's list) and apps/api: each user's list of the listings they follow
// (docs/design/tracker.md §5.8). A listing is one version of an album at one
// shop, with its own price; records are shared, one per album holding every
// version's listings, and a list is the user's own, seen by no one else.
import { z } from 'zod';

import { availabilitySchema, offerSchema, productWithOffersSchema } from './offer';

/**
 * POST /watches — track one listing of an album. `catalogEntryIds` is every
 * listing of the album, best first, so its record holds them all and the
 * comparison is whole; `catalogEntryId` is the one tracked, among them.
 * `artistId` and `artistName` answer the questions making a record can ask
 * (409 ARTIST_AMBIGUOUS, 422 ARTIST_UNREAD), as on creating from a listing.
 */
export const trackListingSchema = z
  .object({
    catalogEntryId: z.uuid(),
    catalogEntryIds: z.array(z.uuid()).min(1).max(20),
    artistId: z.uuid().optional(),
    artistName: z.string().trim().min(1).max(200).optional(),
  })
  .refine((body) => body.catalogEntryIds.includes(body.catalogEntryId), {
    message: 'The listing tracked must be one of the album’s',
  });
export type TrackListingInput = z.infer<typeof trackListingSchema>;

/**
 * The album's record, the offer now tracked, and the album's other listings
 * that weren't attached to it, with why: tracked under another record
 * already, or a page that couldn't be read.
 */
export const trackListingResultSchema = z.object({
  product: productWithOffersSchema,
  offerId: z.uuid(),
  skipped: z.array(
    z.object({
      catalogEntryId: z.uuid(),
      reason: z.enum(['OFFER_ALREADY_TRACKED', 'SHOP_PAGE_UNREADABLE']),
    }),
  ),
});
export type TrackListingResult = z.infer<typeof trackListingResultSchema>;

/** One version on a user's list: its own price, and whether the album is cheaper elsewhere. */
export const watchedOfferSchema = z.object({
  offerId: z.uuid(),
  productId: z.uuid(),
  /** The album, as its record names it. */
  title: z.string(),
  artist: z.string(),
  /** The version's own cover, or the record's when it has none yet. */
  imageUrl: z.url().nullable(),
  /** The version, as its shop names it. */
  sourceTitle: z.string(),
  supplier: offerSchema.shape.supplier,
  url: z.url(),
  priceCents: z.number().int(),
  currency: z.string(),
  availability: availabilitySchema,
  /**
   * The album's lowest price below this one, among its other listings that
   * can be bought — in stock or on pre-order — and where; null when none is
   * lower. Another version, maybe: its title is on the record's page.
   */
  cheaperElsewhere: offerSchema
    .pick({ supplier: true, priceCents: true, currency: true })
    .nullable(),
  watchedAt: z.iso.datetime(),
});
export type WatchedOffer = z.infer<typeof watchedOfferSchema>;
