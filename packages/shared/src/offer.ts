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

/**
 * What can be ordered now (§8): in stock, or a pre-order the shop still
 * takes — a closed one is read as sold out (§6.2).
 */
export const BUYABLE_AVAILABILITY = ['in_stock', 'pre_order'] as const satisfies Availability[];

/** Whether a listing or offer at this availability can be ordered now. */
export const isBuyable = (availability: string | null): boolean =>
  (BUYABLE_AVAILABILITY as readonly string[]).includes(availability ?? '');

export const offerSchema = z.object({
  id: z.uuid(),
  supplier: supplierSchema,
  /** The shop's own id for the listing, the last part of its URL. */
  externalId: z.string(),
  /**
   * The same listing in the shop's copied catalog — what the demo cart buys
   * (§8). Null when the catalog no longer lists it.
   */
  catalogEntryId: z.uuid().nullable(),
  url: z.url(),
  /** The shop's own name for the record, to check a match against. */
  sourceTitle: z.string(),
  /** This listing's own cover: two pressings look different. */
  imageUrl: z.url().nullable(),
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

/**
 * Who made a record, under every name the shops write them by (§5.7): the
 * name the site shows, and the aliases search and matching use, oldest
 * first. The name is always one of them.
 */
export const artistSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  aliases: z.array(z.object({ id: z.uuid(), name: z.string() })),
});
export type Artist = z.infer<typeof artistSchema>;

/** A name with a letter or digit in it: one of only punctuation matches nothing. */
const artistNameSchema = z
  .string()
  .trim()
  .min(1)
  .max(200)
  .regex(/[\p{L}\p{N}]/u, 'A name needs a letter or a digit');

/**
 * PATCH /admin/artists/:id — rename, add names, remove names, any together.
 * Renaming adds the new name as an alias; the alias that is the name can't
 * be removed (422 ARTIST_NAME_ALIAS). Removals go first, so one request can
 * swap a spelling.
 */
export const updateArtistSchema = z
  .object({
    name: artistNameSchema.optional(),
    addAliases: z.array(artistNameSchema).max(20).optional(),
    removeAliasIds: z.array(z.uuid()).max(50).optional(),
  })
  .refine(
    (body) =>
      body.name !== undefined ||
      (body.addAliases?.length ?? 0) > 0 ||
      (body.removeAliasIds?.length ?? 0) > 0,
    { message: 'Nothing to change' },
  );
export type UpdateArtistInput = z.infer<typeof updateArtistSchema>;

/** A record, its artist and every shop's offer, oldest offer first. */
export const productWithOffersSchema = z.object({
  id: z.uuid(),
  title: z.string(),
  imageUrl: z.url().nullable(),
  format: z.array(z.string()),
  edition: z.string().nullable(),
  artist: artistSchema,
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
 * POST /admin/products/:id/offers: the listing to attach — a candidate
 * picked (`catalogEntryId`) or a link pasted (`url`), exactly one.
 */
export const attachOfferSchema = z
  .object({
    catalogEntryId: z.uuid().optional(),
    url: z.url({ protocol: /^https$/ }).optional(),
  })
  .refine((body) => (body.catalogEntryId === undefined) !== (body.url === undefined), {
    message: 'Send a catalogEntryId or a url, not both',
  });
export type AttachOfferInput = z.infer<typeof attachOfferSchema>;

/**
 * The record with the offer attached, and the artist names that shop wrote
 * which the artist doesn't have yet: proposed, not added — kept or dropped
 * on the product page (§5.7).
 */
export const attachOfferResultSchema = z.object({
  product: productWithOffersSchema,
  proposedAliases: z.array(z.string()),
});
export type AttachOfferResult = z.infer<typeof attachOfferResultSchema>;

/**
 * Why creating a record, or attaching an offer, was refused — a
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
 * - `ARTIST_NAME_ALIAS` (422): the alias that is the artist's name can't be
 *   removed; rename the artist first.
 * - `REFRESH_TOO_SOON` (429): a record is read again at most every ten
 *   minutes; the body says in how many seconds (`retryAfterSeconds`).
 */
export const offerErrorCodeSchema = z.enum([
  'OFFER_ALREADY_TRACKED',
  'ARTIST_AMBIGUOUS',
  'ARTIST_UNREAD',
  'SHOP_NOT_SUPPORTED',
  'SHOP_PAGE_UNREADABLE',
  'ARTIST_NAME_ALIAS',
  'REFRESH_TOO_SOON',
]);
export type OfferErrorCode = z.infer<typeof offerErrorCodeSchema>;
