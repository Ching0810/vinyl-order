// Cart contract shared by apps/web (rendering the cart) and apps/api (DB
// persistence + request validation). One source of truth so storefront and API
// can't drift.
//
// A line is a listing in one shop's copied catalog (tracker.md §5.6, §8):
// whatever search finds can be bought, and the same album from two shops is
// two lines. The cart stores no prices. It records what was chosen; what it
// costs is read from the listing each time, as the shop's list pages were
// last read, so the total always reflects that read. The amount actually
// paid is snapshotted onto the order at checkout — that is where a frozen
// price belongs.
//
// Zod v4: string formats are top-level validators (`z.uuid()`).
import { z } from 'zod';

import { availabilitySchema } from './offer';
import { supplierSchema } from './supplier-order';

/** Upper bound on a single line, so a typo can't request 10,000 copies. */
const quantitySchema = z.number().int().min(1).max(99);

/**
 * The listing a line buys: what the cart shows of it, and what it's priced
 * and capped by — as the shop's last stock walk read them.
 */
export const cartListingSchema = z.object({
  id: z.uuid(),
  supplier: supplierSchema,
  /** The shop's own name for it, as written. */
  title: z.string(),
  /** The album, read from that title, without artist, format or notes. */
  album: z.string(),
  /** The artist, read from that title; null when it names none. */
  artist: z.string().nullable(),
  url: z.url(),
  imageUrl: z.url().nullable(),
  /** Null when the list pages showed none: it can't be ordered then. */
  priceCents: z.number().int().nullable(),
  currency: z.string(),
  /** Null until a stock walk has read it. */
  availability: availabilitySchema.nullable(),
  /**
   * Copies left to sell: the shop's count less what the demo's pending
   * orders hold, never below 0. Null when the shop gives no count — then
   * only the line's own limit caps it.
   */
  available: z.number().int().nullable(),
  /** When the shop's list pages were last read: the price and stock are as of this. */
  checkedAt: z.iso.datetime().nullable(),
});
export type CartListing = z.infer<typeof cartListingSchema>;

/**
 * One line in the cart. The listing is embedded because a line is unusable
 * without it — a row can't be rendered from an id and a quantity alone.
 */
export const cartItemSchema = z.object({
  id: z.uuid(),
  catalogEntryId: z.uuid(),
  quantity: quantitySchema,
  listing: cartListingSchema,
  /** quantity × the listing's price, for this line; 0 while it has none. */
  lineTotalCents: z.number().int(),
});
export type CartItem = z.infer<typeof cartItemSchema>;

/**
 * A user's cart.
 *
 * `subtotalCents` and `itemCount` are derived server-side rather than summed
 * in the browser: checkout has to agree with what the cart displayed, and two
 * implementations of "what this costs" are two chances to disagree. Being
 * derived, not stored, they can't go stale when a price changes.
 *
 * No cart id: every route is "the current user's cart", so the client never
 * needs one. That also lets GET return an empty cart without creating a row —
 * a read has no business writing.
 */
export const cartSchema = z.object({
  items: z.array(cartItemSchema),
  /** Sum of every line. Excludes shipping and tax, which don't exist yet. */
  subtotalCents: z.number().int(),
  /** Total copies across all lines — what the header badge shows. */
  itemCount: z.number().int(),
});
export type Cart = z.infer<typeof cartSchema>;

/**
 * POST /cart/items. Adding a listing already in the cart increments the
 * existing line rather than creating a second one.
 */
export const addCartItemSchema = z.object({
  catalogEntryId: z.uuid(),
  quantity: quantitySchema.default(1),
});
export type AddCartItemInput = z.infer<typeof addCartItemSchema>;

/**
 * PATCH /cart/items/:catalogEntryId. Sets an absolute quantity rather than a
 * delta, so a retried request is idempotent. Removing a line is DELETE, not a
 * quantity of zero — "none of this" and "remove this" are the same intent, and
 * one way to express it is enough.
 */
export const updateCartItemSchema = z.object({
  quantity: quantitySchema,
});
export type UpdateCartItemInput = z.infer<typeof updateCartItemSchema>;

/**
 * Why a cart write was refused (409).
 *
 * - OUT_OF_STOCK: the listing can't be bought — sold out, a pre-order, which
 *   the demo doesn't sell, or not yet read, with no price — or has no copies
 *   left to sell, so there is no quantity that could be put in the cart. A request for more copies than
 *   remain isn't an error: the line is capped at what's left, and the
 *   response carries the quantity that was actually set.
 *
 * A cart is an intention, so these caps are tidiness, not a guarantee — stock
 * can fall after a line is added, and checkout is what really decides.
 */
export const cartErrorCodeSchema = z.enum(['OUT_OF_STOCK']);
export type CartErrorCode = z.infer<typeof cartErrorCodeSchema>;
