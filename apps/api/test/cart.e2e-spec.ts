import { randomUUID } from 'node:crypto';

import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import type { Availability, Cart, Supplier } from '@vinyl-order/shared';
import request from 'supertest';
import { App } from 'supertest/types';

import { AppModule } from '../src/app.module';
import type { JwtPayload } from '../src/auth/jwt.strategy';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * Cart writes against the stock they ask for: a line is a listing in a
 * shop's copied catalog, capped at what's left to sell — the shop's count
 * less the demo's holds (tracker.md §8).
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
   * An in-stock, priced listing in a shop's copied catalog, with the given
   * shop count and the demo's holds on it. A fresh external id so runs
   * don't clash.
   */
  const createEntry = ({
    supplier = 'tht',
    stockQty = 3,
    reservedQty = 0,
    availability = 'in_stock',
    priceCents = 1_200,
  }: {
    supplier?: Supplier;
    stockQty?: number | null;
    reservedQty?: number;
    availability?: Availability | null;
    priceCents?: number | null;
  } = {}) => {
    const title = `Test Artist - Album ${randomUUID()} LP`;
    return prisma.catalogEntry.create({
      data: {
        supplier,
        externalId: randomUUID(),
        url: 'https://www.thtrecords.com/products/test',
        title,
        searchTitle: title.toLowerCase(),
        priceCents,
        availability,
        stockQty,
        reservedQty,
        isVinyl: true,
        isUsed: false,
        syncedAt: new Date(),
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

  const add = (token: string, catalogEntryId: string, quantity: number) =>
    request(app.getHttpServer())
      .post('/cart/items')
      .set('Authorization', `Bearer ${token}`)
      .send({ catalogEntryId, quantity });

  const setQuantity = (token: string, catalogEntryId: string, quantity: number) =>
    request(app.getHttpServer())
      .patch(`/cart/items/${catalogEntryId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ quantity });

  const lineOf = (res: { body: unknown }, catalogEntryId: string) =>
    (res.body as Cart).items.find((item) => item.catalogEntryId === catalogEntryId);

  const quantityOf = (res: { body: unknown }, catalogEntryId: string) =>
    lineOf(res, catalogEntryId)?.quantity;

  it('caps a new line at the stock', async () => {
    const entry = await createEntry({ stockQty: 3 });
    const { token } = await createShopper();

    const res = await add(token, entry.id, 10).expect(201);

    expect(quantityOf(res, entry.id)).toBe(3);
  });

  /** Adding what is already in the cart increments it, so the cap applies to the total. */
  it('caps repeated adds at the stock', async () => {
    const entry = await createEntry({ stockQty: 3 });
    const { token } = await createShopper();

    await add(token, entry.id, 2).expect(201);
    const res = await add(token, entry.id, 2).expect(201);

    expect(quantityOf(res, entry.id)).toBe(3);
  });

  it('caps an absolute quantity at the stock', async () => {
    const entry = await createEntry({ stockQty: 3 });
    const { token } = await createShopper();
    await add(token, entry.id, 1).expect(201);

    const res = await setQuantity(token, entry.id, 9).expect(200);

    expect(quantityOf(res, entry.id)).toBe(3);
  });

  it('leaves a quantity within the stock alone', async () => {
    const entry = await createEntry({ stockQty: 5 });
    const { token } = await createShopper();

    const res = await add(token, entry.id, 4).expect(201);

    expect(quantityOf(res, entry.id)).toBe(4);
  });

  /** What pending orders hold isn't there to sell (tracker.md §8). */
  it('caps at the shop’s count less the demo’s holds', async () => {
    const entry = await createEntry({ stockQty: 5, reservedQty: 3 });
    const { token } = await createShopper();

    const res = await add(token, entry.id, 4).expect(201);

    expect(quantityOf(res, entry.id)).toBe(2);
    expect(lineOf(res, entry.id)?.listing.available).toBe(2);
  });

  /** No count to cap at: only the line's own limit. */
  it('caps a listing with no count at the line’s limit only', async () => {
    const entry = await createEntry({ stockQty: null });
    const { token } = await createShopper();

    await add(token, entry.id, 60).expect(201);
    const res = await add(token, entry.id, 60).expect(201);

    expect(quantityOf(res, entry.id)).toBe(99);
    expect(lineOf(res, entry.id)?.listing.available).toBeNull();
  });

  /** A pre-order the shop still takes is ordered now, shipped later (§8). */
  it('adds a pre-order, capped at the shop’s count when it keeps one', async () => {
    const uncounted = await createEntry({ availability: 'pre_order', stockQty: null });
    const counted = await createEntry({ availability: 'pre_order', stockQty: 2 });
    const { token } = await createShopper();

    await add(token, uncounted.id, 5).expect(201);
    const res = await add(token, counted.id, 5).expect(201);

    expect(quantityOf(res, uncounted.id)).toBe(5);
    expect(quantityOf(res, counted.id)).toBe(2);
  });

  it('prices a line from its listing, as of the shop’s last stock walk', async () => {
    const entry = await createEntry({ supplier: 'cosmic' });
    const walkedAt = new Date('2026-11-25T19:30:00Z');
    await prisma.catalogStockRun.upsert({
      where: { supplier: 'cosmic' },
      create: { supplier: 'cosmic', finishedAt: walkedAt, pages: 1, entries: 1 },
      update: { finishedAt: walkedAt },
    });
    const { token } = await createShopper();

    const res = await add(token, entry.id, 2).expect(201);

    expect(lineOf(res, entry.id)).toMatchObject({
      lineTotalCents: 2_400,
      listing: {
        supplier: 'cosmic',
        title: entry.title,
        artist: 'Test Artist',
        priceCents: 1_200,
        currency: 'TWD',
        checkedAt: walkedAt.toISOString(),
      },
    });
    expect((res.body as Cart).subtotalCents).toBe(2_400);
  });

  /** The same album at two shops is two things to buy. */
  it('keeps two shops’ listings as two lines', async () => {
    const first = await createEntry({ supplier: 'tht' });
    const second = await createEntry({ supplier: 'rotten_blues' });
    const { token } = await createShopper();

    await add(token, first.id, 1).expect(201);
    const res = await add(token, second.id, 1).expect(201);

    expect((res.body as Cart).items.map((item) => item.catalogEntryId)).toEqual([
      first.id,
      second.id,
    ]);
  });

  /** No quantity can be capped to, so these are refused rather than adjusted. */
  it.each([
    ['sold out', { availability: 'sold_out' as const }],
    ['held in full', { stockQty: 2, reservedQty: 2 }],
    ['not yet read', { availability: null, priceCents: null, stockQty: null }],
    ['shown without a price', { priceCents: null }],
  ])('refuses a listing that is %s', async (_, data) => {
    const entry = await createEntry(data);
    const { token } = await createShopper();

    const res = await add(token, entry.id, 1).expect(409);

    expect((res.body as { code: string }).code).toBe('OUT_OF_STOCK');
  });

  it('refuses raising a line whose listing has sold out since', async () => {
    const entry = await createEntry({ stockQty: 2 });
    const { token } = await createShopper();
    await add(token, entry.id, 1).expect(201);
    await prisma.catalogEntry.update({
      where: { id: entry.id },
      data: { availability: 'sold_out' },
    });

    const res = await setQuantity(token, entry.id, 2).expect(409);

    expect((res.body as { code: string }).code).toBe('OUT_OF_STOCK');
  });

  it('answers 404 for a listing that doesn’t exist', async () => {
    const { token } = await createShopper();

    await add(token, randomUUID(), 1).expect(404);
  });

  it('requires a signed-in user', async () => {
    const entry = await createEntry();

    await request(app.getHttpServer())
      .post('/cart/items')
      .send({ catalogEntryId: entry.id, quantity: 1 })
      .expect(401);
  });

  /** A listing the shop took down, and the sync deleted, can't be bought. */
  it('drops the line of a listing the sync deleted', async () => {
    const entry = await createEntry();
    const { token } = await createShopper();
    await add(token, entry.id, 1).expect(201);

    await prisma.catalogEntry.delete({ where: { id: entry.id } });

    const res = await request(app.getHttpServer())
      .get('/cart')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect((res.body as Cart).items).toEqual([]);
  });

  /** The cap is a courtesy: a line already over the stock is left as it is. */
  it('leaves a line that the stock fell under', async () => {
    const entry = await createEntry({ stockQty: 5 });
    const { token } = await createShopper();
    await add(token, entry.id, 5).expect(201);

    await prisma.catalogEntry.update({ where: { id: entry.id }, data: { stockQty: 1 } });

    const res = await request(app.getHttpServer())
      .get('/cart')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(quantityOf(res, entry.id)).toBe(5);
    expect(lineOf(res, entry.id)?.listing.available).toBe(1);
  });
});
