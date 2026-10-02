import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';

import { AppModule } from '../src/app.module';
import type { CreateSessionResponse } from '../src/mockpay/dto/create-session.dto';

/**
 * MockPay, driven over HTTP the way our API and a customer's browser reach it.
 *
 * MockPay stands in for a third party, so these tests treat it as one: they
 * only send requests and read responses, never its internal state.
 */
describe('MockPay (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  /** A valid request to open a session; tests override what they are about. */
  const sessionRequest = (overrides: Record<string, unknown> = {}) => ({
    orderId: 'order-1',
    amountCents: 1_750,
    currency: 'TWD',
    expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
    returnUrl: 'http://localhost:3000/orders/order-1/payments/payment-1',
    ...overrides,
  });

  const createSession = (body: object) =>
    request(app.getHttpServer()).post('/mockpay/sessions').send(body);

  describe('opening a session', () => {
    it('answers with the session id and its payment page', async () => {
      const res = await createSession(sessionRequest()).expect(201);

      const { sessionId, checkoutUrl } = res.body as CreateSessionResponse;
      expect(sessionId).toMatch(/^mps_/);
      expect(new URL(checkoutUrl).pathname).toBe(`/mockpay/checkout/${sessionId}`);
    });

    it('gives every session its own id', async () => {
      const first = await createSession(sessionRequest()).expect(201);
      const second = await createSession(sessionRequest()).expect(201);

      expect((first.body as CreateSessionResponse).sessionId).not.toBe(
        (second.body as CreateSessionResponse).sessionId,
      );
    });

    it.each([
      ['a negative amount', { amountCents: -1 }],
      ['a fractional amount', { amountCents: 17.5 }],
      ['a currency that is not a 3-letter code', { currency: 'TW' }],
      ['a deadline that is not a date', { expiresAt: 'soon' }],
      ['a return URL that is not a URL', { returnUrl: 'not a url' }],
      ['a return URL that is not http(s)', { returnUrl: 'javascript:alert(1)' }],
      ['no order id', { orderId: undefined }],
    ])('refuses %s', async (_case, overrides) => {
      await createSession(sessionRequest(overrides)).expect(400);
    });
  });
});
