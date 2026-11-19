// Catalog search contract shared by apps/web (the admin search page) and
// apps/api (query validation, response shaping).
//
// The catalog is each shop's listings copied into CatalogEntry by the sync
// (docs/design/tracker.md §7.2), and search runs on that copy, not on the
// shops (§7.1). A hit carries no price: the shops' catalogs have none (§4),
// and it comes with the product page once a listing is picked.
import { z } from 'zod';

import { supplierSchema } from './supplier-order';

/**
 * GET /admin/catalog/search's query. Without `supplier`, every shop is
 * searched at once, which shows who carries a record; with it, one shop is,
 * as when picking the shop a product is created from (§7.3).
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

/** One listing found, as the shop names it. */
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
