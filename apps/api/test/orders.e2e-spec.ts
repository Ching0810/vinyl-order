import { randomUUID } from 'node:crypto';

import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import {
  IDEMPOTENCY_KEY_HEADER,
  IDEMPOTENCY_KEY_MAX_LENGTH,
  type Connection,
  type InsufficientStockError,
  type Order,
  type OrderSummary,
} from '@vinyl-order/shared';
import request from 'supertest';
import { App } from 'supertest/types';

import { AppModule } from '../src/app.module';
import type { JwtPayload } from '../src/auth/jwt.strategy';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * Checkout against a real Postgres.
 *
 * These guarantees come from row locking and conditional writes, so a mocked
 * Prisma would pass every test here while proving nothing. Each test builds its
 * own users and products rather than cleaning up, so tests can't see each
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

  /** A product with the given stock. Everything else is filler. */
  const createProduct = (stock: number, priceCents = 1_000) =>
    prisma.product.create({
      data: { title: `Album ${randomUUID()}`, artist: 'Test Artist', priceCents, stock },
    });

  /**
   * A signed-in customer whose cart holds `lines`, in that order.
   *
   * Built through Prisma and a token signed with the test secret, not through
   * /auth and /cart: those have tests of their own, and doing it here would
   * make a checkout test fail for reasons that have nothing to do with checkout.
   */
  const createBuyer = async (lines: { productId: string; quantity: number }[]) => {
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

  /**
   * The test the design doc calls "the one that matters": ten buyers, one
   * copy. Repeated because a race that loses once proves little — the bug
   * this guards against only shows up when the timing lines up.
   */
  it.each([1, 2, 3, 4, 5])(
    'sells the last copy exactly once under concurrent checkout (round %i)',
    async () => {
      const product = await createProduct(1);
      const buyers = await Promise.all(
        Array.from({ length: 10 }, () => createBuyer([{ productId: product.id, quantity: 1 }])),
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
          { productId: product.id, title: product.title, requested: 1, available: 0 },
        ]);
      }

      const after = await prisma.product.findUniqueOrThrow({ where: { id: product.id } });
      expect(after.stock).toBe(0);
      expect(await prisma.orderItem.count({ where: { productId: product.id } })).toBe(1);

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
   * in takeStock, Postgres would abort one of them.
   */
  it.each([1, 2, 3, 4, 5])(
    'does not deadlock when carts hold the same records in opposite order (round %i)',
    async () => {
      const [x, y] = await Promise.all([createProduct(10), createProduct(10)]);
      const [a, b] = await Promise.all([
        createBuyer([
          { productId: x.id, quantity: 1 },
          { productId: y.id, quantity: 1 },
        ]),
        createBuyer([
          { productId: y.id, quantity: 1 },
          { productId: x.id, quantity: 1 },
        ]),
      ]);

      const responses = await Promise.all([checkout(a.token), checkout(b.token)]);

      expect(responses.map((res) => res.status)).toEqual([201, 201]);
      const stock = await prisma.product.findMany({
        where: { id: { in: [x.id, y.id] } },
        select: { stock: true },
      });
      expect(stock).toEqual([{ stock: 8 }, { stock: 8 }]);
    },
  );

  /**
   * One buyer, two requests at once — a double click or a second tab. Both read
   * the same cart lines; only the one that deletes them may order.
   */
  it('places one order when the same cart is submitted twice at once', async () => {
    const product = await createProduct(5);
    const { user, token } = await createBuyer([{ productId: product.id, quantity: 2 }]);

    const responses = await Promise.all([checkout(token), checkout(token)]);

    const statuses = responses.map((res) => res.status).sort();
    expect(statuses).toEqual([201, 409]);
    // Which code the loser gets depends on timing: CART_CHANGED if it read the
    // lines before the winner committed, CART_EMPTY if after. Both mean
    // "nothing was ordered".
    const loser = responses.find((res) => res.status === 409)!;
    expect(['CART_CHANGED', 'CART_EMPTY']).toContain((loser.body as { code: string }).code);

    const after = await prisma.product.findUniqueOrThrow({ where: { id: product.id } });
    expect(after.stock).toBe(3);
    expect(await prisma.order.count({ where: { userId: user.id } })).toBe(1);
  });

  it('lists every short line at once, and takes no stock from the lines that fit', async () => {
    const [plenty, short, gone] = await Promise.all([
      createProduct(10),
      createProduct(1),
      createProduct(0),
    ]);
    const { token } = await createBuyer([
      { productId: plenty.id, quantity: 2 },
      { productId: short.id, quantity: 3 },
      { productId: gone.id, quantity: 1 },
    ]);

    const res = await checkout(token).expect(409);

    const body = res.body as InsufficientStockError;
    expect(body.code).toBe('INSUFFICIENT_STOCK');
    expect(body.items).toEqual(
      expect.arrayContaining([
        { productId: short.id, title: short.title, requested: 3, available: 1 },
        { productId: gone.id, title: gone.title, requested: 1, available: 0 },
      ]),
    );
    expect(body.items).toHaveLength(2);
    // All or nothing: the line that had stock was decremented, then rolled back.
    const after = await prisma.product.findUniqueOrThrow({ where: { id: plenty.id } });
    expect(after.stock).toBe(10);
  });

  it('refuses an empty cart', async () => {
    const { token } = await createBuyer([]);

    const res = await checkout(token).expect(409);

    expect((res.body as { code: string }).code).toBe('CART_EMPTY');
  });

  it('refuses a cart that mixes currencies', async () => {
    const [twd, usd] = await Promise.all([createProduct(5), createProduct(5)]);
    await prisma.product.update({ where: { id: usd.id }, data: { currency: 'USD' } });
    const { token } = await createBuyer([
      { productId: twd.id, quantity: 1 },
      { productId: usd.id, quantity: 1 },
    ]);

    const res = await checkout(token).expect(409);

    expect((res.body as { code: string }).code).toBe('MIXED_CURRENCY');
  });

  it('requires a signed-in user', async () => {
    await request(app.getHttpServer()).post('/orders').expect(401);
  });

  /**
   * An order is a fact: repricing or deleting a product afterwards must not
   * change what was bought or what it cost.
   */
  it('snapshots price and title, surviving a reprice and a delete', async () => {
    const product = await createProduct(5, 1_500);
    const { token } = await createBuyer([{ productId: product.id, quantity: 2 }]);

    const res = await checkout(token).expect(201);
    const order = res.body as Order;

    expect(order).toMatchObject({
      status: 'pending',
      subtotalCents: 3_000,
      currency: 'TWD',
      lineCount: 1,
      items: [
        {
          productId: product.id,
          quantity: 2,
          unitPriceCents: 1_500,
          lineTotalCents: 3_000,
          title: product.title,
          artist: product.artist,
        },
      ],
    });
    // The server cleared the cart it ordered from.
    expect(await prisma.cartItem.count({ where: { productId: product.id } })).toBe(0);

    await prisma.product.update({ where: { id: product.id }, data: { priceCents: 9_999 } });
    await prisma.product.delete({ where: { id: product.id } });

    const stored = await prisma.order.findUniqueOrThrow({
      where: { id: order.id },
      include: { items: true },
    });
    expect(stored.subtotalCents).toBe(3_000);
    expect(stored.items).toEqual([
      expect.objectContaining({
        // Link nulled by the delete; the snapshot is what's left to render.
        productId: null,
        unitPriceCents: 1_500,
        title: product.title,
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
      const product = await createProduct(5);
      const { user, token } = await createBuyer([{ productId: product.id, quantity: 2 }]);
      const key = randomUUID();

      const first = await checkout(token, key).expect(201);
      // The cart is empty by now: without the key this would be CART_EMPTY.
      const repeat = await checkout(token, key).expect(200);

      expect((repeat.body as Order).id).toBe((first.body as Order).id);
      expect(await prisma.order.count({ where: { userId: user.id } })).toBe(1);
      // Stock moved once, for the first request only.
      const after = await prisma.product.findUniqueOrThrow({ where: { id: product.id } });
      expect(after.stock).toBe(3);
    });

    it.each([1, 2, 3])(
      'places one order when the same key arrives twice at once (round %i)',
      async () => {
        const product = await createProduct(5);
        const { user, token } = await createBuyer([{ productId: product.id, quantity: 1 }]);
        const key = randomUUID();

        const responses = await Promise.all([checkout(token, key), checkout(token, key)]);

        expect(await prisma.order.count({ where: { userId: user.id } })).toBe(1);
        const after = await prisma.product.findUniqueOrThrow({ where: { id: product.id } });
        expect(after.stock).toBe(4);

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
      const product = await createProduct(5);
      const { token } = await createBuyer([{ productId: product.id, quantity: 1 }]);

      await checkout(token, randomUUID()).expect(201);
      // A new attempt against a cart the first one consumed.
      const second = await checkout(token, randomUUID()).expect(409);

      expect(['CART_EMPTY', 'CART_CHANGED']).toContain((second.body as { code: string }).code);
    });

    it('scopes keys to the customer', async () => {
      const product = await createProduct(5);
      const key = 'shared-key-not-a-uuid';
      const alice = await createBuyer([{ productId: product.id, quantity: 1 }]);
      const bob = await createBuyer([{ productId: product.id, quantity: 1 }]);

      const first = await checkout(alice.token, key).expect(201);
      // Bob's checkout is untouched by Alice having used the same string.
      const second = await checkout(bob.token, key).expect(201);

      expect((second.body as Order).id).not.toBe((first.body as Order).id);
    });

    /** A failed attempt writes no order, so its key is free to try again. */
    it('does not consume the key when the checkout failed', async () => {
      const product = await createProduct(1);
      const { user, token } = await createBuyer([{ productId: product.id, quantity: 5 }]);
      const key = randomUUID();

      await checkout(token, key).expect(409);
      await prisma.product.update({ where: { id: product.id }, data: { stock: 5 } });
      const retry = await checkout(token, key).expect(201);

      expect((retry.body as Order).lineCount).toBe(1);
      expect(await prisma.order.count({ where: { userId: user.id } })).toBe(1);
    });

    it('refuses an over-long key without ordering anything', async () => {
      const product = await createProduct(5);
      const { user, token } = await createBuyer([{ productId: product.id, quantity: 1 }]);

      await checkout(token, 'k'.repeat(IDEMPOTENCY_KEY_MAX_LENGTH + 1)).expect(400);

      expect(await prisma.order.count({ where: { userId: user.id } })).toBe(0);
      const after = await prisma.product.findUniqueOrThrow({ where: { id: product.id } });
      expect(after.stock).toBe(5);
    });
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
