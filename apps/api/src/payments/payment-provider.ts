/** What a payment provider needs to start collecting for one attempt. */
export interface CreateSessionInput {
  orderId: string;
  amountCents: number;
  currency: string;
  /** The provider refuses to take payment after this — the order's deadline. */
  expiresAt: Date;
  /** Where the provider sends the customer's browser once they pay or decline. */
  returnUrl: string;
}

/** The provider's handle on one attempt. */
export interface PaymentSession {
  /** The provider's id for this attempt — what its webhooks will name. */
  providerSessionId: string;
  /** The provider's payment page, where the customer's browser is sent. */
  redirectUrl: string;
}

/**
 * A provider's webhook, verified and in our terms.
 *
 * Named apart from the PaymentEvent table, which records the ids of events we
 * have handled. No order id: the payment is found by its session, and the
 * order through the payment — not by what the provider says the order is.
 */
export interface PaymentWebhookEvent {
  /** The provider's event id: what a redelivery repeats. */
  id: string;
  type: 'payment.succeeded' | 'payment.failed';
  providerSessionId: string;
  /** What the provider says it collected, checked against the payment. */
  amountCents: number;
  currency: string;
}

/** Request headers as Node hands them over: lower-cased names. */
export type WebhookHeaders = Record<string, string | string[] | undefined>;

/**
 * Abstracts WHO collects the money. This is both the DI token and the contract,
 * so orders depend on this alone: swapping MockPay for a real provider means
 * one new class implementing it, not a change to orders.
 */
export abstract class PaymentProvider {
  /** Start a payment attempt; throws if the provider cannot be reached. */
  abstract createSession(input: CreateSessionInput): Promise<PaymentSession>;

  /**
   * Prove a webhook came from the provider and parse it, or throw 400.
   *
   * Takes the raw body, not parsed JSON: a signature is computed over exact
   * bytes, and re-serialising can reorder keys or change whitespace.
   */
  abstract verifyWebhook(rawBody: Buffer, headers: WebhookHeaders): PaymentWebhookEvent;
}
