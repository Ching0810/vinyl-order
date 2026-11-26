// Cart contract shared by apps/web (rendering the cart) and apps/api (DB
// persistence + request validation). One source of truth so storefront and API
// can't drift.
//
// A line is one shop's version of a record — an offer (tracker.md §5.6, §8):
// the same record from two shops is two lines. The cart stores no prices. It
// records what was chosen; what it costs is read from the offer each time, as
// the shop's page was last read, so the total always reflects that read. The
// amount actually paid is snapshotted onto the order at checkout — that is
// where a frozen price belongs.
//
// Zod v4: string formats are top-level validators (`z.uuid()`).
import { z } from 'zod';

import { availabilitySchema } from './offer';
import { supplierSchema } from './supplier-order';

/** Upper bound on a single line, so a typo can't request 10,000 copies. */
const quantitySchema = z.number().int().min(1).max(99);

/**
 * The offer a line buys: what the cart shows of it, and what it's priced and
 * capped by. Not the whole offer — the comparison's refresh errors and the
 * shop's raw count are the comparison's business.
 */
export const cartOfferSchema = z.object({
  id: z.uuid(),
  supplier: supplierSchema,
  /** The shop's own name for this version. */
  sourceTitle: z.string(),
  url: z.url(),
  /** This version's own cover; null until a read finds one. */
  imageUrl: z.url().nullable(),
  priceCents: z.number().int(),
  currency: z.string(),
  availability: availabilitySchema,
  /**
   * Copies left to sell: the shop's count less what the demo's pending
   * orders hold, never below 0. Null when the shop gives no count — then
   * only the line's own limit caps it.
   */
  available: z.number().int().nullable(),
  /** When the price and stock were read from the shop's page. */
  lastCheckedAt: z.iso.datetime(),
});
export type CartOffer = z.infer<typeof cartOfferSchema>;

/**
 * One line in the cart. The offer and its record are embedded because a line
 * is unusable without them — a row can't be rendered from an id and a
 * quantity alone.
 */
export const cartItemSchema = z.object({
  id: z.uuid(),
  offerId: z.uuid(),
  quantity: quantitySchema,
  offer: cartOfferSchema,
  /** The record, for its page's link and its name. */
  product: z.object({
    id: z.uuid(),
    title: z.string(),
    /** The artist's display name. */
    artist: z.string(),
    imageUrl: z.url().nullable(),
  }),
  /** quantity × the offer's price, for this line. */
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
 * POST /cart/items. Adding an offer already in the cart increments the
 * existing line rather than creating a second one.
 */
export const addCartItemSchema = z.object({
  offerId: z.uuid(),
  quantity: quantitySchema.default(1),
});
export type AddCartItemInput = z.infer<typeof addCartItemSchema>;

/**
 * PATCH /cart/items/:offerId. Sets an absolute quantity rather than a
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
 * - OUT_OF_STOCK: the offer can't be bought — sold out, or a pre-order, which
 *   the demo doesn't sell — or has no copies left to sell, so there is no
 *   quantity that could be put in the cart. A request for more copies than
 *   remain isn't an error: the line is capped at what's left, and the
 *   response carries the quantity that was actually set.
 *
 * A cart is an intention, so these caps are tidiness, not a guarantee — stock
 * can fall after a line is added, and checkout is what really decides.
 */
export const cartErrorCodeSchema = z.enum(['OUT_OF_STOCK']);
export type CartErrorCode = z.infer<typeof cartErrorCodeSchema>;
