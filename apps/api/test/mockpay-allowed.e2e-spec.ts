import { validateEnv } from '../src/config/env.validation';
import { mockPayAllowed } from '../src/payments/mockpay-allowed';

/**
 * When MockPay may run, and how PAYMENT_DEMO is read.
 *
 * Neither touches the database or starts the app — the suite runs under
 * NODE_ENV=test, so production can't be booted here — but they live with the
 * e2e specs because CI runs the e2e suite only.
 */
describe('MockPay in production (e2e)', () => {
  describe('mockPayAllowed', () => {
    it.each([
      ['development', false, true],
      ['test', false, true],
      ['production', false, false],
      ['production', true, true],
    ])('NODE_ENV=%s, PAYMENT_DEMO=%s → %s', (nodeEnv, paymentDemo, allowed) => {
      expect(mockPayAllowed(nodeEnv, paymentDemo)).toBe(allowed);
    });
  });

  describe('PAYMENT_DEMO', () => {
    /** The variables validateEnv requires, so only PAYMENT_DEMO varies. */
    const required = {
      DATABASE_URL: 'postgresql://localhost/vinyl',
      JWT_SECRET: 'x'.repeat(16),
      JWT_EXPIRES_IN: '1d',
      DISCOGS_TOKEN: 'token',
      MOCKPAY_WEBHOOK_SECRET: 'x'.repeat(32),
    };

    it('is false when unset', () => {
      expect(validateEnv(required).PAYMENT_DEMO).toBe(false);
    });

    it.each([
      ['true', true],
      ['false', false],
    ])('reads "%s" as %s', (value, expected) => {
      expect(validateEnv({ ...required, PAYMENT_DEMO: value }).PAYMENT_DEMO).toBe(expected);
    });

    // "false" must not turn MockPay on, as z.coerce.boolean() would, and a
    // typo must stop the boot rather than pick a side.
    it.each(['ture', 'TRUE', 'yes', '1', ''])('refuses "%s"', (value) => {
      expect(() => validateEnv({ ...required, PAYMENT_DEMO: value })).toThrow(/PAYMENT_DEMO/);
    });
  });
});
