import { randomUUID } from 'node:crypto';

import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import type { Availability, Cart } from '@vinyl-order/shared';
import request from 'supertest';
import { App } from 'supertest/types';

import { AppModule } from '../src/app.module';
import type { JwtPayload } from '../src/auth/jwt.strategy';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * Cart writes against the stock they ask for: a line is an offer, capped at
 * what's left to sell — the shop's count less the demo's holds (tracker.md
 * §8).
 *
 * A cart records an intention, so these caps are housekeeping rather than a
 * promise: stock can fall after a line is added, and checkout is what really
 * refuses to oversell (see orders.e2e-spec).
 */
describe('Cart (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let jwt: JwtService;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);
    jwt = app.get(JwtService);
  });

  afterAll(async () => {
    await app.close();
  });

  /**
   * An in-stock offer on a new record, with the given shop count and the
   * demo's holds on it. A fresh external id so runs don't clash.
   */
  const createOffer = async ({
    stockQty = 3,
    reservedQty = 0,
    availability = 'in_stock',
    productId,
  }: {
    stockQty?: number | null;
    reservedQty?: number;
    availability?: Availability;
    productId?: string;
  } = {}) => {
    const product = productId
      ? { id: productId }
      : await prisma.product.create({
          data: { title: `Album ${randomUUID()}`, artist: 'Test Artist', priceCents: 1_000 },
        });
    return prisma.offer.create({
      data: {
        productId: product.id,
        supplier: 'tht',
        externalId: randomUUID(),
        url: 'https://www.thtrecords.com/products/test',
        sourceTitle: 'Test Album',
        priceCents: 1_200,
        availability,
        stockQty,
        reservedQty,
        lastCheckedAt: new Date(),
      },
    });
  };

  const createShopper = async () => {
    const user = await prisma.user.create({
      data: { email: `shopper-${randomUUID()}@test.local`, passwordHash: 'unused' },
    });
    const payload: JwtPayload = { sub: user.id, email: user.email, role: user.role };
    return { user, token: jwt.sign(payload) };
  };

  const add = (token: string, offerId: string, quantity: number) =>
    request(app.getHttpServer())
      .post('/cart/items')
      .set('Authorization', `Bearer ${token}`)
      .send({ offerId, quantity });

  const setQuantity = (token: string, offerId: string, quantity: number) =>
    request(app.getHttpServer())
      .patch(`/cart/items/${offerId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ quantity });

  const lineOf = (res: { body: unknown }, offerId: string) =>
    (res.body as Cart).items.find((item) => item.offerId === offerId);

  const quantityOf = (res: { body: unknown }, offerId: string) => lineOf(res, offerId)?.quantity;

  it('caps a new line at the stock', async () => {
    const offer = await createOffer({ stockQty: 3 });
    const { token } = await createShopper();

    const res = await add(token, offer.id, 10).expect(201);

    expect(quantityOf(res, offer.id)).toBe(3);
  });

  /** Adding what is already in the cart increments it, so the cap applies to the total. */
  it('caps repeated adds at the stock', async () => {
    const offer = await createOffer({ stockQty: 3 });
    const { token } = await createShopper();

    await add(token, offer.id, 2).expect(201);
    const res = await add(token, offer.id, 2).expect(201);

    expect(quantityOf(res, offer.id)).toBe(3);
  });

  it('caps an absolute quantity at the stock', async () => {
    const offer = await createOffer({ stockQty: 3 });
    const { token } = await createShopper();
    await add(token, offer.id, 1).expect(201);

    const res = await setQuantity(token, offer.id, 9).expect(200);

    expect(quantityOf(res, offer.id)).toBe(3);
  });

  it('leaves a quantity within the stock alone', async () => {
    const offer = await createOffer({ stockQty: 5 });
    const { token } = await createShopper();

    const res = await add(token, offer.id, 4).expect(201);

    expect(quantityOf(res, offer.id)).toBe(4);
  });

  /** What pending orders hold isn't there to sell (tracker.md §8). */
  it('caps at the shop’s count less the demo’s holds', async () => {
    const offer = await createOffer({ stockQty: 5, reservedQty: 3 });
    const { token } = await createShopper();

    const res = await add(token, offer.id, 4).expect(201);

    expect(quantityOf(res, offer.id)).toBe(2);
    expect(lineOf(res, offer.id)?.offer.available).toBe(2);
  });

  /** No count to cap at: only the line's own limit. */
  it('caps an offer with no count at the line’s limit only', async () => {
    const offer = await createOffer({ stockQty: null });
    const { token } = await createShopper();

    await add(token, offer.id, 60).expect(201);
    const res = await add(token, offer.id, 60).expect(201);

    expect(quantityOf(res, offer.id)).toBe(99);
    expect(lineOf(res, offer.id)?.offer.available).toBeNull();
  });

  it('prices a line from its offer, and says when that was read', async () => {
    const offer = await createOffer();
    const { token } = await createShopper();

    const res = await add(token, offer.id, 2).expect(201);

    expect(lineOf(res, offer.id)).toMatchObject({
      lineTotalCents: 2_400,
      offer: {
        supplier: 'tht',
        priceCents: 1_200,
        lastCheckedAt: offer.lastCheckedAt.toISOString(),
      },
    });
    expect((res.body as Cart).subtotalCents).toBe(2_400);
  });

  /** Two shops' versions of one record are two things to buy. */
  it('keeps two offers of one record as two lines', async () => {
    const first = await createOffer();
    const second = await createOffer({ productId: first.productId });
    const { token } = await createShopper();

    await add(token, first.id, 1).expect(201);
    const res = await add(token, second.id, 1).expect(201);

    expect((res.body as Cart).items.map((item) => item.offerId)).toEqual([first.id, second.id]);
  });

  /** No quantity can be capped to, so these are refused rather than adjusted. */
  it.each([
    ['sold out', { availability: 'sold_out' as const }],
    ['a pre-order', { availability: 'pre_order' as const, stockQty: null }],
    ['held in full', { stockQty: 2, reservedQty: 2 }],
  ])('refuses an offer that is %s', async (_, data) => {
    const offer = await createOffer(data);
    const { token } = await createShopper();

    const res = await add(token, offer.id, 1).expect(409);

    expect((res.body as { code: string }).code).toBe('OUT_OF_STOCK');
  });

  it('refuses raising a line whose offer has sold out since', async () => {
    const offer = await createOffer({ stockQty: 2 });
    const { token } = await createShopper();
    await add(token, offer.id, 1).expect(201);
    await prisma.offer.update({ where: { id: offer.id }, data: { availability: 'sold_out' } });

    const res = await setQuantity(token, offer.id, 2).expect(409);

    expect((res.body as { code: string }).code).toBe('OUT_OF_STOCK');
  });

  it('answers 404 for an offer that doesn’t exist', async () => {
    const { token } = await createShopper();

    await add(token, randomUUID(), 1).expect(404);
  });

  it('requires a signed-in user', async () => {
    const offer = await createOffer();

    await request(app.getHttpServer())
      .post('/cart/items')
      .send({ offerId: offer.id, quantity: 1 })
      .expect(401);
  });

  /** The cap is a courtesy: a line already over the stock is left as it is. */
  it('leaves a line that the stock fell under', async () => {
    const offer = await createOffer({ stockQty: 5 });
    const { token } = await createShopper();
    await add(token, offer.id, 5).expect(201);

    await prisma.offer.update({ where: { id: offer.id }, data: { stockQty: 1 } });

    const res = await request(app.getHttpServer())
      .get('/cart')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(quantityOf(res, offer.id)).toBe(5);
    expect(lineOf(res, offer.id)?.offer.available).toBe(1);
  });
});
