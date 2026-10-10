import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

/**
 * MockPay's request format for opening a session — its own, as a real
 * provider's would be, so it lives here and not in @vinyl-order/shared. Our
 * side reaches it only over HTTP, through the payment provider client.
 */
const createSessionSchema = z.object({
  orderId: z.string().min(1),
  amountCents: z.number().int().positive(),
  /** ISO 4217, e.g. "TWD". */
  currency: z.string().length(3),
  expiresAt: z.iso.datetime(),
  /** http(s) only: the customer's browser is redirected here. */
  returnUrl: z.url({ protocol: /^https?$/ }),
  /**
   * Test-only: how long after Pay or Decline the webhook is sent. A second by
   * default, so the customer is usually back before the result arrives — the
   * order a real provider tends to produce, and the one the return page must
   * handle (docs/design/payments.md §9.1).
   */
  webhookDelayMs: z.number().int().min(0).max(60_000).default(1_000),
});

/** Request body for POST /mockpay/sessions. */
export class CreateSessionDto extends createZodDto(createSessionSchema) {}

/** Response to POST /mockpay/sessions, in MockPay's own names. */
export interface CreateSessionResponse {
  sessionId: string;
  /** MockPay's payment page for this session, where the customer is sent. */
  checkoutUrl: string;
}
