import { randomUUID } from 'node:crypto';

import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import type { StartPaymentResponse } from '@vinyl-order/shared';
import request from 'supertest';
import { App } from 'supertest/types';

import { AppModule } from '../src/app.module';
import type { JwtPayload } from '../src/auth/jwt.strategy';
import { PAYMENT_WINDOW_MS } from '../src/orders/checkout.service';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * Paying for an order end to end: our API, the MockPay client, and MockPay
 * itself, with nothing replaced.
 *
 * payments.e2e-spec covers which orders may be paid, against a fake provider.
 * This covers the wiring between the two sides — that what our API asks for is
 * what MockPay shows, and that MockPay sends the customer back to the attempt
 * our API recorded, then tells our API how it ended — and that every way
 * MockPay can fail is a 502 that records nothing.
 */
describe('Payment flow through MockPay (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let jwt: JwtService;
  let publicWebUrl: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    // rawBody as main.ts sets it: MockPay's webhooks really reach the endpoint
    // here, and their signatures are checked over the raw body.
    app = moduleRef.createNestApplication({ rawBody: true });
    // Listen for real: with MOCKPAY_URL and MOCKPAY_WEBHOOK_URL unset, both
    // sides call this process at the port it is listening on.
    await app.listen(0);
    prisma = app.get(PrismaService);
    jwt = app.get(JwtService);
    publicWebUrl = app.get(ConfigService).getOrThrow<string>('PUBLIC_WEB_URL');
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  afterAll(async () => {
    await app.close();
  });

  /** A signed-in customer with one pending order of NT$17.50. */
  const placeOrder = async () => {
    const user = await prisma.user.create({
      data: { email: `payer-${randomUUID()}@test.local`, passwordHash: 'unused' },
    });
    const order = await prisma.order.create({
      data: {
        userId: user.id,
        subtotalCents: 1_750,
        currency: 'TWD',
        expiresAt: new Date(Date.now() + PAYMENT_WINDOW_MS),
      },
    });
    const payload: JwtPayload = { sub: user.id, email: user.email, role: user.role };
    return { order, token: jwt.sign(payload) };
  };

  const startPayment = (token: string, orderId: string) =>
    request(app.getHttpServer())
      .post(`/orders/${orderId}/payment`)
      .set('Authorization', `Bearer ${token}`);

  /**
   * Where the customer's browser is sent, as a path on this server. The
   * redirect URL's host is PUBLIC_API_URL, not the random port tests listen on.
   */
  const checkoutPathOf = (res: request.Response) =>
    new URL((res.body as StartPaymentResponse).redirectUrl).pathname;

  describe('paying', () => {
    it('records the MockPay session our API was given', async () => {
      const { order, token } = await placeOrder();

      const res = await startPayment(token, order.id).expect(201);

      const payment = await prisma.payment.findFirstOrThrow({ where: { orderId: order.id } });
      expect(checkoutPathOf(res)).toBe(`/mockpay/checkout/${payment.providerSessionId}`);
      expect(payment.providerSessionId).toMatch(/^mps_/);
    });

    it('shows the order amount on the payment page', async () => {
      const { order, token } = await placeOrder();
      const started = await startPayment(token, order.id).expect(201);

      const page = await request(app.getHttpServer()).get(checkoutPathOf(started)).expect(200);

      expect(page.text).toContain('NT$17.50');
    });

    it.each(['pay', 'decline'])(
      'sends the customer back to the payment our API recorded on %s',
      async (button) => {
        const { order, token } = await placeOrder();
        const started = await startPayment(token, order.id).expect(201);
        const payment = await prisma.payment.findFirstOrThrow({ where: { orderId: order.id } });

        const res = await request(app.getHttpServer())
          .post(`${checkoutPathOf(started)}/${button}`)
          .expect(303);

        expect(res.headers.location).toBe(
          `${publicWebUrl}/orders/${order.id}/payments/${payment.id}`,
        );
      },
    );

    /**
     * Wait for the order's payment to leave `pending`. The webhook arrives a
     * second after the button by default and separately from the redirect, so
     * nothing can be read straight after pressing it.
     */
    const settledPaymentOf = async (orderId: string, timeoutMs = 5_000) => {
      const deadline = Date.now() + timeoutMs;
      for (;;) {
        const payment = await prisma.payment.findFirstOrThrow({ where: { orderId } });
        if (payment.status !== 'pending') return payment;
        if (Date.now() > deadline) throw new Error('The webhook never settled the payment');
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    };

    // The browser coming back proves nothing; it is MockPay's webhook, sent
    // separately, that settles the payment and pays the order.
    it('pays the order once MockPay reports the payment', async () => {
      const { order, token } = await placeOrder();
      const started = await startPayment(token, order.id).expect(201);

      await request(app.getHttpServer())
        .post(`${checkoutPathOf(started)}/pay`)
        .expect(303);

      expect((await settledPaymentOf(order.id)).status).toBe('succeeded');
      const after = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
      expect(after.status).toBe('paid');
    });

    it('fails the payment and leaves the order payable once MockPay reports a decline', async () => {
      const { order, token } = await placeOrder();
      const started = await startPayment(token, order.id).expect(201);

      await request(app.getHttpServer())
        .post(`${checkoutPathOf(started)}/decline`)
        .expect(303);

      expect((await settledPaymentOf(order.id)).status).toBe('failed');
      const after = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
      expect(after.status).toBe('pending');
    });
  });

  /**
   * MockPay failing in each way the client distinguishes. Only the call that
   * opens a session is replaced: MockPay's webhooks also use fetch, and one
   * left over from an earlier test must not take this failure in its place.
   * supertest does not use fetch, so the tests' own requests are untouched.
   */
  describe('when MockPay fails', () => {
    const failOpeningSessions = (failure: () => Promise<Response>) => {
      const realFetch = global.fetch;
      jest.spyOn(global, 'fetch').mockImplementation((input, init) => {
        const url = input instanceof Request ? input.url : input.toString();
        return url.endsWith('/mockpay/sessions') ? failure() : realFetch(input, init);
      });
    };

    it.each([
      ['is unreachable', () => Promise.reject(new TypeError('fetch failed'))],
      ['answers with an error', () => Promise.resolve(new Response('oops', { status: 500 }))],
      [
        'answers in an unexpected shape',
        () => Promise.resolve(Response.json({ unexpected: true })),
      ],
      ['answers with something other than JSON', () => Promise.resolve(new Response('<html>'))],
    ])('answers 502 and records nothing when MockPay %s', async (_case, failure) => {
      const { order, token } = await placeOrder();
      failOpeningSessions(failure);

      await startPayment(token, order.id).expect(502);

      expect(await prisma.payment.count({ where: { orderId: order.id } })).toBe(0);
    });
  });
});
