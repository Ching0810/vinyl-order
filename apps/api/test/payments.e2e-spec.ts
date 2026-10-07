import { randomUUID } from 'node:crypto';

import { BadGatewayException, INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import type { PaymentResult, StartPaymentResponse } from '@vinyl-order/shared';
import request from 'supertest';
import { App } from 'supertest/types';

import { AppModule } from '../src/app.module';
import type { JwtPayload } from '../src/auth/jwt.strategy';
import { PAYMENT_WINDOW_MS } from '../src/orders/checkout.service';
import type { CreateSessionInput, PaymentSession } from '../src/payments/payment-provider';
import { PaymentProvider } from '../src/payments/payment-provider';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * Starting a payment, against a real Postgres and a fake provider.
 *
 * The provider is faked because what is under test is our side: which orders
 * may be paid, what the provider is asked for, and what is recorded. The
 * database is real because the guarantee against two open payment pages is a
 * unique index, which a mocked Prisma would pass while proving nothing.
 */
describe('Payments (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let jwt: JwtService;
  let publicWebUrl: string;

  /** How long the fake provider takes to answer; raised to make requests overlap. */
  let latencyMs = 0;

  /** Stands in for the provider: a fresh session per call, every call recorded. */
  const provider = {
    createSession: jest.fn<Promise<PaymentSession>, [CreateSessionInput]>(async () => {
      if (latencyMs > 0) await new Promise((resolve) => setTimeout(resolve, latencyMs));
      const providerSessionId = `sess_${randomUUID()}`;
      return { providerSessionId, redirectUrl: `https://pay.test/${providerSessionId}` };
    }),
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PaymentProvider)
      .useValue(provider)
      .compile();
    app = moduleRef.createNestApplication();
    // Listen for real, as the orders suite does: concurrent requests at a
    // server that isn't listening yet each try to bind it.
    await app.listen(0);
    prisma = app.get(PrismaService);
    jwt = app.get(JwtService);
    publicWebUrl = app.get(ConfigService).getOrThrow<string>('PUBLIC_WEB_URL');
  });

  afterEach(() => {
    latencyMs = 0;
  });

  afterAll(async () => {
    await app.close();
  });

  /**
   * A signed-in customer with one order, pending and payable unless
   * `overrides` say otherwise.
   *
   * Built through Prisma rather than checkout: checkout has tests of its own,
   * and going through it would fail these for reasons unrelated to paying.
   */
  const placeOrder = async (overrides: Record<string, unknown> = {}) => {
    const user = await prisma.user.create({
      data: { email: `payer-${randomUUID()}@test.local`, passwordHash: 'unused' },
    });
    const order = await prisma.order.create({
      data: {
        userId: user.id,
        subtotalCents: 1_750,
        currency: 'TWD',
        expiresAt: new Date(Date.now() + PAYMENT_WINDOW_MS),
        ...overrides,
      },
    });
    const payload: JwtPayload = { sub: user.id, email: user.email, role: user.role };
    return { order, token: jwt.sign(payload) };
  };

  /** POST /orders/:id/payment as the given customer. */
  const startPayment = (token: string, orderId: string) =>
    request(app.getHttpServer())
      .post(`/orders/${orderId}/payment`)
      .set('Authorization', `Bearer ${token}`);

  /** Every createSession call made for this order. The app is shared across tests. */
  const sessionsFor = (orderId: string) =>
    provider.createSession.mock.calls.filter(([input]) => input.orderId === orderId);

  const paymentsOf = (orderId: string) =>
    prisma.payment.findMany({ where: { orderId }, orderBy: { createdAt: 'asc' } });

  describe('starting a payment', () => {
    it('records a pending payment and answers with the provider page', async () => {
      const { order, token } = await placeOrder();

      const res = await startPayment(token, order.id).expect(201);

      const [payment] = await paymentsOf(order.id);
      expect(res.body as StartPaymentResponse).toEqual({ redirectUrl: payment.redirectUrl });
      expect(payment).toMatchObject({
        status: 'pending',
        amountCents: 1_750,
        currency: 'TWD',
        providerSessionId: expect.stringMatching(/^sess_/) as unknown,
      });
    });

    // The return URL must name the row that was written: the id is made before
    // the provider is called, so this is what proves the two agree.
    it('asks the provider for the order amount and a return URL naming the payment', async () => {
      const { order, token } = await placeOrder();

      await startPayment(token, order.id).expect(201);

      const [payment] = await paymentsOf(order.id);
      expect(sessionsFor(order.id)).toEqual([
        [
          {
            orderId: order.id,
            amountCents: 1_750,
            currency: 'TWD',
            expiresAt: order.expiresAt,
            returnUrl: `${publicWebUrl}/orders/${order.id}/payments/${payment.id}`,
          },
        ],
      ]);
    });

    it('returns the pending payment page again instead of starting another', async () => {
      const { order, token } = await placeOrder();
      const first = await startPayment(token, order.id).expect(201);

      const again = await startPayment(token, order.id).expect(200);

      expect(again.body).toEqual(first.body);
      expect(sessionsFor(order.id)).toHaveLength(1);
      expect(await paymentsOf(order.id)).toHaveLength(1);
    });

    it('starts a new payment once the previous one has failed', async () => {
      const { order, token } = await placeOrder();
      const first = await startPayment(token, order.id).expect(201);
      await prisma.payment.updateMany({ where: { orderId: order.id }, data: { status: 'failed' } });

      const retry = await startPayment(token, order.id).expect(201);

      expect(retry.body).not.toEqual(first.body);
      expect((await paymentsOf(order.id)).map((payment) => payment.status)).toEqual([
        'failed',
        'pending',
      ]);
    });
  });

  /**
   * The lookup for a pending payment only saves work; the unique index is what
   * decides. The provider is slowed so every request passes the lookup before
   * any of them writes — otherwise later requests would find the first one's
   * row and never reach the index.
   */
  it('keeps one pending payment when several requests start one at once', async () => {
    const { order, token } = await placeOrder();
    latencyMs = 50;

    const responses = await Promise.all(
      Array.from({ length: 5 }, () => startPayment(token, order.id)),
    );

    const payments = await paymentsOf(order.id);
    expect(payments).toHaveLength(1);
    expect(responses.map((res) => res.status).sort()).toEqual([200, 200, 200, 200, 201]);
    for (const res of responses) {
      expect(res.body).toEqual({ redirectUrl: payments[0].redirectUrl });
    }
    // Every request reached the provider, so the race really was decided at
    // the index; the losers' sessions are simply never used.
    expect(sessionsFor(order.id)).toHaveLength(5);
  });

  describe('refusing', () => {
    it("answers 404 for another customer's order without calling the provider", async () => {
      const { order } = await placeOrder();
      const { token: stranger } = await placeOrder();

      await startPayment(stranger, order.id).expect(404);

      expect(sessionsFor(order.id)).toHaveLength(0);
    });

    it('answers 404 for an order that does not exist', async () => {
      const { token } = await placeOrder();

      await startPayment(token, randomUUID()).expect(404);
    });

    it('answers 401 without a session', async () => {
      const { order } = await placeOrder();

      await request(app.getHttpServer()).post(`/orders/${order.id}/payment`).expect(401);
    });

    it.each([
      ['paid', { status: 'paid', paidAt: new Date() }],
      ['cancelled', { status: 'cancelled', cancelledAt: new Date(), cancelReason: 'customer' }],
    ])('refuses a %s order with its status', async (status, fields) => {
      const { order, token } = await placeOrder(fields);

      const res = await startPayment(token, order.id).expect(409);

      expect(res.body).toMatchObject({ code: 'ORDER_NOT_PENDING', status });
      expect(sessionsFor(order.id)).toHaveLength(0);
    });

    it('refuses an order past its deadline before the sweeper has cancelled it', async () => {
      const { order, token } = await placeOrder({ expiresAt: new Date(Date.now() - 1_000) });

      const res = await startPayment(token, order.id).expect(409);

      expect(res.body).toMatchObject({ code: 'ORDER_EXPIRED' });
      expect(sessionsFor(order.id)).toHaveLength(0);
    });

    // The deadline is checked before a pending payment is reused, so an order
    // that can no longer be paid never gets its old page back.
    it('does not hand back a pending payment once the order has expired', async () => {
      const { order, token } = await placeOrder();
      await startPayment(token, order.id).expect(201);
      await prisma.order.update({
        where: { id: order.id },
        data: { expiresAt: new Date(Date.now() - 1_000) },
      });

      const res = await startPayment(token, order.id).expect(409);

      expect(res.body).toMatchObject({ code: 'ORDER_EXPIRED' });
    });

    it('records nothing when the provider fails', async () => {
      const { order, token } = await placeOrder();
      provider.createSession.mockRejectedValueOnce(
        new BadGatewayException('Payment provider unavailable'),
      );

      await startPayment(token, order.id).expect(502);

      expect(await paymentsOf(order.id)).toHaveLength(0);
    });
  });

  describe('reading a payment result', () => {
    const readResult = (token: string, orderId: string, paymentId: string) =>
      request(app.getHttpServer())
        .get(`/orders/${orderId}/payments/${paymentId}`)
        .set('Authorization', `Bearer ${token}`);

    /** A customer with an order and one pending payment on it. */
    const placeAndStart = async () => {
      const placed = await placeOrder();
      await startPayment(placed.token, placed.order.id).expect(201);
      const [payment] = await paymentsOf(placed.order.id);
      return { ...placed, payment };
    };

    it('reports a payment that has just started as pending', async () => {
      const { order, token, payment } = await placeAndStart();

      const res = await readResult(token, order.id, payment.id).expect(200);

      expect(res.body as PaymentResult).toEqual({
        id: payment.id,
        status: 'pending',
        order: { id: order.id, status: 'pending' },
      });
    });

    // Stands in for the webhook, which will be what moves both statuses.
    it('reports the result once the payment has been settled', async () => {
      const { order, token, payment } = await placeAndStart();
      await prisma.payment.update({ where: { id: payment.id }, data: { status: 'succeeded' } });
      await prisma.order.update({
        where: { id: order.id },
        data: { status: 'paid', paidAt: new Date() },
      });

      const res = await readResult(token, order.id, payment.id).expect(200);

      expect(res.body as PaymentResult).toMatchObject({
        status: 'succeeded',
        order: { status: 'paid' },
      });
    });

    // Why the attempt is in the URL: each return page asks about its own
    // attempt, so a declined first try never shows as the second's result.
    it('reports each attempt on an order as its own', async () => {
      const { order, token, payment: first } = await placeAndStart();
      await prisma.payment.update({ where: { id: first.id }, data: { status: 'failed' } });
      await startPayment(token, order.id).expect(201);
      const second = (await paymentsOf(order.id))[1];

      const firstRes = await readResult(token, order.id, first.id).expect(200);
      const secondRes = await readResult(token, order.id, second.id).expect(200);

      expect((firstRes.body as PaymentResult).status).toBe('failed');
      expect((secondRes.body as PaymentResult).status).toBe('pending');
    });

    it("answers 404 for another customer's payment", async () => {
      const { order, payment } = await placeAndStart();
      const { token: stranger } = await placeOrder();

      await readResult(stranger, order.id, payment.id).expect(404);
    });

    it('answers 404 for a payment under a different order of the same customer', async () => {
      const { order, token, payment } = await placeAndStart();
      const other = await prisma.order.create({
        data: {
          userId: order.userId,
          subtotalCents: 500,
          currency: 'TWD',
          expiresAt: new Date(Date.now() + PAYMENT_WINDOW_MS),
        },
      });

      await readResult(token, other.id, payment.id).expect(404);
    });

    it('answers 404 for a payment that does not exist', async () => {
      const { order, token } = await placeOrder();

      await readResult(token, order.id, randomUUID()).expect(404);
    });

    it('answers 401 without a session', async () => {
      const { order, payment } = await placeAndStart();

      await request(app.getHttpServer())
        .get(`/orders/${order.id}/payments/${payment.id}`)
        .expect(401);
    });
  });
});
