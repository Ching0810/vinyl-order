// Tracking contract shared by apps/web (the search page's "Track", the home
// page's list) and apps/api: each user's list of the records they follow
// (docs/design/tracker.md §5.8). Records are shared, one per album; a list
// is the user's own, seen by no one else.
import { z } from 'zod';

import { offerSchema, productWithOffersSchema } from './offer';

/**
 * POST /watches — track an album: its listings, one per shop, best first.
 * The first is what a new record is made from; the rest are attached to it.
 * `artistId` and `artistName` answer the questions creating it can ask
 * (409 ARTIST_AMBIGUOUS, 422 ARTIST_UNREAD), as on creating from a listing.
 */
export const trackAlbumSchema = z.object({
  catalogEntryIds: z.array(z.uuid()).min(1).max(4),
  artistId: z.uuid().optional(),
  artistName: z.string().trim().min(1).max(200).optional(),
});
export type TrackAlbumInput = z.infer<typeof trackAlbumSchema>;

/**
 * The record tracked, and the listings that weren't attached to it, with
 * why: tracked under another record already, or a page that couldn't be read.
 */
export const trackAlbumResultSchema = z.object({
  product: productWithOffersSchema,
  skipped: z.array(
    z.object({
      catalogEntryId: z.uuid(),
      reason: z.enum(['OFFER_ALREADY_TRACKED', 'SHOP_PAGE_UNREADABLE']),
    }),
  ),
});
export type TrackAlbumResult = z.infer<typeof trackAlbumResultSchema>;

/** One record on a user's list, with what its comparison comes to. */
export const watchedProductSchema = z.object({
  productId: z.uuid(),
  title: z.string(),
  artist: z.string(),
  imageUrl: z.url().nullable(),
  /**
   * The lowest price among offers that can be bought — in stock or on
   * pre-order — and where; null when none can.
   */
  lowest: offerSchema.pick({ supplier: true, priceCents: true, currency: true }).nullable(),
  /** How many shops it's tracked at. */
  shops: z.number().int(),
  watchedAt: z.iso.datetime(),
});
export type WatchedProduct = z.infer<typeof watchedProductSchema>;
