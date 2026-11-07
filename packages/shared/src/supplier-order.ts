// Supplier order contract shared by apps/web (my supplier orders page and its
// entry form) and apps/api (request validation, response shaping).
//
// A supplier order is a user's own note of a record bought at one of the
// shops — not the demo store's Order, which has a payment lifecycle
// (docs/design/tracker.md §5.5). Each one belongs to the user who entered it
// and is only ever shown to them, so no owner id crosses the wire: the API
// knows whose it is from the session.
//
// Dates the shop gives as a day (ordered on, expected on) are `YYYY-MM-DD`
// strings, matching the `@db.Date` columns: a time of day would be invented,
// and a timezone would shift the day. Timestamps the server sets are ISO
// datetimes, as elsewhere.
import { z } from 'zod';

/**
 * The shops the tracker knows. Must stay in sync with the `Supplier` enum in
 * the API's Prisma schema (the DB source of truth). A fifth shop is a value in
 * both.
 */
export const supplierSchema = z.enum(['candlelight', 'tht', 'cosmic', 'rotten_blues']);
export type Supplier = z.infer<typeof supplierSchema>;

/**
 * Where a supplier order stands (tracker.md §9.1). Must stay in sync with the
 * `SupplierOrderStatus` enum in the API's Prisma schema.
 *
 * - ordered: placed, nothing heard yet.
 * - preparing: the shop confirmed it; for a pre-order, waiting for release.
 * - shipped: on its way.
 * - delivered: arrived.
 * - cancelled: will not arrive.
 */
export const supplierOrderStatusSchema = z.enum([
  'ordered',
  'preparing',
  'shipped',
  'delivered',
  'cancelled',
]);
export type SupplierOrderStatus = z.infer<typeof supplierOrderStatusSchema>;

/** The way forward, in order. `cancelled` is a side exit, not a step. */
const FORWARD: readonly SupplierOrderStatus[] = ['ordered', 'preparing', 'shipped', 'delivered'];

/** Statuses an order can still be cancelled from: the shop hasn't sent it. */
const CANCELLABLE: readonly SupplierOrderStatus[] = ['ordered', 'preparing'];

/**
 * Whether an order's status may be changed from one value to another by hand.
 * Only the status: the shop an order was placed at never changes, which is
 * why updateSupplierOrderSchema has no `supplier`.
 *
 * Any forward move, skipping steps included — a shop that never confirms
 * before shipping goes straight from `ordered` to `shipped`. Never backwards,
 * and `delivered` and `cancelled` are final. Cancelling is allowed until the
 * order ships.
 *
 * Shared so the page offers only the moves the API will accept, and the API
 * enforces the same rule rather than trusting the page.
 */
export function canChangeSupplierOrderStatus(
  from: SupplierOrderStatus,
  to: SupplierOrderStatus,
): boolean {
  if (to === 'cancelled') return CANCELLABLE.includes(from);
  const fromStep = FORWARD.indexOf(from);
  const toStep = FORWARD.indexOf(to);
  // fromStep is -1 for `cancelled`, which nothing leaves.
  return fromStep !== -1 && toStep > fromStep;
}

// ---- Responses ----

/** One record in a supplier order. */
export const supplierOrderItemSchema = z.object({
  id: z.uuid(),
  /**
   * The tracked offer this line is linked to, or null for a typed line (all of
   * them, for now: lines are typed until there are offers to pick from).
   */
  offerId: z.uuid().nullable(),
  /** As typed, or copied from the offer; the line renders from it alone. */
  title: z.string(),
  quantity: z.number().int().min(1),
  /** Price per copy as the shop charged it, in minor units. */
  unitPriceCents: z.number().int(),
  /** quantity × unitPriceCents, derived rather than stored. */
  lineTotalCents: z.number().int(),
  /** When the shop expects to send it, if known. `YYYY-MM-DD`. */
  expectedAt: z.iso.date().nullable(),
});
export type SupplierOrderItem = z.infer<typeof supplierOrderItemSchema>;

