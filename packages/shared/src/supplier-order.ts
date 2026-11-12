// Supplier order contract shared by apps/web (my supplier orders page and its
// entry form) and apps/api (request validation, response shaping).
//
// A supplier order is a user's own note of a record bought at one of the
// shops — not the demo store's Order, which has a payment lifecycle
// (docs/design/tracker.md §5.5). Each one belongs to the user who entered it
// and is only ever shown to them, so no owner id crosses the wire: the API
// knows whose it is from the session.
//
// Dates carry only what is known. The day an order was placed is `YYYY-MM-DD`,
// matching its `@db.Date` column: a time of day would be invented, and a
// timezone would shift the day. When a record is expected is a month,
// `YYYY-MM`, because a month is all the shops promise ("預計2026/11出貨").
// Timestamps the server sets are ISO datetimes, as elsewhere.
import { z } from 'zod';

/**
 * A calendar month, `YYYY-MM` (e.g. "2026-11") — what an `<input
 * type="month">` gives and the database's CHECK accepts. As text it sorts in
 * time order, so nothing needs to parse it to compare two.
 */
export const monthSchema = z
  .string()
  .regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Expected a month as YYYY-MM');

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
  /** The month the shop expects to send it, or null if it doesn't say. */
  expectedMonth: monthSchema.nullable(),
  /**
   * The cover the shop's confirmation email showed, or null — set only by
   * email import, and only from the shops' CDNs (tracker.md §9.4). Not in
   * any request: a typed URL could point the page at any host.
   */
  imageUrl: z.url().nullable(),
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
  expectedMonth: monthSchema.nullable().optional(),
});
export type CreateSupplierOrderItemInput = z.infer<typeof createSupplierOrderItemSchema>;

/**
 * POST /supplier-orders body.
 *
 * No `offerId` on the lines yet, deliberately: until a user can pick from
 * offers they track, accepting an id would only let a client link a line to
 * any offer it can guess. It comes with the product page's "record an order"
 * (tracker.md §14 step 9).
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
 * One line of an edited order. With an `id`, it is that existing line,
 * changed; without one, it is a new line. Keeping ids, rather than replacing
 * every line, keeps a line's identity — what an offer link (step 9) hangs on.
 */
export const updateSupplierOrderItemSchema = createSupplierOrderItemSchema.extend({
  id: z.uuid().optional(),
});
export type UpdateSupplierOrderItemInput = z.infer<typeof updateSupplierOrderItemSchema>;

/**
 * PATCH /supplier-orders/:id body: what changes after an order is placed.
 *
 * Every field optional, so only what is sent changes; null clears a total,
 * tracking number or note. At least one field to change, so an empty PATCH is
 * a client mistake rather than a silent no-op. No `supplier`: an order placed
 * at one shop is never another's.
 *
 * - status: must be a change canChangeSupplierOrderStatus allows from the
 *   current one, which only the API can check.
 * - items: the order's whole list of lines, not a patch to it. Lines with an
 *   id are updated, lines without are added, and the order's lines missing
 *   from the list are removed. An id that isn't one of this order's lines is
 *   refused, so a line another tab deleted is never quietly brought back.
 * - expectedUpdatedAt: the order's `updatedAt` as the client last read it.
 *   When sent, the change is only applied if the order hasn't changed since,
 *   else 409 SUPPLIER_ORDER_STALE — so a form filled from an old copy can't
 *   overwrite a newer edit. Optional so a client that only moves the status,
 *   which has its own check, doesn't need it.
 */
export const updateSupplierOrderSchema = z
  .object({
    orderNumber: z.string().trim().min(1).max(100).optional(),
    orderedAt: z.iso.date().optional(),
    totalCents: z.number().int().nonnegative().nullable().optional(),
    status: supplierOrderStatusSchema.optional(),
    trackingNumber: z.string().trim().min(1).max(100).nullable().optional(),
    note: z.string().trim().max(1000).nullable().optional(),
    items: z
      .array(updateSupplierOrderItemSchema)
      .min(1)
      .max(50)
      .refine(
        (items) => {
          const ids = items.flatMap((item) => (item.id ? [item.id] : []));
          return new Set(ids).size === ids.length;
        },
        { message: 'Each line id may appear only once' },
      )
      .optional(),
    expectedUpdatedAt: z.iso.datetime().optional(),
  })
  .refine(
    ({ expectedUpdatedAt: _version, ...changes }) =>
      Object.values(changes).some((value) => value !== undefined),
    { message: 'Send at least one field to change' },
  );
