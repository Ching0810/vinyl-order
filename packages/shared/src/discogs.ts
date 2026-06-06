// Discogs lookup contract — used only by the admin import flow to prefill the
// product form from a Discogs search/release. Distinct from our own Product
// (which adds uuid id, price, stock). The API maps raw Discogs data into this.
//
// Zod v4: string formats are top-level validators (`z.url()`).
import { z } from 'zod';

/** One Discogs release result, normalized for prefilling the admin form. */
export const discogsLookupResultSchema = z.object({
  /** Discogs release id (numeric) — stored on Product.discogsReleaseId. */
  id: z.number().int(),
  title: z.string(),
  artist: z.string(),
  year: z.number().int().nullable(),
  coverImage: z.url().nullable(),
  thumb: z.url().nullable(),
  format: z.array(z.string()),
  genres: z.array(z.string()),
});
export type DiscogsLookupResult = z.infer<typeof discogsLookupResultSchema>;
