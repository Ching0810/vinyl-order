import { randomUUID } from 'node:crypto';

import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import type { InsufficientStockError, Order } from '@vinyl-order/shared';
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

  const checkout = (token: string) =>
    request(app.getHttpServer()).post('/orders').set('Authorization', `Bearer ${token}`);

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
      itemCount: 2,
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
});
