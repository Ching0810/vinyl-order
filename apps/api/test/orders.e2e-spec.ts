import { randomUUID } from 'node:crypto';

import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import {
  IDEMPOTENCY_KEY_HEADER,
  IDEMPOTENCY_KEY_MAX_LENGTH,
  type Availability,
  type Connection,
  type InsufficientStockError,
  type Order,
  type OrderSummary,
} from '@vinyl-order/shared';
import request from 'supertest';
import { App } from 'supertest/types';

import { AppModule } from '../src/app.module';
import type { JwtPayload } from '../src/auth/jwt.strategy';
import { PAYMENT_WINDOW_MS } from '../src/orders/checkout.service';
import { OrderExpiryService } from '../src/orders/order-expiry.service';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * Checkout against a real Postgres.
 *
 * These guarantees come from row locking and conditional writes, so a mocked
 * Prisma would pass every test here while proving nothing. Each test builds its
 * own users and listings rather than cleaning up, so tests can't see each
 * other's rows and the order they run in doesn't matter.
 */
describe('Orders (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let jwt: JwtService;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    // Listen for real rather than letting supertest start the server per
    // request: firing concurrent requests at a server that isn't listening yet
    // makes each one try to bind it.
    await app.listen(0);
    prisma = app.get(PrismaService);
    jwt = app.get(JwtService);
  });

  afterAll(async () => {
    await app.close();
  });

  /**
   * A listing in a shop's copied catalog, in stock unless said otherwise,
   * with the given count left to sell (tracker.md §8). Its album is what
   * checkout copies onto the order line, read from its title. Everything
   * else is filler.
   */
  const createEntry = async (
    stockQty: number | null,
    priceCents = 1_000,
    availability: Availability = 'in_stock',
  ) => {
    const album = `Album ${randomUUID().replaceAll('-', '')}`;
    const title = `Test Artist - ${album} LP`;
    const entry = await prisma.catalogEntry.create({
      data: {
        supplier: 'tht',
        externalId: randomUUID(),
        url: 'https://www.thtrecords.com/products/test',
        title,
        searchTitle: title.toLowerCase(),
        priceCents,
        availability,
        stockQty,
        isVinyl: true,
        isUsed: false,
        syncedAt: new Date(),
      },
    });
    return { ...entry, album };
  };

  /**
   * A signed-in customer whose cart holds `lines`, in that order.
   *
   * Built through Prisma and a token signed with the test secret, not through
   * /auth and /cart: those have tests of their own, and doing it here would
   * make a checkout test fail for reasons that have nothing to do with checkout.
   */
  const createBuyer = async (lines: { catalogEntryId: string; quantity: number }[]) => {
    const user = await prisma.user.create({
      data: {
        email: `buyer-${randomUUID()}@test.local`,
        // Never logged into with a password; the token below is the session.
        passwordHash: 'unused',
        cart: { create: { items: { create: lines } } },
      },
    });
    const payload: JwtPayload = { sub: user.id, email: user.email, role: user.role };
    return { user, token: jwt.sign(payload) };
  };

  /**
   * POST /orders, optionally carrying an idempotency key.
   *
   * @param token - the customer's session
   * @param idempotencyKey - the client's id for this attempt
   */
  const checkout = (token: string, idempotencyKey?: string) => {
    const call = request(app.getHttpServer())
      .post('/orders')
      .set('Authorization', `Bearer ${token}`);
    return idempotencyKey ? call.set(IDEMPOTENCY_KEY_HEADER, idempotencyKey) : call;
  };

  /** POST /orders/:id/cancel as the given customer. */
  const cancel = (token: string, orderId: string) =>
    request(app.getHttpServer())
      .post(`/orders/${orderId}/cancel`)
      .set('Authorization', `Bearer ${token}`);

  /**
   * A customer with a real placed order, so stock was actually held and a
   * cancel has something to release.
   */
  const placeOrder = async (stock: number, quantity: number) => {
    const entry = await createEntry(stock);
    const buyer = await createBuyer([{ catalogEntryId: entry.id, quantity }]);
    const placed = await checkout(buyer.token).expect(201);
    return { ...buyer, entry, order: placed.body as Order };
  };

  /** The demo's holds on a listing. */
  const heldOf = async (catalogEntryId: string) =>
    (await prisma.catalogEntry.findUniqueOrThrow({ where: { id: catalogEntryId } })).reservedQty;

  /** Copies left to sell: the shop's count less the demo's holds. */
  const leftOf = async (catalogEntryId: string) => {
    const entry = await prisma.catalogEntry.findUniqueOrThrow({ where: { id: catalogEntryId } });
    return entry.stockQty! - entry.reservedQty;
  };

  /**
   * The test the design doc calls "the one that matters": ten buyers, one
   * copy. Repeated because a race that loses once proves little — the bug
   * this guards against only shows up when the timing lines up.
   */
  it.each([1, 2, 3, 4, 5])(
    'sells the last copy exactly once under concurrent checkout (round %i)',
    async () => {
      const entry = await createEntry(1);
      const buyers = await Promise.all(
        Array.from({ length: 10 }, () => createBuyer([{ catalogEntryId: entry.id, quantity: 1 }])),
      );

      const responses = await Promise.all(buyers.map(({ token }) => checkout(token)));

      const placed = responses.filter((res) => res.status === 201);
      const refused = responses.filter((res) => res.status === 409);
      expect(placed).toHaveLength(1);
      expect(refused).toHaveLength(9);
      for (const res of refused) {
        const body = res.body as InsufficientStockError;
        expect(body.code).toBe('INSUFFICIENT_STOCK');
        expect(body.items).toEqual([
          { catalogEntryId: entry.id, title: entry.album, requested: 1, available: 0 },
        ]);
      }

      expect(await heldOf(entry.id)).toBe(1);
      expect(await prisma.orderItem.count({ where: { catalogEntryId: entry.id } })).toBe(1);

      // The losers rolled back, so their carts are untouched and they can
      // adjust and retry.
      const losers = buyers.filter((_, i) => responses[i].status === 409);
      const leftInCarts = await prisma.cartItem.count({
        where: { cart: { userId: { in: losers.map(({ user }) => user.id) } } },
      });
      expect(leftInCarts).toBe(9);
    },
  );

  /**
   * Opposite cart orders are the textbook deadlock: A locks X then wants Y, B
   * locks Y then wants X. With enough stock both must succeed; without the sort
   * in holdStock, Postgres would abort one of them.
   */
  it.each([1, 2, 3, 4, 5])(
    'does not deadlock when carts hold the same records in opposite order (round %i)',
    async () => {
      const [x, y] = await Promise.all([createEntry(10), createEntry(10)]);
      const [a, b] = await Promise.all([
        createBuyer([
          { catalogEntryId: x.id, quantity: 1 },
          { catalogEntryId: y.id, quantity: 1 },
        ]),
        createBuyer([
          { catalogEntryId: y.id, quantity: 1 },
          { catalogEntryId: x.id, quantity: 1 },
        ]),
      ]);

      const responses = await Promise.all([checkout(a.token), checkout(b.token)]);

      expect(responses.map((res) => res.status)).toEqual([201, 201]);
      expect([await leftOf(x.id), await leftOf(y.id)]).toEqual([8, 8]);
    },
  );

  /**
   * One buyer, two requests at once — a double click or a second tab. Both read
   * the same cart lines; only the one that deletes them may order.
   */
  it('places one order when the same cart is submitted twice at once', async () => {
    const entry = await createEntry(5);
    const { user, token } = await createBuyer([{ catalogEntryId: entry.id, quantity: 2 }]);

    const responses = await Promise.all([checkout(token), checkout(token)]);

    const statuses = responses.map((res) => res.status).sort();
    expect(statuses).toEqual([201, 409]);
    // Which code the loser gets depends on timing: CART_CHANGED if it read the
    // lines before the winner committed, CART_EMPTY if after. Both mean
    // "nothing was ordered".
    const loser = responses.find((res) => res.status === 409)!;
    expect(['CART_CHANGED', 'CART_EMPTY']).toContain((loser.body as { code: string }).code);

    expect(await leftOf(entry.id)).toBe(3);
    expect(await prisma.order.count({ where: { userId: user.id } })).toBe(1);
  });

  it('lists every short line at once, and holds nothing for the lines that fit', async () => {
    const [plenty, short, gone, soldOut] = await Promise.all([
      createEntry(10),
      createEntry(1),
      createEntry(0),
      createEntry(4),
    ]);
    await prisma.catalogEntry.update({
      where: { id: soldOut.id },
      data: { availability: 'sold_out' },
    });
    const { token } = await createBuyer([
      { catalogEntryId: plenty.id, quantity: 2 },
      { catalogEntryId: short.id, quantity: 3 },
      { catalogEntryId: gone.id, quantity: 1 },
      { catalogEntryId: soldOut.id, quantity: 1 },
    ]);

    const res = await checkout(token).expect(409);

    const body = res.body as InsufficientStockError;
    expect(body.code).toBe('INSUFFICIENT_STOCK');
    expect(body.items).toEqual(
      expect.arrayContaining([
        { catalogEntryId: short.id, title: short.album, requested: 3, available: 1 },
        { catalogEntryId: gone.id, title: gone.album, requested: 1, available: 0 },
        // Its count says 4, but the shop no longer sells it.
        { catalogEntryId: soldOut.id, title: soldOut.album, requested: 1, available: 0 },
      ]),
    );
    expect(body.items).toHaveLength(3);
    // All or nothing: the line that had stock was held, then rolled back.
    expect(await heldOf(plenty.id)).toBe(0);
  });

  it('refuses an empty cart', async () => {
    const { token } = await createBuyer([]);

    const res = await checkout(token).expect(409);

    expect((res.body as { code: string }).code).toBe('CART_EMPTY');
  });

  /**
   * No count to hold against (Rotten Blues): sold on availability alone, but
   * held all the same, so the cancel has a hold to release (tracker.md §8).
   */
  it('sells a listing with no count, and holds it', async () => {
    const entry = await createEntry(null);
    const { token } = await createBuyer([{ catalogEntryId: entry.id, quantity: 3 }]);

    const order = (await checkout(token).expect(201)).body as Order;
    expect(await heldOf(entry.id)).toBe(3);

    // A stock walk finds a count since; the cancel releases what was held.
    await prisma.catalogEntry.update({ where: { id: entry.id }, data: { stockQty: 1 } });
    await cancel(token, order.id).expect(200);
    expect(await heldOf(entry.id)).toBe(0);
  });

  /**
   * A pre-order the shop still takes is ordered now and shipped later: sold
   * and held like any listing, the hold released on cancel (§8).
   */
  it('sells a pre-order, and holds it', async () => {
    const entry = await createEntry(null, 1_000, 'pre_order');
    const { token } = await createBuyer([{ catalogEntryId: entry.id, quantity: 2 }]);

    const order = (await checkout(token).expect(201)).body as Order;
    expect(order.subtotalCents).toBe(2_000);
    expect(await heldOf(entry.id)).toBe(2);

    await cancel(token, order.id).expect(200);
    expect(await heldOf(entry.id)).toBe(0);
  });

  /** A pre-order the shop has closed is read as sold out (§6.2): not sold. */
  it('refuses a listing sold out since it was added', async () => {
    const entry = await createEntry(null, 1_000, 'sold_out');
    const { token } = await createBuyer([{ catalogEntryId: entry.id, quantity: 1 }]);

    const res = await checkout(token).expect(409);

    expect((res.body as InsufficientStockError).items).toEqual([
      { catalogEntryId: entry.id, title: entry.album, requested: 1, available: 0 },
    ]);
    expect(await heldOf(entry.id)).toBe(0);
  });

  /**
   * The walk lowering the shop's count under what the demo holds: nothing
   * more can be sold, and the holds stand until their orders end.
   */
  it('sells nothing more once the shop’s count falls under the holds', async () => {
    const { token, entry, order } = await placeOrder(5, 2);
    await prisma.catalogEntry.update({ where: { id: entry.id }, data: { stockQty: 1 } });
    const late = await createBuyer([{ catalogEntryId: entry.id, quantity: 1 }]);

    const res = await checkout(late.token).expect(409);

    expect((res.body as InsufficientStockError).items).toEqual([
      { catalogEntryId: entry.id, title: entry.album, requested: 1, available: 0 },
    ]);
    await cancel(token, order.id).expect(200);
    expect(await heldOf(entry.id)).toBe(0);
  });

  it('requires a signed-in user', async () => {
    await request(app.getHttpServer()).post('/orders').expect(401);
  });

  /**
   * An order is a fact: the shop repricing or taking the listing down
   * afterwards must not change what was bought or what it cost.
   */
  it('snapshots price, title and shop, surviving a reprice and a delete', async () => {
    const entry = await createEntry(5, 1_500);
    const { token } = await createBuyer([{ catalogEntryId: entry.id, quantity: 2 }]);

    const res = await checkout(token).expect(201);
    const order = res.body as Order;

    expect(order).toMatchObject({
      status: 'pending',
      subtotalCents: 3_000,
      currency: 'TWD',
      lineCount: 1,
      items: [
        {
          productId: null,
          supplier: 'tht',
          quantity: 2,
          unitPriceCents: 1_500,
          lineTotalCents: 3_000,
          title: entry.album,
          artist: 'Test Artist',
        },
      ],
    });
    // The server cleared the cart it ordered from.
    expect(await prisma.cartItem.count({ where: { catalogEntryId: entry.id } })).toBe(0);

    await prisma.catalogEntry.update({ where: { id: entry.id }, data: { priceCents: 9_999 } });
    await prisma.catalogEntry.delete({ where: { id: entry.id } });

    const stored = await prisma.order.findUniqueOrThrow({
      where: { id: order.id },
      include: { items: true },
    });
    expect(stored.subtotalCents).toBe(3_000);
    expect(stored.items).toEqual([
      expect.objectContaining({
        // Link nulled by the delete; the snapshot is what's left to render.
        catalogEntryId: null,
        supplier: 'tht',
        unitPriceCents: 1_500,
        title: entry.album,
      }),
    ]);
  });

  /**
   * A retry is not a second order. The cart claim already stops a double
   * submit, but it cannot help once the cart is empty — which is exactly the
   * state a retry arrives in. See docs/design/idempotency.md.
   */
  describe('idempotency key', () => {
    it('answers a repeat with the order the first request placed', async () => {
      const entry = await createEntry(5);
      const { user, token } = await createBuyer([{ catalogEntryId: entry.id, quantity: 2 }]);
      const key = randomUUID();

      const first = await checkout(token, key).expect(201);
      // The cart is empty by now: without the key this would be CART_EMPTY.
      const repeat = await checkout(token, key).expect(200);

      expect((repeat.body as Order).id).toBe((first.body as Order).id);
      expect(await prisma.order.count({ where: { userId: user.id } })).toBe(1);
      // Stock moved once, for the first request only.
      expect(await leftOf(entry.id)).toBe(3);
    });

    it.each([1, 2, 3])(
      'places one order when the same key arrives twice at once (round %i)',
      async () => {
        const entry = await createEntry(5);
        const { user, token } = await createBuyer([{ catalogEntryId: entry.id, quantity: 1 }]);
        const key = randomUUID();

        const responses = await Promise.all([checkout(token, key), checkout(token, key)]);

        expect(await prisma.order.count({ where: { userId: user.id } })).toBe(1);
        expect(await leftOf(entry.id)).toBe(4);

        // One request created the order; the other either reads it back, or —
        // in the window before the winner commits — is asked to retry.
        const created = responses.find((res) => res.status === 201);
        const loser = responses.find((res) => res !== created);
        expect(created).toBeDefined();
        if (loser?.status === 200) {
          expect((loser.body as Order).id).toBe((created?.body as Order).id);
        } else {
          expect(loser?.status).toBe(409);
          expect((loser?.body as { code: string }).code).toBe('CHECKOUT_IN_PROGRESS');
        }
      },
    );

    it('treats a different key as a new attempt', async () => {
      const entry = await createEntry(5);
      const { token } = await createBuyer([{ catalogEntryId: entry.id, quantity: 1 }]);

      await checkout(token, randomUUID()).expect(201);
      // A new attempt against a cart the first one consumed.
      const second = await checkout(token, randomUUID()).expect(409);

      expect(['CART_EMPTY', 'CART_CHANGED']).toContain((second.body as { code: string }).code);
    });

    it('scopes keys to the customer', async () => {
      const entry = await createEntry(5);
      const key = 'shared-key-not-a-uuid';
      const alice = await createBuyer([{ catalogEntryId: entry.id, quantity: 1 }]);
      const bob = await createBuyer([{ catalogEntryId: entry.id, quantity: 1 }]);

      const first = await checkout(alice.token, key).expect(201);
      // Bob's checkout is untouched by Alice having used the same string.
      const second = await checkout(bob.token, key).expect(201);

      expect((second.body as Order).id).not.toBe((first.body as Order).id);
    });

    /** A failed attempt writes no order, so its key is free to try again. */
    it('does not consume the key when the checkout failed', async () => {
      const entry = await createEntry(1);
      const { user, token } = await createBuyer([{ catalogEntryId: entry.id, quantity: 5 }]);
      const key = randomUUID();

      await checkout(token, key).expect(409);
      await prisma.catalogEntry.update({ where: { id: entry.id }, data: { stockQty: 5 } });
      const retry = await checkout(token, key).expect(201);

      expect((retry.body as Order).lineCount).toBe(1);
      expect(await prisma.order.count({ where: { userId: user.id } })).toBe(1);
    });

    it('refuses an over-long key without ordering anything', async () => {
      const entry = await createEntry(5);
      const { user, token } = await createBuyer([{ catalogEntryId: entry.id, quantity: 1 }]);

      await checkout(token, 'k'.repeat(IDEMPOTENCY_KEY_MAX_LENGTH + 1)).expect(400);

      expect(await prisma.order.count({ where: { userId: user.id } })).toBe(0);
      expect(await leftOf(entry.id)).toBe(5);
    });
  });

  describe('cancelling', () => {
    type NotPendingError = { code: string; status: string };

    it('cancels a pending order and releases its hold', async () => {
      const { token, entry, order } = await placeOrder(5, 2);
      expect(await leftOf(entry.id)).toBe(3);

      const res = await cancel(token, order.id).expect(200);

      const body = res.body as Order;
      expect(body.status).toBe('cancelled');
      expect(body.cancelReason).toBe('customer');
      expect(body.cancelledAt).not.toBeNull();
      expect(await leftOf(entry.id)).toBe(5);
    });

    it('refuses a second cancel and releases the hold only once', async () => {
      const { token, entry, order } = await placeOrder(5, 2);

      await cancel(token, order.id).expect(200);
      const second = await cancel(token, order.id).expect(409);

      expect(second.body as NotPendingError).toEqual(
        expect.objectContaining({ code: 'ORDER_NOT_PENDING', status: 'cancelled' }),
      );
      expect(await leftOf(entry.id)).toBe(5);
    });

    /**
     * The guarantee the sweeper will lean on: however many cancellers arrive
     * together, one wins and the copies come back once. Repeated for the same
     * reason as the checkout races.
     */
    it.each([1, 2, 3, 4, 5])(
      'releases the hold once when two cancels race (round %i)',
      async () => {
        const { token, entry, order } = await placeOrder(5, 2);

        const responses = await Promise.all([cancel(token, order.id), cancel(token, order.id)]);

        expect(responses.map((res) => res.status).sort()).toEqual([200, 409]);
        expect(await leftOf(entry.id)).toBe(5);
      },
    );

    /** The shop took a listing down, and the sync deleted it, holds and all. */
    it('skips a line whose listing was deleted and releases the rest', async () => {
      const [kept, deleted] = await Promise.all([createEntry(5), createEntry(5)]);
      const { token } = await createBuyer([
        { catalogEntryId: kept.id, quantity: 2 },
        { catalogEntryId: deleted.id, quantity: 1 },
      ]);
      const order = (await checkout(token).expect(201)).body as Order;
      await prisma.catalogEntry.delete({ where: { id: deleted.id } });

      await cancel(token, order.id).expect(200);

      expect(await leftOf(kept.id)).toBe(5);
    });

    it("hides another customer's order and leaves it pending", async () => {
      const { order } = await placeOrder(5, 1);
      const stranger = await createBuyer([]);

      await cancel(stranger.token, order.id).expect(404);

      const after = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
      expect(after.status).toBe('pending');
    });

    it('refuses to cancel a paid order and keeps its hold', async () => {
      const { token, entry, order } = await placeOrder(5, 2);
      await prisma.order.update({
        where: { id: order.id },
        data: { status: 'paid', paidAt: new Date() },
      });

      const res = await cancel(token, order.id).expect(409);

      expect(res.body as NotPendingError).toEqual(
        expect.objectContaining({ code: 'ORDER_NOT_PENDING', status: 'paid' }),
      );
      expect(await leftOf(entry.id)).toBe(3);
    });
  });

  /**
   * The sweep is called directly: the scheduler is not loaded under test, so
   * nothing sweeps behind a test's back. Other tests' expired orders may be
   * swept too, so assertions look at each test's own order, never at the count
   * a sweep returns.
   */
  describe('expiring', () => {
    let expiry: OrderExpiryService;

    beforeAll(() => {
      expiry = app.get(OrderExpiryService);
    });

    /** Move an order's deadline into the past, as if the window had run out. */
    const expire = (orderId: string) =>
      prisma.order.update({
        where: { id: orderId },
        data: { expiresAt: new Date(Date.now() - 1_000) },
      });

    const orderRow = (orderId: string) =>
      prisma.order.findUniqueOrThrow({ where: { id: orderId } });

    it('cancels an order past its deadline and releases its hold', async () => {
      const { entry, order } = await placeOrder(5, 2);
      await expire(order.id);

      await expiry.sweep();

      const after = await orderRow(order.id);
      expect(after.status).toBe('cancelled');
      expect(after.cancelReason).toBe('expired');
      expect(after.cancelledAt).not.toBeNull();
      expect(await leftOf(entry.id)).toBe(5);
    });

    it('leaves an order alone before its deadline', async () => {
      const { entry, order } = await placeOrder(5, 2);

      await expiry.sweep();

      expect((await orderRow(order.id)).status).toBe('pending');
      expect(await leftOf(entry.id)).toBe(3);
    });

    it('leaves a paid order alone even past its deadline', async () => {
      const { entry, order } = await placeOrder(5, 2);
      await prisma.order.update({
        where: { id: order.id },
        data: { status: 'paid', paidAt: new Date(), expiresAt: new Date(Date.now() - 1_000) },
      });

      await expiry.sweep();

      expect((await orderRow(order.id)).status).toBe('paid');
      expect(await leftOf(entry.id)).toBe(3);
    });

    /** What running on several instances looks like: overlapping sweeps. */
    it.each([1, 2, 3, 4, 5])(
      'releases the hold once when two sweeps overlap (round %i)',
      async () => {
        const { entry, order } = await placeOrder(5, 2);
        await expire(order.id);

        await Promise.all([expiry.sweep(), expiry.sweep()]);

        expect((await orderRow(order.id)).status).toBe('cancelled');
        expect(await leftOf(entry.id)).toBe(5);
      },
    );

    /**
     * The customer presses Cancel as the deadline passes. One of them wins,
     * the order says which, and the copies come back once.
     */
    it.each([1, 2, 3, 4, 5])(
      'releases the hold once when the customer and the sweep race (round %i)',
      async () => {
        const { token, entry, order } = await placeOrder(5, 2);
        await expire(order.id);

        const [res] = await Promise.all([cancel(token, order.id), expiry.sweep()]);

        const after = await orderRow(order.id);
        expect(after.status).toBe('cancelled');
        expect(after.cancelReason).toBe(res.status === 200 ? 'customer' : 'expired');
        expect(await leftOf(entry.id)).toBe(5);
      },
    );
  });

  describe('order history', () => {
    /**
     * An order written directly, with a chosen timestamp so tests know the
     * expected order. Checkout is covered above; here it would only add noise.
     */
    const createOrder = (
      userId: string,
      createdAt: Date,
      lines: { title: string; quantity?: number }[] = [{ title: 'Some Album' }],
    ) =>
      prisma.order.create({
        data: {
          userId,
          currency: 'TWD',
          subtotalCents: 1_000 * lines.length,
          createdAt,
          expiresAt: new Date(createdAt.getTime() + PAYMENT_WINDOW_MS),
          items: {
            create: lines.map(({ title, quantity = 1 }) => ({
              title,
              quantity,
              artist: 'Test Artist',
              unitPriceCents: 1_000,
            })),
          },
        },
      });

    /** Minutes after a fixed instant, so "newer" is unambiguous. */
    const at = (minutes: number) => new Date(Date.UTC(2026, 0, 1, 0, minutes));

    const get = (token: string, path: string) =>
      request(app.getHttpServer()).get(path).set('Authorization', `Bearer ${token}`);

    const listPage = async (token: string, query: string) =>
      (await get(token, `/orders?${query}`).expect(200)).body as Connection<OrderSummary>;

    it('lists only my orders, newest first, with their line counts', async () => {
      const { user, token } = await createBuyer([]);
      const other = await createBuyer([]);
      const oldest = await createOrder(user.id, at(1));
      const middle = await createOrder(user.id, at(2));
      const newest = await createOrder(user.id, at(3), [
        { title: 'E' },
        { title: 'B', quantity: 2 },
        { title: 'D' },
        { title: 'A' },
        { title: 'C' },
      ]);
      await createOrder(other.user.id, at(4));

      const page = await listPage(token, '');

      expect(page.edges.map((edge) => edge.node.id)).toEqual([newest.id, middle.id, oldest.id]);
      const summary = page.edges[0].node;
      // Five records, counted without loading them: a history row never
      // carries the lines themselves.
      expect(summary.lineCount).toBe(5);
      expect(summary).not.toHaveProperty('items');
      expect(page.pageInfo).toMatchObject({ hasNextPage: false, hasPreviousPage: false });
      // Counts my orders only, like the page itself.
      expect(page.totalCount).toBe(3);
    });

    it('pages forward and backward over every order exactly once', async () => {
      const { user, token } = await createBuyer([]);
      const orders: { id: string }[] = [];
      for (let minute = 1; minute <= 5; minute++) {
        orders.push(await createOrder(user.id, at(minute)));
      }
      const newestFirst = orders.map((order) => order.id).reverse();

      const forward: string[] = [];
      let after = '';
      let hasNextPage = true;
      while (hasNextPage) {
        const page = await listPage(token, `first=2${after && `&after=${after}`}`);
        forward.push(...page.edges.map((edge) => edge.node.id));
        ({ hasNextPage } = page.pageInfo);
        after = page.pageInfo.endCursor ?? '';
      }
      expect(forward).toEqual(newestFirst);

      // Backward from the oldest end, prepending each page.
      const backward: string[] = [];
      let before = '';
      let hasPreviousPage = true;
      while (hasPreviousPage) {
        const page = await listPage(token, `last=2${before && `&before=${before}`}`);
        backward.unshift(...page.edges.map((edge) => edge.node.id));
        ({ hasPreviousPage } = page.pageInfo);
        before = page.pageInfo.startCursor ?? '';
      }
      expect(backward).toEqual(newestFirst);
    });

    /**
     * Two checkouts in the same millisecond tie on createdAt. Without the id
     * tie-breaker, a page boundary between them could repeat one and skip the
     * other.
     */
    it('pages through orders that share a timestamp without repeats or gaps', async () => {
      const { user, token } = await createBuyer([]);
      const tied = await Promise.all([1, 2, 3].map(() => createOrder(user.id, at(1))));

      const seen: string[] = [];
      let after = '';
      for (let i = 0; i < tied.length; i++) {
        const page = await listPage(token, `first=1${after && `&after=${after}`}`);
        seen.push(page.edges[0].node.id);
        after = page.pageInfo.endCursor ?? '';
      }

      expect(seen).toEqual(
        tied
          .map((order) => order.id)
          .sort()
          .reverse(),
      );
    });

    it('returns an empty page for a customer with no orders, or an unknown cursor', async () => {
      const { user, token } = await createBuyer([]);

      const empty = await listPage(token, '');
      expect(empty).toEqual({
        edges: [],
        pageInfo: {
          hasNextPage: false,
          hasPreviousPage: false,
          startCursor: null,
          endCursor: null,
        },
        totalCount: 0,
      });

      await createOrder(user.id, at(1));
      const unknown = Buffer.from(randomUUID()).toString('base64url');
      expect((await listPage(token, `first=10&after=${unknown}`)).edges).toEqual([]);
    });

    it('shows my order with every line', async () => {
      const { user, token } = await createBuyer([]);
      const order = await createOrder(user.id, at(1), [
        { title: 'B', quantity: 2 },
        { title: 'A' },
        { title: 'C' },
        { title: 'D' },
      ]);

      const res = await get(token, `/orders/${order.id}`).expect(200);

      const body = res.body as Order;
      expect(body.id).toBe(order.id);
      expect(body.lineCount).toBe(4);
      expect(body.items.map((item) => [item.title, item.quantity])).toEqual([
        ['A', 1],
        ['B', 2],
        ['C', 1],
        ['D', 1],
      ]);
    });

    it("answers 404 for another customer's order, as for one that doesn't exist", async () => {
      const owner = await createBuyer([]);
      const stranger = await createBuyer([]);
      const order = await createOrder(owner.user.id, at(1));

      await get(stranger.token, `/orders/${order.id}`).expect(404);
      await get(stranger.token, `/orders/${randomUUID()}`).expect(404);
    });

    it('requires a signed-in user', async () => {
      await request(app.getHttpServer()).get('/orders').expect(401);
      await request(app.getHttpServer()).get(`/orders/${randomUUID()}`).expect(401);
    });
  });
});