export type UpdateSupplierOrderInput = z.infer<typeof updateSupplierOrderSchema>;

// ---- Import token ----

/**
 * The user's token for importing orders from their confirmation emails
 * (tracker.md §9.4), as the page shows it: when it was made and last used.
 * Never the token itself — that is shown once, when it is created.
 */
export const supplierOrderImportTokenSchema = z.object({
  createdAt: z.iso.datetime(),
  /** When the Apps Script last used it, or null if it never has. */
  lastUsedAt: z.iso.datetime().nullable(),
});
export type SupplierOrderImportToken = z.infer<typeof supplierOrderImportTokenSchema>;

/**
 * GET /supplier-orders/import-token: the user's token, or null if they have
 * none. Wrapped so "none" is a JSON body rather than an empty response.
 */
export const supplierOrderImportTokenStatusSchema = z.object({
  importToken: supplierOrderImportTokenSchema.nullable(),
});
export type SupplierOrderImportTokenStatus = z.infer<typeof supplierOrderImportTokenStatusSchema>;

/**
 * POST /supplier-orders/import-token: a new token, replacing any before it.
 * The only response that carries the token; only its hash is kept.
 */
export const createdSupplierOrderImportTokenSchema = supplierOrderImportTokenSchema.extend({
  /** `vo_imp_` and 43 URL-safe characters (32 random bytes). */
  token: z.string(),
});
export type CreatedSupplierOrderImportToken = z.infer<typeof createdSupplierOrderImportTokenSchema>;

// ---- Email import ----

/**
 * POST /supplier-orders/import body: one confirmation email as the user's
 * Apps Script sends it, with its import token in the Authorization header
 * (tracker.md §9.4). Links are already stripped. The limits are generous for
 * the emails seen (the largest body is ~31 KB) and bound what one request
 * can make the parser read.
 */
export const importSupplierOrderEmailSchema = z.object({
  /** The From header, display name and all. */
  from: z.string().min(1).max(320),
  subject: z.string().max(500),
  /** The Date header, as an ISO datetime. */
  date: z.iso.datetime({ offset: true }),
  html: z.string().min(1).max(90_000),
});
export type ImportSupplierOrderEmailInput = z.infer<typeof importSupplierOrderEmailSchema>;

/**
 * What an import came to. Never the order itself: the route only writes, so
 * a leaked token can't be used to read anyone's orders by guessing numbers.
 *
 * - created (201): recorded now.
 * - already_recorded (200): this order number at this shop is already in the
 *   user's list — the same email sent again, or the order typed in by hand.
 */
export const importSupplierOrderResultSchema = z.object({
  result: z.enum(['created', 'already_recorded']),
});
export type ImportSupplierOrderResult = z.infer<typeof importSupplierOrderResultSchema>;

// ---- Errors ----

/**
 * Why a supplier order request was refused — a 409, except where noted. A
 * code so the page can branch without matching on text.
 *
 * - SUPPLIER_ORDER_DUPLICATE: this user already recorded this order number at
 *   this shop. Another user's orders never cause it.
 * - SUPPLIER_ORDER_BAD_TRANSITION: the status change isn't one
 *   canChangeSupplierOrderStatus allows from where the order is now — typically a
 *   second tab that moved it first. The body carries the current `status`.
 * - SUPPLIER_ORDER_STALE: the order changed after the client read it (its
 *   `updatedAt` no longer matches `expectedUpdatedAt`); nothing was written.
 *   The client reloads the order and lets the user redo the edit.
 * - SUPPLIER_ORDER_EMAIL_UNREADABLE (422): an imported email isn't a
 *   confirmation this site can read. The body's `reason` says why in a short
 *   phrase, never quoting the email; it waits to be typed by hand.
 */
export const supplierOrderErrorCodeSchema = z.enum([
  'SUPPLIER_ORDER_DUPLICATE',
  'SUPPLIER_ORDER_BAD_TRANSITION',
  'SUPPLIER_ORDER_STALE',
  'SUPPLIER_ORDER_EMAIL_UNREADABLE',
]);
export type SupplierOrderErrorCode = z.infer<typeof supplierOrderErrorCodeSchema>;
