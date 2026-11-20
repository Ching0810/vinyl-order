// Catalog search contract shared by apps/web (the search page) and apps/api
// (query validation, response shaping).
//
// The catalog is each shop's listings copied into CatalogEntry by the sync
// (docs/design/tracker.md §7.2), and search runs on that copy, not on the
// shops (§7.1). A hit carries no price: the shops' catalogs have none (§4),
// and it comes with the product page once a listing is picked.
import { z } from 'zod';

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
 * One album found, with its listing at each shop that carries it (§7.3):
 * listings whose titles name the same artist and the same album, best match
 * first. A shop may list it twice — two pressings — and then has two.
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
  listings: z.array(catalogSearchHitSchema),
  /** The record that tracks it already, whoever added it; null if none. */
  productId: z.uuid().nullable(),
  /** Whether the signed-in user tracks that record. */
  watched: z.boolean(),
});
export type CatalogAlbum = z.infer<typeof catalogAlbumSchema>;
