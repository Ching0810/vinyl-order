// Product contract shared by apps/web (rendering the catalog) and apps/api
// (DB persistence + request validation). One source of truth so storefront and
// API can't drift.
//
// A product is a vinyl record the store sells. Metadata is usually imported from
// Discogs (see ./discogs DiscogsLookupResult), but price/stock/image are owned
// by us. Money is integer cents to avoid floating-point rounding.
//
// Zod v4: string formats are top-level validators (`z.url()`, `z.uuid()`).
import { z } from 'zod';

/** A product as returned by the API and shown in the catalog. */
export const productSchema = z.object({
  id: z.uuid(),
  /** The Discogs release this was imported from, if any. */
  discogsReleaseId: z.number().int().nullable(),
  title: z.string(),
  artist: z.string(),
  year: z.number().int().nullable(),
  genres: z.array(z.string()),
  format: z.array(z.string()),
  imageUrl: z.url().nullable(),
  /** Price in minor units (e.g. cents). Divide by 100 to display. */
  priceCents: z.number().int(),
  /** ISO 4217 currency code, e.g. "TWD". */
  currency: z.string(),
  stock: z.number().int(),
  /** Featured in the storefront "hot" section. */
  isHot: z.boolean(),
});
export type Product = z.infer<typeof productSchema>;

/**
 * Admin "create product" body. Defaults fill the fields a Discogs import or a
 * sparse form may omit. `priceCents` is required — the store must price it.
 */
export const createProductSchema = z.object({
  discogsReleaseId: z.number().int().nullable().optional(),
  title: z.string().min(1),
  artist: z.string().min(1),
  year: z.number().int().nullable().optional(),
  genres: z.array(z.string()).default([]),
  format: z.array(z.string()).default([]),
  imageUrl: z.url().nullable().optional(),
  priceCents: z.number().int().nonnegative(),
  currency: z.string().min(1).default('TWD'),
  stock: z.number().int().nonnegative().default(0),
  isHot: z.boolean().default(false),
});
export type CreateProductInput = z.infer<typeof createProductSchema>;

/**
 * Admin "update product" body — every field optional, NO defaults (so a PATCH
 * only changes what's sent; an absent field is left untouched).
 */
export const updateProductSchema = z.object({
  discogsReleaseId: z.number().int().nullable().optional(),
  title: z.string().min(1).optional(),
  artist: z.string().min(1).optional(),
  year: z.number().int().nullable().optional(),
  genres: z.array(z.string()).optional(),
  format: z.array(z.string()).optional(),
  imageUrl: z.url().nullable().optional(),
  priceCents: z.number().int().nonnegative().optional(),
  currency: z.string().min(1).optional(),
  stock: z.number().int().nonnegative().optional(),
  isHot: z.boolean().optional(),
});
export type UpdateProductInput = z.infer<typeof updateProductSchema>;
