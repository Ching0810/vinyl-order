import { createHmac, randomUUID } from 'node:crypto';

import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';

import { AppModule } from '../src/app.module';
import { PAYMENT_WINDOW_MS } from '../src/orders/checkout.service';
import { OrderExpiryService } from '../src/orders/order-expiry.service';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * Settling payments from webhooks, against a real Postgres.
 *
 * The tests sign webhooks themselves and send them straight to the endpoint,
 * so they choose exactly what arrives and when: twice, out of order, or at the
 * same moment the order expires. What keeps each of those correct is a primary
 * key or a conditional update, which only a real database can prove.
 */
describe('Payment webhooks (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let expiry: OrderExpiryService;
  let secret: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    // As main.ts does: signatures are checked over the raw body.
    app = moduleRef.createNestApplication({ rawBody: true });
    // Listen for real, as the other suites that fire concurrent requests do.
    await app.listen(0);
    prisma = app.get(PrismaService);
    expiry = app.get(OrderExpiryService);
    secret = app.get(ConfigService).getOrThrow<string>('MOCKPAY_WEBHOOK_SECRET');
  });

  afterAll(async () => {
    await app.close();
  });

  /**
   * A pending NT$17.50 order for one copy, with that copy already taken from
   * stock (5 → 4) as checkout would, and one pending payment on it.
   */
  const placeOrderWithPayment = async (orderFields: Record<string, unknown> = {}) => {
    const user = await prisma.user.create({
      data: { email: `payer-${randomUUID()}@test.local`, passwordHash: 'unused' },
    });
    const product = await prisma.product.create({
      data: { title: `Album ${randomUUID()}`, artist: 'Test Artist', priceCents: 1_750, stock: 4 },
    });
    const order = await prisma.order.create({
      data: {
        userId: user.id,
        subtotalCents: 1_750,
        currency: 'TWD',
        expiresAt: new Date(Date.now() + PAYMENT_WINDOW_MS),
        items: {
          create: [
            {
              productId: product.id,
              quantity: 1,
              unitPriceCents: 1_750,
              title: product.title,
              artist: product.artist,
            },
          ],
        },
        ...orderFields,
      },
    });
    const payment = await prisma.payment.create({
      data: {
        orderId: order.id,
        providerSessionId: `mps_${randomUUID()}`,
        amountCents: 1_750,
        currency: 'TWD',
        redirectUrl: 'https://pay.test/checkout',
      },
    });
    return { order, payment, product };
  };

  /** A webhook body in MockPay's format. */
  const webhook = (
    type: 'payment.succeeded' | 'payment.failed',
    sessionId: string,
    { id = `evt_${randomUUID()}`, amountCents = 1_750, currency = 'TWD' } = {},
  ) =>
    JSON.stringify({
      id,
      type,
      createdAt: new Date().toISOString(),
      data: { sessionId, orderId: 'unused', amountCents, currency },
    });

  /** POST the body to the webhook endpoint, signed as MockPay would sign it. */
  const deliver = (body: string, key = secret) => {
    const t = Math.floor(Date.now() / 1000);
    const v1 = createHmac('sha256', key).update(`${t}.${body}`).digest('hex');
    return request(app.getHttpServer())
      .post('/payments/webhook')
      .set('Content-Type', 'application/json')
      .set('MockPay-Signature', `t=${t},v1=${v1}`)
      .send(body);
  };

  const statusOf = async (orderId: string, paymentId: string) => ({
    order: await prisma.order.findUniqueOrThrow({ where: { id: orderId } }),
    payment: await prisma.payment.findUniqueOrThrow({ where: { id: paymentId } }),
  });

  describe('settling a payment', () => {
    it('pays the order when the payment succeeds', async () => {
      const { order, payment } = await placeOrderWithPayment();

      const res = await deliver(webhook('payment.succeeded', payment.providerSessionId)).expect(
        200,
      );

      expect(res.body).toEqual({ received: true });
      const after = await statusOf(order.id, payment.id);
      expect(after.payment.status).toBe('succeeded');
      expect(after.order.status).toBe('paid');
      expect(after.order.paidAt).toBeInstanceOf(Date);
    });

    // A decline is not a transition: the customer may try again until expiry.
    it('fails the payment but leaves the order payable when it is declined', async () => {
      const { order, payment } = await placeOrderWithPayment();

      await deliver(webhook('payment.failed', payment.providerSessionId)).expect(200);

      const after = await statusOf(order.id, payment.id);
      expect(after.payment.status).toBe('failed');
      expect(after.order.status).toBe('pending');
    });

    it('pays the order through a second attempt after the first was declined', async () => {
      const { order, payment: first } = await placeOrderWithPayment();
      await deliver(webhook('payment.failed', first.providerSessionId)).expect(200);
      const second = await prisma.payment.create({
        data: {
          orderId: order.id,
          providerSessionId: `mps_${randomUUID()}`,
          amountCents: 1_750,
          currency: 'TWD',
          redirectUrl: 'https://pay.test/checkout',
        },
      });

      await deliver(webhook('payment.succeeded', second.providerSessionId)).expect(200);

      const after = await statusOf(order.id, second.id);
      expect(after.payment.status).toBe('succeeded');
      expect(after.order.status).toBe('paid');
      expect((await statusOf(order.id, first.id)).payment.status).toBe('failed');
    });

    it('refuses a payment for the wrong amount and leaves the order unpaid', async () => {
      const { order, payment } = await placeOrderWithPayment();

      await deliver(
        webhook('payment.succeeded', payment.providerSessionId, { amountCents: 1 }),
      ).expect(200);

      const after = await statusOf(order.id, payment.id);
      expect(after.payment.status).toBe('failed');
      expect(after.order.status).toBe('pending');
    });

    // Not ours, or older than our records: a retry would change nothing.
    it('answers 200 for a session it does not know, and changes nothing', async () => {
      const id = `evt_${randomUUID()}`;

      await deliver(webhook('payment.succeeded', `mps_${randomUUID()}`, { id })).expect(200);

      expect(await prisma.paymentEvent.count({ where: { id } })).toBe(1);
    });
  });

  describe('a redelivered event', () => {
    it('is handled once however many times it arrives', async () => {
      const { order, payment } = await placeOrderWithPayment();
      const id = `evt_${randomUUID()}`;
      const body = webhook('payment.succeeded', payment.providerSessionId, { id });

      await deliver(body).expect(200);
      await deliver(body).expect(200);

      const after = await statusOf(order.id, payment.id);
      expect(after.order.status).toBe('paid');
      expect(await prisma.paymentEvent.count({ where: { id } })).toBe(1);
    });

    // The second insert of the same id waits on the first transaction's key,
    // then fails on it: still one event, still answered 200.
    it('is handled once when copies arrive at the same moment', async () => {
      const { order, payment } = await placeOrderWithPayment();
      const id = `evt_${randomUUID()}`;
      const body = webhook('payment.succeeded', payment.providerSessionId, { id });

      const responses = await Promise.all(Array.from({ length: 5 }, () => deliver(body)));

      expect(responses.map((res) => res.status)).toEqual([200, 200, 200, 200, 200]);
      expect(await prisma.paymentEvent.count({ where: { id } })).toBe(1);
      expect((await statusOf(order.id, payment.id)).order.status).toBe('paid');
    });
  });

  describe('events out of order', () => {
    it('keeps a success when a decline for the same session arrives after it', async () => {
      const { order, payment } = await placeOrderWithPayment();

      await deliver(webhook('payment.succeeded', payment.providerSessionId)).expect(200);
      await deliver(webhook('payment.failed', payment.providerSessionId)).expect(200);

      const after = await statusOf(order.id, payment.id);
      expect(after.payment.status).toBe('succeeded');
      expect(after.order.status).toBe('paid');
    });

    // The money was taken, so a success is the last word.
    it('takes a success that arrives after a decline for the same session', async () => {
      const { order, payment } = await placeOrderWithPayment();

      await deliver(webhook('payment.failed', payment.providerSessionId)).expect(200);
      await deliver(webhook('payment.succeeded', payment.providerSessionId)).expect(200);

      const after = await statusOf(order.id, payment.id);
      expect(after.payment.status).toBe('succeeded');
      expect(after.order.status).toBe('paid');
    });
  });

  describe('payment against expiry', () => {
    /**
     * The race the design calls the paid-after-cancelled window (§8.4): the
     * payment and the sweeper reach the same expired order at once. Repeated,
     * because a race that loses once proves little.
     */
    it.each([1, 2, 3, 4, 5])(
      'ends either paid with the stock taken or cancelled with it returned (round %i)',
      async () => {
        const { order, payment, product } = await placeOrderWithPayment({
          expiresAt: new Date(Date.now() - 1_000),
        });

        await Promise.all([
          deliver(webhook('payment.succeeded', payment.providerSessionId)).expect(200),
          expiry.sweep(),
        ]);

        const after = await statusOf(order.id, payment.id);
        const { stock } = await prisma.product.findUniqueOrThrow({ where: { id: product.id } });
        // Never both, never neither.
        expect(['paid', 'cancelled']).toContain(after.order.status);
        expect(stock).toBe(after.order.status === 'paid' ? 4 : 5);
        // Either way the money was taken, and that is recorded.
        expect(after.payment.status).toBe('succeeded');
      },
    );

    it('records a payment that lands after the order was cancelled, and leaves it cancelled', async () => {
      const { order, payment } = await placeOrderWithPayment({
        status: 'cancelled',
        cancelledAt: new Date(),
        cancelReason: 'expired',
      });

      await deliver(webhook('payment.succeeded', payment.providerSessionId)).expect(200);

      const after = await statusOf(order.id, payment.id);
      expect(after.payment.status).toBe('succeeded');
      expect(after.order.status).toBe('cancelled');
    });
  });

  it('refuses a webhook not signed with the secret, and changes nothing', async () => {
    const { order, payment } = await placeOrderWithPayment();
    const id = `evt_${randomUUID()}`;
    const body = webhook('payment.succeeded', payment.providerSessionId, { id });

    await deliver(body, 'not-the-secret').expect(400);

    const after = await statusOf(order.id, payment.id);
    expect(after.payment.status).toBe('pending');
    expect(after.order.status).toBe('pending');
    expect(await prisma.paymentEvent.count({ where: { id } })).toBe(0);
  });
});
