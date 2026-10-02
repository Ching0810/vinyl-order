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
});

/** Request body for POST /mockpay/sessions. */
export class CreateSessionDto extends createZodDto(createSessionSchema) {}

/** Response to POST /mockpay/sessions, in MockPay's own names. */
export interface CreateSessionResponse {
  sessionId: string;
  /** MockPay's payment page for this session, where the customer is sent. */
  checkoutUrl: string;
}
