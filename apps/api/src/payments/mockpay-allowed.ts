/**
 * Whether MockPay may run: everywhere but production, and in production only
 * when PAYMENT_DEMO says so.
 *
 * MockPay takes no real money, so a production deploy that used it by mistake
 * would "sell" records nobody paid for. Off unless asked for: forgetting the
 * switch leaves payments refused, not a fake provider live.
 *
 * Two places decide on MockPay and must agree, so both ask this: AppModule,
 * whether to mount it, and PaymentsModule, whether to use it. If they
 * disagreed, the API would use a MockPay whose routes aren't mounted, and
 * every payment would fail.
 *
 * @param nodeEnv - NODE_ENV
 * @param paymentDemo - PAYMENT_DEMO, already validated (config/env.validation)
 */
export const mockPayAllowed = (nodeEnv: string, paymentDemo: boolean): boolean =>
  nodeEnv !== 'production' || paymentDemo;
