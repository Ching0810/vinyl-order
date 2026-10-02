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

  /** Open a session and return its id. */
  const openSession = async (overrides: Record<string, unknown> = {}) => {
    const res = await createSession(sessionRequest(overrides)).expect(201);
    return (res.body as CreateSessionResponse).sessionId;
  };

  const checkoutPage = (sessionId: string) =>
    request(app.getHttpServer()).get(`/mockpay/checkout/${sessionId}`);

  const press = (sessionId: string, button: 'pay' | 'decline') =>
    request(app.getHttpServer()).post(`/mockpay/checkout/${sessionId}/${button}`);

  describe('the payment page', () => {
    it('shows the amount with a Pay and a Decline button', async () => {
      const sessionId = await openSession();

      const res = await checkoutPage(sessionId)
        .expect(200)
        .expect('Content-Type', /text\/html/);

      expect(res.text).toContain('17.50');
      expect(res.text).toContain(`action="/mockpay/checkout/${sessionId}/pay"`);
      expect(res.text).toContain(`action="/mockpay/checkout/${sessionId}/decline"`);
    });

    it('renders what the merchant sent as text, not markup', async () => {
      const sessionId = await openSession({ orderId: '<script>alert(1)</script>' });

      const res = await checkoutPage(sessionId).expect(200);

      expect(res.text).not.toContain('<script>');
      expect(res.text).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    });

    it('shows no buttons once the session has ended', async () => {
      const sessionId = await openSession();
      await press(sessionId, 'pay').expect(303);

      const res = await checkoutPage(sessionId).expect(200);

      expect(res.text).toContain('This payment has been made.');
      expect(res.text).not.toContain('<form');
    });

    it('answers 404 for a session that does not exist', async () => {
      await checkoutPage('mps_missing').expect(404);
    });
  });

  describe('pressing a button', () => {
    it.each(['pay', 'decline'] as const)(
      'sends the browser back to the return URL on %s',
      async (button) => {
        const returnUrl = `http://localhost:3000/orders/order-1/payments/${button}`;
        const sessionId = await openSession({ returnUrl });

        const res = await press(sessionId, button).expect(303);

        expect(res.headers.location).toBe(returnUrl);
      },
    );

    // A second tab or the back button: a session is settled once.
    it('refuses a session that has already ended', async () => {
      const sessionId = await openSession();
      await press(sessionId, 'decline').expect(303);

      await press(sessionId, 'pay').expect(409);
    });

    it('refuses to take payment after the deadline', async () => {
      const sessionId = await openSession({
        expiresAt: new Date(Date.now() - 1_000).toISOString(),
      });

      await press(sessionId, 'pay').expect(410);
    });

    it('answers 404 for a session that does not exist', async () => {
      await press('mps_missing', 'pay').expect(404);
    });
  });
});
