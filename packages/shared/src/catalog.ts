// Catalog search contract shared by apps/web (the search page) and apps/api
// (query validation, response shaping).
//
// The catalog is each shop's listings copied into CatalogEntry by the sync
// (docs/design/tracker.md §7.2), and search runs on that copy, not on the
// shops (§7.1). A hit carries no price: the shops' catalogs have none (§4),
// and it comes with the product page once a listing is picked.
import { z } from 'zod';

import { availabilitySchema } from './offer';
import { supplierSchema } from './supplier-order';

/**
 * GET /catalog/search's query. Without `supplier`, every shop is searched at
 * once, which shows who carries a record; with it, one shop is.
 *
 * New vinyl unless asked: used records and other goods (CDs, books) are in
 * the copy, flagged, and shown only when the search says so (§7.2).
 */
export const catalogSearchQuerySchema = z.object({
  // Under two characters matches almost everything; a two-character name
  // (`珍妮`) is still a real search.
  q: z.string().trim().min(2).max(100),
  supplier: supplierSchema.optional(),
  used: z.stringbool().default(false),
  nonVinyl: z.stringbool().default(false),
});
export type CatalogSearchQuery = z.infer<typeof catalogSearchQuerySchema>;

/** One listing, as the shop names it: a search hit, or a candidate (§7.3). */
export const catalogSearchHitSchema = z.object({
  id: z.uuid(),
  supplier: supplierSchema,
  url: z.url(),
  title: z.string(),
  imageUrl: z.url().nullable(),
  isVinyl: z.boolean(),
  isUsed: z.boolean(),
  /**
   * How well the query matches the title, 0 to 1: 1 when every trigram of
   * the query is found in one stretch of it. Hits come best first.
   */
  score: z.number(),
});
export type CatalogSearchHit = z.infer<typeof catalogSearchHitSchema>;

/**
 * Whether a listing can be bought, as far as search knows (§7.2, §12.3): the
 * newer of its record's offer, read from the product page, and the copied
 * catalog, read from the shop's list pages. A listing neither has read is a
 * pre-order if its title says so, and otherwise `unknown` — never guessed.
 */
export const listingAvailabilitySchema = z.enum([...availabilitySchema.options, 'unknown']);
export type ListingAvailability = z.infer<typeof listingAvailabilitySchema>;

/**
 * One listing of an album found: a version at a shop, whether I track it,
 * and its price and stock as of `checkedAt`.
 */
export const catalogAlbumListingSchema = catalogSearchHitSchema.extend({
  watched: z.boolean(),
  availability: listingAvailabilitySchema,
  /** Null until read. */
  priceCents: z.number().int().nullable(),
  currency: z.string(),
  /** The shop's count, when it keeps one. */
  stockQty: z.number().int().nullable(),
  /** When the values were read; null when nothing has read them. */
  checkedAt: z.iso.datetime().nullable(),
});
export type CatalogAlbumListing = z.infer<typeof catalogAlbumListingSchema>;

/**
 * One album found, with every listing of it (§7.3): listings whose titles
 * name the same artist and the same album, best match first. Each is one
 * version at one shop — a shop listing two pressings has two — and is what
 * a member tracks.
 */
export const catalogAlbumSchema = z.object({
  /** Stable for the list: the best listing's id. */
  key: z.uuid(),
  /** As the best listing's title names them; null when it names none. */
  artist: z.string().nullable(),
  title: z.string(),
  /** The first listing's cover that has one. */
  imageUrl: z.url().nullable(),
  /** The best listing's score. */
  score: z.number(),
  listings: z.array(catalogAlbumListingSchema),
  /** The record holding the album's listings already, whoever added it; null if none. */
  productId: z.uuid().nullable(),
});
export type CatalogAlbum = z.infer<typeof catalogAlbumSchema>;

/**
 * A listing popular at its shop (GET /catalog/popular): among what its
 * home page features — Cosmic's slideshow, THT's featured row, Rotten
 * Blues' rows of picks — as
 * the shop names and prices it. The home page's section when nothing is
 * searched. From the shops' public pages only: nothing in it says what
 * anyone tracks.
 */
export const popularListingSchema = catalogSearchHitSchema
  .omit({ score: true, isVinyl: true, isUsed: true })
  .extend({
    priceCents: z.number().int(),
    currency: z.string(),
    availability: availabilitySchema.exclude(['sold_out']),
    /** The artist and album its title names, to search for it by. */
    searchQuery: z.string(),
    /** Its place among its shop's features, 1 first. */
    rank: z.number().int(),
  });
export type PopularListing = z.infer<typeof popularListingSchema>;