/**
 * A supplier order with its lines. Returned by every /supplier-orders route;
 * the list returns them all, since one person's orders are a page's worth.
 */
export const supplierOrderSchema = z.object({
  id: z.uuid(),
  supplier: supplierSchema,
  /** The shop's own order number. */
  orderNumber: z.string(),
  /** `YYYY-MM-DD`. */
  orderedAt: z.iso.date(),
  status: supplierOrderStatusSchema,
  /**
   * What the shop charged, shipping included, or null if not entered. Stored
   * as entered rather than summed from the lines, because shipping and
   * discounts aren't lines.
   */
  totalCents: z.number().int().nullable(),
  /** ISO 4217 currency code, e.g. "TWD". */
  currency: z.string(),
  trackingNumber: z.string().nullable(),
  note: z.string().nullable(),
  items: z.array(supplierOrderItemSchema),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export type SupplierOrder = z.infer<typeof supplierOrderSchema>;

// ---- Requests ----

/** One line of a new order. Typed: there are no offers to pick from yet. */
export const createSupplierOrderItemSchema = z.object({
  title: z.string().trim().min(1).max(300),
  quantity: z.number().int().min(1).max(99).default(1),
  unitPriceCents: z.number().int().nonnegative(),
  expectedAt: z.iso.date().nullable().optional(),
});
export type CreateSupplierOrderItemInput = z.infer<typeof createSupplierOrderItemSchema>;

/**
 * POST /supplier-orders body.
 *
 * No `offerId` on the lines yet, deliberately: until a user can pick from
 * offers they track, accepting an id would only let a client link a line to
 * any offer it can guess. It comes with the product page's "record an order"
 * (tracker.md §14 step 9).
 *
 * Lines and the order number can't be edited afterwards — a mistake is
 * deleted and entered again — so they are checked here, once.
 */
export const createSupplierOrderSchema = z.object({
  supplier: supplierSchema,
  orderNumber: z.string().trim().min(1).max(100),
  orderedAt: z.iso.date(),
  totalCents: z.number().int().nonnegative().nullable().optional(),
  trackingNumber: z.string().trim().min(1).max(100).nullable().optional(),
  note: z.string().trim().max(1000).nullable().optional(),
  items: z.array(createSupplierOrderItemSchema).min(1).max(50),
});
export type CreateSupplierOrderInput = z.infer<typeof createSupplierOrderSchema>;

/**
 * PATCH /supplier-orders/:id body: what changes after an order is placed.
 *
 * Every field optional with no defaults, so only what is sent changes; null
 * clears a tracking number or note. At least one field, so an empty PATCH is
 * a client mistake rather than a silent no-op. A status must be a change
 * canChangeSupplierOrderStatus allows from the current one, which only the API
 * can check. No `supplier`: an order placed at one shop is never another's.
 */
export const updateSupplierOrderSchema = z
  .object({
    status: supplierOrderStatusSchema.optional(),
    trackingNumber: z.string().trim().min(1).max(100).nullable().optional(),
    note: z.string().trim().max(1000).nullable().optional(),
  })
  .refine((body) => Object.keys(body).length > 0, {
    message: 'Send at least one of status, trackingNumber or note',
  });
export type UpdateSupplierOrderInput = z.infer<typeof updateSupplierOrderSchema>;

// ---- Errors ----

/**
 * Why a supplier order request was refused (all 409). A code so the page can
 * branch without matching on text.
 *
 * - SUPPLIER_ORDER_DUPLICATE: this user already recorded this order number at
 *   this shop. Another user's orders never cause it.
 * - SUPPLIER_ORDER_BAD_TRANSITION: the status change isn't one
 *   canChangeSupplierOrderStatus allows from where the order is now — typically a
 *   second tab that moved it first. The body carries the current `status`.
 */
export const supplierOrderErrorCodeSchema = z.enum([
  'SUPPLIER_ORDER_DUPLICATE',
  'SUPPLIER_ORDER_BAD_TRANSITION',
]);
export type SupplierOrderErrorCode = z.infer<typeof supplierOrderErrorCodeSchema>;
