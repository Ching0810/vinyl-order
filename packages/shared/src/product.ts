// Product contract shared by apps/web (rendering the catalog) and apps/api
// (DB persistence + request validation). One source of truth so storefront and
// API can't drift.
//
// A product is a record, tracked from a shop's listing (tracker.md §5.1). It
// has no price of its own: each shop's offer of it has one, and the demo
// store sells the shops' listings (§8). Money is integer cents to avoid
// floating-point rounding.
//
// Zod v4: string formats are top-level validators (`z.url()`, `z.uuid()`).
import { z } from 'zod';

/** A product as returned by the API and shown in the catalog. */
export const productSchema = z.object({
  id: z.uuid(),
  title: z.string(),
  /** The artist's display name (§5.7). */
  artist: z.string(),
  /** `YYYY-MM-DD`; often unknown — shops give a date mostly for pre-orders. */
  releaseDate: z.iso.date().nullable(),
  format: z.array(z.string()),
  /** What tells pressings of one album apart, e.g. "日版", "限量彩膠". */
  edition: z.string().nullable(),
  imageUrl: z.url().nullable(),
  /**
   * The lowest price among its offers that can be ordered (`isBuyable`: in
   * stock or pre-order), in minor units, for a card's "from NT$…" (§8); null
   * when none can be bought.
   */
  fromPriceCents: z.number().int().nullable(),
  /** ISO 4217 currency code of `fromPriceCents`, e.g. "TWD". */
  currency: z.string(),
});
export type Product = z.infer<typeof productSchema>;

/**
 * Admin "update product" body — every field optional, NO defaults (so a PATCH
 * only changes what's sent; an absent field is left untouched). Records are
 * made from a shop's listing, never by hand (§8): the admin corrects what was
 * read. Price, stock and artist aren't
 * here: a price belongs to an offer, an artist is edited as an artist.
 */
export const updateProductSchema = z.object({
  title: z.string().min(1).optional(),
  format: z.array(z.string()).optional(),
  edition: z.string().min(1).nullable().optional(),
  /** `YYYY-MM-DD`, or null when unknown. */
  releaseDate: z.iso.date().nullable().optional(),
  imageUrl: z.url().nullable().optional(),
});
export type UpdateProductInput = z.infer<typeof updateProductSchema>;
