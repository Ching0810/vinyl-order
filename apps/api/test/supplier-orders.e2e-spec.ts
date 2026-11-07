import { randomUUID } from 'node:crypto';

import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import {
  canChangeSupplierOrderStatus,
  supplierOrderStatusSchema,
  type SupplierOrder,
  type SupplierOrderStatus,
} from '@vinyl-order/shared';
import request from 'supertest';
import { App } from 'supertest/types';

import { AppModule } from '../src/app.module';
import type { JwtPayload } from '../src/auth/jwt.strategy';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * A user's own orders at the shops (docs/design/tracker.md §9): anyone signed
 * in keeps a record no one else can see or touch, and its status only moves
 * the way canChangeSupplierOrderStatus allows.
 */
describe('Supplier orders (e2e)', () => {
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

  /** A plain customer: no admin role is needed for any of this. */
  const createUser = async () => {
    const user = await prisma.user.create({
      data: { email: `buyer-${randomUUID()}@test.local`, passwordHash: 'unused' },
    });
    const payload: JwtPayload = { sub: user.id, email: user.email, role: user.role };
    return { user, token: jwt.sign(payload) };
  };

  /** A valid body with a fresh order number, so tests never clash. */
  const newOrder = (overrides: Record<string, unknown> = {}) => ({
    supplier: 'tht',
    orderNumber: `T-${randomUUID()}`,
    orderedAt: '2026-11-01',
    items: [{ title: 'Test Album', quantity: 2, unitPriceCents: 120_000 }],
    ...overrides,
  });

  const server = () => request(app.getHttpServer());
  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  const create = (token: string, body: object = newOrder()) =>
    server().post('/supplier-orders').set(auth(token)).send(body);

  const list = (token: string) => server().get('/supplier-orders').set(auth(token));

  const update = (token: string, id: string, body: object) =>
    server().patch(`/supplier-orders/${id}`).set(auth(token)).send(body);

  const remove = (token: string, id: string) =>
    server().delete(`/supplier-orders/${id}`).set(auth(token));

  /** Record an order and return it, failing the test if that doesn't work. */
  const recorded = async (token: string, body: object = newOrder()) =>
    (await create(token, body).expect(201)).body as SupplierOrder;

  /** Put an order straight into a status, skipping the steps a test isn't about. */
  const setStatus = (id: string, status: SupplierOrderStatus) =>
    prisma.supplierOrder.update({ where: { id }, data: { status } });

  describe('signing in', () => {
    it('refuses every route without a session', async () => {
      await server().get('/supplier-orders').expect(401);
      await server().post('/supplier-orders').send(newOrder()).expect(401);
      await server().patch(`/supplier-orders/${randomUUID()}`).send({ note: 'x' }).expect(401);
      await server().delete(`/supplier-orders/${randomUUID()}`).expect(401);
    });
  });

  describe('recording an order', () => {
    it('returns the order as recorded, with derived line totals', async () => {
      const { token } = await createUser();

      const order = await recorded(
        token,
        newOrder({
          totalCents: 250_000,
          note: 'pre-order',
          items: [
            { title: 'B Side', quantity: 2, unitPriceCents: 120_000, expectedMonth: '2027-01' },
            { title: 'A Side', unitPriceCents: 9_900 },
          ],
        }),
      );

      expect(order).toMatchObject({
        supplier: 'tht',
        orderedAt: '2026-11-01',
        status: 'ordered',
        totalCents: 250_000,
        currency: 'TWD',
        trackingNumber: null,
        note: 'pre-order',
      });
      // Lines by title; quantity defaults to 1.
      expect(order.items).toMatchObject([
        { title: 'A Side', quantity: 1, lineTotalCents: 9_900, expectedMonth: null, offerId: null },
        { title: 'B Side', quantity: 2, lineTotalCents: 240_000, expectedMonth: '2027-01' },
      ]);
      expect(order).not.toHaveProperty('userId');
    });

    // A day is stored as a day: midnight UTC in, the same date out, whatever
    // the server's timezone. A month is stored as the month, nothing added.
    it('keeps the day and the month that were entered', async () => {
      const { token } = await createUser();

      const order = await recorded(
        token,
        newOrder({
          orderedAt: '2026-12-31',
          items: [{ title: 'Year End', unitPriceCents: 1, expectedMonth: '2027-01' }],
        }),
      );

      expect(order.orderedAt).toBe('2026-12-31');
      expect(order.items[0].expectedMonth).toBe('2027-01');
    });

    // The CHECK backs the schema: a month written around the API (a script,
    // a later import) still can't be "2026-13" or a day.
    it('refuses a malformed month in the database itself', async () => {
      const order = await recorded((await createUser()).token);

      await expect(
        prisma.supplierOrderItem.create({
          data: {
            supplierOrderId: order.id,
            title: 'Bad Month',
            unitPriceCents: 1,
            expectedMonth: '2026-13',
          },
        }),
      ).rejects.toThrow('SupplierOrderItem_expectedMonth_format');
    });

    it('belongs to the session user, whatever the body says', async () => {
      const { user, token } = await createUser();
      const other = await createUser();

      const order = await recorded(token, newOrder({ userId: other.user.id }));

      const row = await prisma.supplierOrder.findUniqueOrThrow({ where: { id: order.id } });
      expect(row.userId).toBe(user.id);
      expect((await list(other.token).expect(200)).body).toEqual([]);
    });

    it('stores a blank note as no note', async () => {
      const { token } = await createUser();

      const order = await recorded(token, newOrder({ note: '   ' }));

      expect(order.note).toBeNull();
    });

    it.each([
      ['no lines', { items: [] }],
      ['a bad day', { orderedAt: '2026-13-01' }],
      ['a datetime for a day', { orderedAt: '2026-11-01T10:00:00Z' }],
      [
        'a day for a month',
        { items: [{ title: 'X', unitPriceCents: 1, expectedMonth: '2026-11-30' }] },
      ],
      [
        'a month that does not exist',
        { items: [{ title: 'X', unitPriceCents: 1, expectedMonth: '2026-13' }] },
      ],
      [
        'a month without its zero',
        { items: [{ title: 'X', unitPriceCents: 1, expectedMonth: '2026-1' }] },
      ],
      ['an unknown shop', { supplier: 'discogs' }],
      ['a blank order number', { orderNumber: '  ' }],
      ['a negative price', { items: [{ title: 'X', unitPriceCents: -1 }] }],
      ['a zero quantity', { items: [{ title: 'X', quantity: 0, unitPriceCents: 1 }] }],
    ])('refuses %s', async (_, overrides) => {
      const { token } = await createUser();

      await create(token, newOrder(overrides)).expect(400);
    });
  });

  describe('duplicates', () => {
    it('refuses the same order number at the same shop twice', async () => {
      const { token } = await createUser();
      const body = newOrder();
      await recorded(token, body);

      const res = await create(token, body).expect(409);

      expect(res.body).toMatchObject({ code: 'SUPPLIER_ORDER_DUPLICATE' });
      expect((await list(token).expect(200)).body).toHaveLength(1);
    });

    it('allows the same number at another shop', async () => {
      const { token } = await createUser();
      const body = newOrder();
      await recorded(token, body);

      await create(token, { ...body, supplier: 'cosmic' }).expect(201);
    });

    // A 409 here would tell the second user someone else holds that number.
    it("allows another user's order number", async () => {
      const first = await createUser();
      const second = await createUser();
      const body = newOrder();
      await recorded(first.token, body);

      await create(second.token, body).expect(201);
    });
  });

  describe("another user's orders", () => {
    it('are not listed', async () => {
      const owner = await createUser();
      const other = await createUser();
      const order = await recorded(owner.token);

      const res = await list(other.token).expect(200);

      expect((res.body as SupplierOrder[]).map(({ id }) => id)).not.toContain(order.id);
    });

    // 404, not 403: a 403 would confirm the id exists.
    it('cannot be updated or deleted, and look like ones that do not exist', async () => {
      const owner = await createUser();
      const other = await createUser();
      const order = await recorded(owner.token);

      await update(other.token, order.id, { note: 'mine now' }).expect(404);
      await update(other.token, order.id, { status: 'cancelled' }).expect(404);
      await remove(other.token, order.id).expect(404);
      await update(other.token, randomUUID(), { note: 'x' }).expect(404);

      const row = await prisma.supplierOrder.findUniqueOrThrow({ where: { id: order.id } });
      expect(row).toMatchObject({ note: null, status: 'ordered' });
    });
  });

  describe('listing', () => {
    it('lists only my orders, newest first', async () => {
      const { token } = await createUser();
      const older = await recorded(token, newOrder({ orderedAt: '2026-10-01' }));
      const newer = await recorded(token, newOrder({ orderedAt: '2026-11-05' }));

      const res = await list(token).expect(200);

      expect((res.body as SupplierOrder[]).map(({ id }) => id)).toEqual([newer.id, older.id]);
    });
  });

  describe('updating', () => {
    it('sets and clears a tracking number and note', async () => {
      const { token } = await createUser();
      const order = await recorded(token);

      const set = await update(token, order.id, { trackingNumber: 'TW123', note: 'box 2' });
      expect(set.status).toBe(200);
      expect(set.body).toMatchObject({ trackingNumber: 'TW123', note: 'box 2', status: 'ordered' });

      const cleared = await update(token, order.id, { trackingNumber: null }).expect(200);
      expect(cleared.body).toMatchObject({ trackingNumber: null, note: 'box 2' });
    });

    it('refuses an empty change', async () => {
      const { token } = await createUser();
      const order = await recorded(token);

      await update(token, order.id, {}).expect(400);
    });

    // Unknown keys are dropped by the schema, so the shop and number an order
    // was placed under can't be changed through PATCH.
    it('never changes the shop or the order number', async () => {
      const { token } = await createUser();
      const order = await recorded(token);

      await update(token, order.id, {
        note: 'x',
        supplier: 'cosmic',
        orderNumber: 'OTHER',
      }).expect(200);

      const row = await prisma.supplierOrder.findUniqueOrThrow({ where: { id: order.id } });
      expect(row).toMatchObject({ supplier: 'tht', orderNumber: order.orderNumber });
    });
  });

  describe('status changes', () => {
    it('moves forward, skipping steps', async () => {
      const { token } = await createUser();
      const order = await recorded(token);

      const res = await update(token, order.id, { status: 'shipped' }).expect(200);

      expect(res.body).toMatchObject({ status: 'shipped' });
    });

    it.each<[SupplierOrderStatus, SupplierOrderStatus]>([
      ['shipped', 'preparing'],
      ['shipped', 'cancelled'],
      ['delivered', 'shipped'],
      ['cancelled', 'ordered'],
    ])('refuses %s → %s, answering with the current status', async (from, to) => {
      const { token } = await createUser();
      const order = await recorded(token);
      await setStatus(order.id, from);

      const res = await update(token, order.id, { status: to }).expect(409);

      expect(res.body).toMatchObject({ code: 'SUPPLIER_ORDER_BAD_TRANSITION', status: from });
    });

    // A repeated submit of the same change succeeds instead of failing on
    // its own first attempt.
    it('accepts the status the order already has', async () => {
      const { token } = await createUser();
      const order = await recorded(token);
      await setStatus(order.id, 'delivered');

      await update(token, order.id, { status: 'delivered' }).expect(200);
    });

    // Two tabs, two different moves from `ordered`. However the requests
    // interleave, one wins and the other is told where the order is now —
    // never both written.
    it('lets one of two concurrent changes win', async () => {
      const { token } = await createUser();
      const order = await recorded(token);

      const responses = await Promise.all([
        update(token, order.id, { status: 'shipped' }),
        update(token, order.id, { status: 'cancelled' }),
      ]);

      const statuses = responses.map((res) => res.status).sort();
      expect(statuses).toEqual([200, 409]);

      const winner = responses.find((res) => res.status === 200)!.body as SupplierOrder;
      const loser = responses.find((res) => res.status === 409)!;
      expect(loser.body).toMatchObject({ status: winner.status });

      const row = await prisma.supplierOrder.findUniqueOrThrow({ where: { id: order.id } });
      expect(row.status).toBe(winner.status);
    });
  });

  describe('deleting', () => {
    it('removes the order and its lines', async () => {
      const { token } = await createUser();
      const order = await recorded(token);

      await remove(token, order.id).expect(204);

      expect(await prisma.supplierOrder.count({ where: { id: order.id } })).toBe(0);
      expect(await prisma.supplierOrderItem.count({ where: { supplierOrderId: order.id } })).toBe(
        0,
      );
      await remove(token, order.id).expect(404);
    });
  });

  // The rule itself, every pair: the routes above check that the API applies
  // it, this checks what it says. Pure, but kept here because CI runs e2e.
  describe('canChangeSupplierOrderStatus', () => {
    const allowed = new Set([
      'ordered→preparing',
      'ordered→shipped',
      'ordered→delivered',
      'ordered→cancelled',
      'preparing→shipped',
      'preparing→delivered',
      'preparing→cancelled',
      'shipped→delivered',
    ]);
    const statuses = supplierOrderStatusSchema.options;
    const pairs = statuses.flatMap((from) => statuses.map((to) => [from, to] as const));

    it.each(pairs)('%s → %s', (from, to) => {
      expect(canChangeSupplierOrderStatus(from, to)).toBe(allowed.has(`${from}→${to}`));
    });
  });
});
