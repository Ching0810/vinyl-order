import { createHmac } from 'node:crypto';

import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
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
  let secret: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    // Listening, so MockPay can work out where to send its webhooks.
    await app.listen(0);
    secret = app.get(ConfigService).getOrThrow<string>('MOCKPAY_WEBHOOK_SECRET');
  });

  afterEach(() => {
    jest.restoreAllMocks();
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
    // Long enough that pressing a button sends nothing while the suite runs;
    // closing the app cancels it. Webhook tests set their own.
    webhookDelayMs: 60_000,
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
      ['a negative webhook delay', { webhookDelayMs: -1 }],
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

  /**
   * What MockPay sends the merchant, captured by replacing fetch — the tests
   * check MockPay's side of the exchange on its own, without our API in the
   * way. supertest does not use fetch, so the tests' own requests go through.
   */
  describe('notifying the merchant', () => {
    interface SentWebhook {
      url: string;
      signature: string;
      body: string;
    }

    /** Answer each webhook with the next status (200 once they run out), recording it. */
    const captureWebhooks = (...statuses: number[]) => {
      const sent: SentWebhook[] = [];
      jest.spyOn(global, 'fetch').mockImplementation((input, init) => {
        const headers = new Headers(init?.headers);
        sent.push({
          url: input instanceof Request ? input.url : input.toString(),
          signature: headers.get('MockPay-Signature') ?? '',
          // MockPay sends its body as a string; anything else would fail the tests.
          body: typeof init?.body === 'string' ? init.body : '',
        });
        return Promise.resolve(new Response(null, { status: statuses.shift() ?? 200 }));
      });
      return sent;
    };

    /** Wait until `count` webhooks have been sent, or fail after `timeoutMs`. */
    const waitForWebhooks = async (sent: SentWebhook[], count: number, timeoutMs = 4_000) => {
      const deadline = Date.now() + timeoutMs;
      while (sent.length < count) {
        if (Date.now() > deadline)
          throw new Error(`Expected ${count} webhooks, got ${sent.length}`);
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
    };

    /** Whether the signature is MockPay's over this body, by the scheme alone. */
    const isSignedBySecret = ({ signature, body }: SentWebhook) => {
      const match = /^t=(\d+),v1=([0-9a-f]+)$/.exec(signature);
      if (!match) return false;
      const [, t, v1] = match;
      return createHmac('sha256', secret).update(`${t}.${body}`).digest('hex') === v1;
    };

    const parse = (webhook: SentWebhook) =>
      JSON.parse(webhook.body) as { id: string; type: string; data: Record<string, unknown> };

    it.each([
      ['pay', 'payment.succeeded'],
      ['decline', 'payment.failed'],
    ] as const)('reports %s as %s, signed with the secret', async (button, type) => {
      const sent = captureWebhooks();
      const sessionId = await openSession({ webhookDelayMs: 0 });

      await press(sessionId, button).expect(303);
      await waitForWebhooks(sent, 1);

      expect(new URL(sent[0].url).pathname).toBe('/payments/webhook');
      expect(isSignedBySecret(sent[0])).toBe(true);
      expect(parse(sent[0])).toMatchObject({
        id: expect.stringMatching(/^mpe_/) as unknown,
        type,
        data: { sessionId, orderId: 'order-1', amountCents: 1_750, currency: 'TWD' },
      });
    });

    // The customer's redirect and the merchant's webhook travel separately.
    it('sends the browser back without waiting for the webhook', async () => {
      const sent = captureWebhooks();
      const sessionId = await openSession({ webhookDelayMs: 60_000 });

      await press(sessionId, 'pay').expect(303);

      expect(sent).toHaveLength(0);
    });

    // At least once: a redelivery repeats the event id, which is what lets the
    // merchant recognise it; each attempt is signed afresh.
    it('retries a webhook the merchant did not accept, as the same event', async () => {
      const sent = captureWebhooks(500, 200);
      const sessionId = await openSession({ webhookDelayMs: 0 });

      await press(sessionId, 'pay').expect(303);
      await waitForWebhooks(sent, 2);

      expect(parse(sent[1]).id).toBe(parse(sent[0]).id);
      expect(sent.every(isSignedBySecret)).toBe(true);
    });

    it('gives up after three attempts', async () => {
      const sent = captureWebhooks(500, 500, 500, 500);
      const sessionId = await openSession({ webhookDelayMs: 0 });

      await press(sessionId, 'pay').expect(303);
      await waitForWebhooks(sent, 3);
      // Longer than the last retry delay, in case a fourth were coming.
      await new Promise((resolve) => setTimeout(resolve, 2_500));

      expect(sent).toHaveLength(3);
    }, 10_000);
  });
});
