// Category contract shared by apps/web (rendering the tab bar) and apps/api
// (DB persistence + request validation). One source of truth so storefront and
// API can't drift.
//
// A category is a curated storefront navigation tab, not a property of a
// record. It is deliberately separate from Product.genres, which is descriptive
// metadata imported from Discogs — a Mandarin pop record is "Pop" to Discogs
// with nothing marking it 華語.
//
// Zod v4: string formats are top-level validators (`z.uuid()`).
import { z } from 'zod';

/**
 * Slugs are the tab's public identity — they appear in URLs
 * (/products?category=mandarin) and must stay stable when `name` is edited.
 * Restricting the shape here stops a display label being pasted into the slug
 * and producing an un-linkable tab.
 */
const slugSchema = z
  .string()
  .min(1)
  .max(40)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Use lowercase letters, numbers and single hyphens');

/** A category as returned by the API. */
export const categorySchema = z.object({
  id: z.uuid(),
  slug: slugSchema,
  /** Display label, e.g. "華語". Free to change without breaking links. */
  name: z.string().min(1),
  /** Ascending position in the tab bar. */
  sortOrder: z.number().int(),
  /**
   * How many products are filed here. Present on the list read so the admin
   * can see what a category holds before deleting it — removing one cascades
   * its assignments, and 96 silent unassignments should not be a surprise.
   */
  productCount: z.number().int().optional(),
});
export type Category = z.infer<typeof categorySchema>;

/** Admin "create category" body. */
export const createCategorySchema = z.object({
  slug: slugSchema,
  name: z.string().min(1).max(60),
  sortOrder: z.number().int().default(0),
});
export type CreateCategoryInput = z.infer<typeof createCategorySchema>;

/**
 * Admin "update category" body — every field optional, NO defaults, so a PATCH
 * only changes what it sends. `slug` is editable but doing so breaks existing
 * links, which is the trade for it being the URL identity.
 */
export const updateCategorySchema = z.object({
  slug: slugSchema.optional(),
  name: z.string().min(1).max(60).optional(),
  sortOrder: z.number().int().optional(),
});
export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>;
