import { createHmac } from 'node:crypto';

import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { App } from 'supertest/types';

import { AppModule } from '../src/app.module';
import { PaymentProvider } from '../src/payments/payment-provider';

/**
 * Proving a webhook came from MockPay, before anything reads it.
 *
 * verifyWebhook touches no database, but it runs here rather than as a unit
 * test because CI runs the e2e suite only. The tests sign webhooks themselves,
 * following the scheme rather than our code: HMAC-SHA256 over `<t>.<body>`
 * under the shared secret, sent as `MockPay-Signature: t=…,v1=…`.
 */
describe('Webhook signature (e2e)', () => {
  let app: INestApplication<App>;
  let provider: PaymentProvider;
  let secret: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    provider = app.get(PaymentProvider);
    secret = app.get(ConfigService).getOrThrow<string>('MOCKPAY_WEBHOOK_SECRET');
  });

  afterAll(async () => {
    await app.close();
  });

  /** A webhook in MockPay's format; tests change what they are about. */
  const webhookBody = (overrides: Record<string, unknown> = {}) =>
    JSON.stringify({
      id: 'evt_1',
      type: 'payment.succeeded',
      createdAt: new Date().toISOString(),
      data: { sessionId: 'mps_1', orderId: 'order-1', amountCents: 1_750, currency: 'TWD' },
      ...overrides,
    });

  const nowSeconds = () => Math.floor(Date.now() / 1000);

  /** The header MockPay would send for this body, under `key` at time `t`. */
  const signatureFor = (body: string, { key = secret, t = nowSeconds() } = {}) =>
    `t=${t},v1=${createHmac('sha256', key).update(`${t}.${body}`).digest('hex')}`;

  const verify = (body: string, headers: Record<string, string>) =>
    provider.verifyWebhook(Buffer.from(body), headers);

  it('accepts a webhook MockPay signed, in our terms', () => {
    const body = webhookBody();

    const event = verify(body, { 'mockpay-signature': signatureFor(body) });

    expect(event).toEqual({
      id: 'evt_1',
      type: 'payment.succeeded',
      providerSessionId: 'mps_1',
      amountCents: 1_750,
      currency: 'TWD',
    });
  });

  describe('refusing what MockPay did not send', () => {
    it('refuses a signature made without the secret', () => {
      const body = webhookBody();

      expect(() =>
        verify(body, { 'mockpay-signature': signatureFor(body, { key: 'a-guess' }) }),
      ).toThrow('Invalid webhook signature');
    });

    // Signed honestly, then changed in transit: a lower amount, say.
    it('refuses a body changed after it was signed', () => {
      const signed = webhookBody();
      const changed = signed.replace('1750', '1');

      expect(() => verify(changed, { 'mockpay-signature': signatureFor(signed) })).toThrow(
        'Invalid webhook signature',
      );
    });

    // A real webhook captured and sent again later.
    it('refuses a timestamp older than five minutes', () => {
      const body = webhookBody();
      const t = nowSeconds() - 5 * 60 - 1;

      expect(() => verify(body, { 'mockpay-signature': signatureFor(body, { t }) })).toThrow(
        'Invalid webhook signature',
      );
    });

    it('refuses a timestamp more than five minutes ahead', () => {
      const body = webhookBody();
      const t = nowSeconds() + 5 * 60 + 1;

      expect(() => verify(body, { 'mockpay-signature': signatureFor(body, { t }) })).toThrow(
        'Invalid webhook signature',
      );
    });

    it.each([
      ['no signature header', {}],
      ['a header that is not t=…,v1=…', { 'mockpay-signature': 'signed-by-mockpay' }],
      ['a signature that is not hex', { 'mockpay-signature': `t=${nowSeconds()},v1=zz` }],
    ])('refuses %s', (_case, headers) => {
      expect(() => verify(webhookBody(), headers)).toThrow('Invalid webhook signature');
    });
  });

  // Signed by MockPay, so authentic — but unreadable.
  it.each([
    ['is not JSON', 'not json'],
    ['has an unknown type', webhookBody({ type: 'payment.refunded' })],
    ['has no session id', webhookBody({ data: { amountCents: 1_750, currency: 'TWD' } })],
  ])('refuses a signed webhook that %s', (_case, body) => {
    expect(() => verify(body, { 'mockpay-signature': signatureFor(body) })).toThrow(
      'Malformed webhook payload',
    );
  });
});
