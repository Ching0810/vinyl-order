// Payment contract shared by apps/web (sending the customer to pay) and
// apps/api (starting a payment attempt). One source of truth so storefront and
// API can't drift.
//
// The customer pays on the provider's page, not ours, so starting a payment
// answers only with where to send the browser. Whether it succeeded is decided
// later by the provider's webhook — never by the browser coming back.
//
// Zod v4: string formats are top-level validators (`z.url()`).
import { z } from 'zod';

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
