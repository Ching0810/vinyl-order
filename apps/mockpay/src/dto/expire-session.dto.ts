import type { MockPayOutcome } from '../mockpay.sessions';

/**
 * Response to POST /mockpay/sessions/:sessionId/expire, in MockPay's own
 * names. There is no request body: the session in the path is all it needs.
 *
 * `status` is the session's state after the call — `expired` if it was still
 * open, otherwise how the customer already ended it. The amount comes with it
 * so a merchant told `paid` can check what was collected, as it would for a
 * webhook.
 */
export interface ExpireSessionResponse {
  sessionId: string;
  status: Exclude<MockPayOutcome, 'open'>;
  amountCents: number;
  currency: string;
}
