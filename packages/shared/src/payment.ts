// Payment contract shared by apps/web (sending the customer to pay, and
// showing the result when they return) and apps/api. One source of truth so
// storefront and API can't drift.
//
// The customer pays on the provider's page, not ours, so starting a payment
// answers only with where to send the browser. Whether it succeeded is decided
// later by the provider's webhook — never by the browser coming back.
//
// Zod v4: string formats are top-level validators (`z.url()`).
import { z } from 'zod';

import { orderStatusSchema } from './order';

/**
 * Where one payment attempt stands. Must stay in sync with the `PaymentStatus`
 * enum in the API's Prisma schema. Only the provider's webhook moves it off
 * `pending`.
 */
export const paymentStatusSchema = z.enum(['pending', 'succeeded', 'failed']);
export type PaymentStatus = z.infer<typeof paymentStatusSchema>;

/**
 * POST /orders/:id/payment — the provider's payment page for this attempt.
 *
 * No payment id: the web only needs somewhere to go, and the id comes back in
 * the return URL the provider sends the browser to afterwards.
 */
export const startPaymentResponseSchema = z.object({
  redirectUrl: z.url(),
});
export type StartPaymentResponse = z.infer<typeof startPaymentResponseSchema>;

/**
 * GET /orders/:id/payments/:paymentId — one attempt's result, and its order's.
 *
 * The page the provider returns the customer to polls this until the webhook
 * has settled the attempt, so it carries only the two statuses that page
 * branches on; the order's lines are read once from GET /orders/:id.
 */
export const paymentResultSchema = z.object({
  id: z.uuid(),
  status: paymentStatusSchema,
  order: z.object({
    id: z.uuid(),
    status: orderStatusSchema,
  }),
});
export type PaymentResult = z.infer<typeof paymentResultSchema>;
