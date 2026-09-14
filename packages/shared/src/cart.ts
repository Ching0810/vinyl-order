// Cart contract shared by apps/web (rendering the cart) and apps/api (DB
// persistence + request validation). One source of truth so storefront and API
// can't drift.
//
// The cart deliberately carries no stored prices. It records what was chosen;
// what it costs is read from the product each time, so the total always
// reflects what the shop charges now. The amount actually paid is snapshotted
// onto the order at checkout — that is where a frozen price belongs.
//
// Zod v4: string formats are top-level validators (`z.uuid()`).
import { z } from 'zod';

import { productSchema } from './product';

/** Upper bound on a single line, so a typo can't request 10,000 copies. */
const quantitySchema = z.number().int().min(1).max(99);

/**
 * One line in the cart. The product is embedded because a line is unusable
 * without it — a row can't be rendered from an id and a quantity alone.
 */
export const cartItemSchema = z.object({
  id: z.uuid(),
  productId: z.uuid(),
  quantity: quantitySchema,
  product: productSchema,
  /** quantity × the product's current price, for this line. */
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
 * POST /cart/items. Adding a product already in the cart increments the
 * existing line rather than creating a second one.
 */
export const addCartItemSchema = z.object({
  productId: z.uuid(),
  quantity: quantitySchema.default(1),
});
export type AddCartItemInput = z.infer<typeof addCartItemSchema>;

/**
 * PATCH /cart/items/:productId. Sets an absolute quantity rather than a
 * delta, so a retried request is idempotent. Removing a line is DELETE, not a
 * quantity of zero — "none of this" and "remove this" are the same intent, and
 * one way to express it is enough.
 */
export const updateCartItemSchema = z.object({
  quantity: quantitySchema,
});
export type UpdateCartItemInput = z.infer<typeof updateCartItemSchema>;
