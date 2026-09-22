// Order contract shared by apps/web (confirmation page, order history) and
// apps/api (response shaping, checkout errors). One source of truth so
// storefront and API can't drift.
//
// An order is a fact, not an intention. Where the cart reads prices from the
// live product on every request, an order carries the price, title and artist
// copied at checkout, and renders from those alone — so it reads the same after
// the product is repriced or deleted.
//
// Dates are ISO strings, not `Date`: that is what actually crosses JSON, so the
// type matches what the browser receives. The API converts with toISOString().
//
// Zod v4: string formats are top-level validators (`z.uuid()`, `z.iso.datetime()`).
import { z } from 'zod';

/**
 * Where an order is in its life. Must stay in sync with the `OrderStatus` enum
 * in the API's Prisma schema (that one is the DB source of truth; this is the
 * wire/UI contract). Add a status in both.
 */
export const orderStatusSchema = z.enum(['pending', 'paid', 'shipped', 'cancelled']);
export type OrderStatus = z.infer<typeof orderStatusSchema>;

/**
 * One line of an order, built only from what was copied at checkout.
 *
 * No embedded product, unlike a cart line: the live product has the current
 * price, and handing it to the UI invites rendering the wrong one.
 */
export const orderItemSchema = z.object({
  id: z.uuid(),
  /**
   * The product this line came from, or null if it has since been deleted.
   * For linking to the product page only — never for display data.
   */
  productId: z.uuid().nullable(),
  quantity: z.number().int().min(1),
  /** Price per copy at checkout, in minor units. */
  unitPriceCents: z.number().int(),
  title: z.string(),
  artist: z.string(),
  imageUrl: z.url().nullable(),
  /**
   * quantity × unitPriceCents. Derived rather than stored, and unlike the
   * cart's it can't go stale: both inputs are fixed at purchase.
   */
  lineTotalCents: z.number().int(),
});
export type OrderItem = z.infer<typeof orderItemSchema>;

/** Fields every view of an order has. Summary and full order both extend it. */
const orderBaseSchema = z.object({
  id: z.uuid(),
  status: orderStatusSchema,
  /** Sum of the lines at checkout. Stored on the order, not re-summed. */
  subtotalCents: z.number().int(),
  /** ISO 4217 currency code shared by every line, e.g. "TWD". */
  currency: z.string(),
  /**
   * How many different records the order contains — one per line. With the
   * preview, lets a list row say "and 2 more".
   */
  lineCount: z.number().int(),
  createdAt: z.iso.datetime(),
});

/** Most lines an order-history row previews. */
export const ORDER_PREVIEW_LINES = 3;

/** Just enough of a line to recognise the order at a glance. */
export const orderPreviewLineSchema = orderItemSchema.pick({
  title: true,
  artist: true,
  imageUrl: true,
  quantity: true,
});
export type OrderPreviewLine = z.infer<typeof orderPreviewLineSchema>;

/**
 * One row of the order history: the order plus its first few lines. Shoppers
 * recognise an order by what was in it, so the row shows records rather than a
 * bare count — and "4 items" couldn't say whether that was four copies of one
 * record or four records.
 */
export const orderSummarySchema = orderBaseSchema.extend({
  /** The first ORDER_PREVIEW_LINES lines, in the same order as `items`. */
  preview: z.array(orderPreviewLineSchema).max(ORDER_PREVIEW_LINES),
});
export type OrderSummary = z.infer<typeof orderSummarySchema>;

/**
 * A full order with every line. Built on the same base as the summary so the
 * two shapes can't drift apart; no preview, since `items` has all of it.
 *
 * Returned by POST /orders and GET /orders/:id. GET /orders returns
 * Connection<OrderSummary> (see ./pagination).
 */
export const orderSchema = orderBaseSchema.extend({
  items: z.array(orderItemSchema),
});
export type Order = z.infer<typeof orderSchema>;

/**
 * Why a checkout was refused (all 409). A code rather than just a message, so
 * the web can branch on which failure it got without matching on text.
 *
 * - CART_EMPTY: nothing to order.
 * - INSUFFICIENT_STOCK: at least one line wants more copies than remain.
 * - MIXED_CURRENCY: lines are priced in different currencies, which a single
 *   order total can't represent.
 * - CART_CHANGED: the cart was consumed or edited by another request while
 *   this checkout ran — typically a second tab or a double submit. Nothing was
 *   ordered; reload the cart and look again.
 */
export const orderErrorCodeSchema = z.enum([
  'CART_EMPTY',
  'INSUFFICIENT_STOCK',
  'MIXED_CURRENCY',
  'CART_CHANGED',
]);
export type OrderErrorCode = z.infer<typeof orderErrorCodeSchema>;

/** One line that couldn't be fulfilled. */
export const insufficientStockItemSchema = z.object({
  productId: z.uuid(),
  title: z.string(),
  /** Copies the cart asked for. */
  requested: z.number().int(),
  /**
   * Copies left, read after the checkout rolled back. Informational only — it
   * may already have changed by the time the user sees it.
   */
  available: z.number().int(),
});
export type InsufficientStockItem = z.infer<typeof insufficientStockItemSchema>;

/**
 * 409 body for INSUFFICIENT_STOCK. Lists every short line at once, so the
 * user can fix them all in one pass instead of one per attempt.
 */
export const insufficientStockErrorSchema = z.object({
  code: z.literal('INSUFFICIENT_STOCK'),
  message: z.string(),
  items: z.array(insufficientStockItemSchema).min(1),
});
export type InsufficientStockError = z.infer<typeof insufficientStockErrorSchema>;
