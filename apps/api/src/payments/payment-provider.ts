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
 * Abstracts WHO collects the money. This is both the DI token and the contract,
 * so orders depend on this alone: swapping MockPay for a real provider means
 * one new class implementing it, not a change to orders.
 */
export abstract class PaymentProvider {
  /** Start a payment attempt; throws if the provider cannot be reached. */
  abstract createSession(input: CreateSessionInput): Promise<PaymentSession>;
}
