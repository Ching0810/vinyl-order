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

  const get = (token: string, id: string) =>
    server().get(`/supplier-orders/${id}`).set(auth(token));

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
      await server().get(`/supplier-orders/${randomUUID()}`).expect(401);
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

    // Paid on a day of its own, or unpaid when no day is given (cash on
    // pickup); the day is stored as a day, like the order's.
    it('records the payment day, or none', async () => {
      const { token } = await createUser();

      const paid = await recorded(token, newOrder({ paidAt: '2026-12-31' }));
      const unpaid = await recorded(token);

      expect(paid.paidAt).toBe('2026-12-31');
      expect(unpaid.paidAt).toBeNull();
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

      await get(other.token, order.id).expect(404);
      await update(other.token, order.id, { note: 'mine now' }).expect(404);
      await update(other.token, order.id, { status: 'cancelled' }).expect(404);
      await update(other.token, order.id, {
        items: [{ id: order.items[0].id, title: 'Mine', unitPriceCents: 1 }],
      }).expect(404);
      await remove(other.token, order.id).expect(404);
      await update(other.token, randomUUID(), { note: 'x' }).expect(404);

      const row = await prisma.supplierOrder.findUniqueOrThrow({
        where: { id: order.id },
        include: { items: true },
      });
      expect(row).toMatchObject({ note: null, status: 'ordered' });
      expect(row.items).toMatchObject([{ title: 'Test Album' }]);
    });
  });

  describe('reading one', () => {
    it('returns my order with its lines', async () => {
      const { token } = await createUser();
      const order = await recorded(token);

      const res = await get(token, order.id).expect(200);

      expect(res.body).toEqual(order);
    });

    it('is 404 for an id that does not exist', async () => {
      const { token } = await createUser();

      await get(token, randomUUID()).expect(404);
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

    // Unknown keys are dropped by the schema, so the shop an order was placed
    // at can't be changed through PATCH.
    it('never changes the shop', async () => {
      const { token } = await createUser();
      const order = await recorded(token);

      await update(token, order.id, { note: 'x', supplier: 'cosmic' }).expect(200);

      const row = await prisma.supplierOrder.findUniqueOrThrow({ where: { id: order.id } });
      expect(row.supplier).toBe('tht');
    });

    it('changes the number, day and total, and clears the total', async () => {
      const { token } = await createUser();
      const order = await recorded(token, newOrder({ totalCents: 155_000 }));

      const changed = await update(token, order.id, {
        orderNumber: 'T-FIXED',
        orderedAt: '2026-10-31',
        totalCents: 159_100,
      }).expect(200);
      expect(changed.body).toMatchObject({
        orderNumber: 'T-FIXED',
        orderedAt: '2026-10-31',
        totalCents: 159_100,
      });

      const cleared = await update(token, order.id, { totalCents: null }).expect(200);
      expect(cleared.body).toMatchObject({ orderNumber: 'T-FIXED', totalCents: null });
    });

    // "Mark as paid", and back to unpaid; the order's other fields untouched.
    it('marks it paid on a day, and unpaid again', async () => {
      const { token } = await createUser();
      const order = await recorded(token);

      const paid = await update(token, order.id, { paidAt: '2026-11-12' }).expect(200);
      expect(paid.body).toMatchObject({ paidAt: '2026-11-12', status: 'ordered' });

      const unpaid = await update(token, order.id, { paidAt: null }).expect(200);
      expect(unpaid.body).toMatchObject({ paidAt: null });
    });

    it.each([
      ['a blank order number', { orderNumber: '  ' }],
      ['a bad day', { orderedAt: '2026-13-01' }],
      ['a bad payment day', { paidAt: '2026-11-31' }],
      ['a negative total', { totalCents: -1 }],
      ['no lines', { items: [] }],
      ['a version only', { expectedUpdatedAt: '2026-11-01T00:00:00.000Z' }],
    ])('refuses %s', async (_, body) => {
      const { token } = await createUser();
      const order = await recorded(token);

      await update(token, order.id, body).expect(400);
    });
  });

  describe('editing lines', () => {
    /** An order with two lines, A and B, as recorded. */
    const twoLines = async (token: string) => {
      const order = await recorded(
        token,
        newOrder({
          items: [
            { title: 'A', unitPriceCents: 100 },
            { title: 'B', unitPriceCents: 200 },
          ],
        }),
      );
      const [a, b] = order.items;
      return { order, a, b };
    };

    // The list is the order's lines: A is kept and changed, B is left out so
    // removed, C has no id so is added. A keeps its id — what an offer link
    // will hang on.
    it('updates, adds and removes lines in one edit', async () => {
      const { token } = await createUser();
      const { order, a, b } = await twoLines(token);

      const res = await update(token, order.id, {
        items: [
          {
            id: a.id,
            title: 'A (2nd press)',
            quantity: 2,
            unitPriceCents: 680,
            expectedMonth: '2026-12',
          },
          { title: 'C', unitPriceCents: 300 },
        ],
      }).expect(200);

      const items = (res.body as SupplierOrder).items;
      expect(items).toMatchObject([
        {
          id: a.id,
          title: 'A (2nd press)',
          quantity: 2,
          unitPriceCents: 680,
          lineTotalCents: 1_360,
          expectedMonth: '2026-12',
        },
        { title: 'C', quantity: 1, unitPriceCents: 300, expectedMonth: null },
      ]);
      expect(items.map(({ id }) => id)).not.toContain(b.id);
      expect(await prisma.supplierOrderItem.count({ where: { id: b.id } })).toBe(0);
    });

    // A line of another order, or one already removed (by another tab), is
    // refused rather than moved or brought back — and the refusal undoes the
    // whole edit, the order's own fields included.
    it.each([
      ['a line of another of my orders', 'other'],
      ['a line that was removed', 'removed'],
    ])('refuses %s, changing nothing', async (_, kind) => {
      const { token } = await createUser();
      const { order, a, b } = await twoLines(token);
      let foreignId: string;
      if (kind === 'other') {
        foreignId = (await recorded(token)).items[0].id;
      } else {
        await prisma.supplierOrderItem.delete({ where: { id: b.id } });
        foreignId = b.id;
      }

      await update(token, order.id, {
        note: 'should not stick',
        items: [
          { id: a.id, title: 'A changed', unitPriceCents: 1 },
          { id: foreignId, title: 'Taken', unitPriceCents: 1 },
        ],
      }).expect(400);

      const row = await prisma.supplierOrder.findUniqueOrThrow({
        where: { id: order.id },
        include: { items: true },
      });
      expect(row.note).toBeNull();
      expect(row.items.find(({ id }) => id === a.id)).toMatchObject({ title: 'A' });
      expect(await prisma.supplierOrderItem.count({ where: { id: foreignId } })).toBe(
        kind === 'other' ? 1 : 0,
      );
    });

    it('refuses the same line twice', async () => {
      const { token } = await createUser();
      const { order, a } = await twoLines(token);

      await update(token, order.id, {
        items: [
          { id: a.id, title: 'A', unitPriceCents: 1 },
          { id: a.id, title: 'A again', unitPriceCents: 1 },
        ],
      }).expect(400);
    });
  });

  describe('changing the order number', () => {
    it('refuses a number another of my orders at the shop has', async () => {
      const { token } = await createUser();
      const taken = await recorded(token);
      const order = await recorded(token);

      const res = await update(token, order.id, { orderNumber: taken.orderNumber }).expect(409);

      expect(res.body).toMatchObject({ code: 'SUPPLIER_ORDER_DUPLICATE' });
    });

    it("allows another shop's or another user's number", async () => {
      const { token } = await createUser();
      const other = await createUser();
      const atCosmic = await recorded(token, newOrder({ supplier: 'cosmic' }));
      const theirs = await recorded(other.token);
      const order = await recorded(token);

      await update(token, order.id, { orderNumber: atCosmic.orderNumber }).expect(200);
      await update(token, order.id, { orderNumber: theirs.orderNumber }).expect(200);
    });
  });

  // expectedUpdatedAt: an edit made from a copy of the order that is no
  // longer current is refused, whatever changed it in between.
  describe('version check', () => {
    it('applies an edit made from the current version', async () => {
      const { token } = await createUser();
      const order = await recorded(token);

      const res = await update(token, order.id, {
        note: 'fresh',
        expectedUpdatedAt: order.updatedAt,
      }).expect(200);

      const edited = res.body as SupplierOrder;
      expect(edited.note).toBe('fresh');
      expect(edited.updatedAt).not.toBe(order.updatedAt);
    });

    // Lines live in another table: changing only them must still move the
    // order's version. The field edit pins that Prisma's @updatedAt is set by
    // the conditional updateMany too.
    it.each([
      ['a field', false],
      ['only the lines', true],
    ])('refuses an old version after %s changed', async (_, linesOnly) => {
      const { token } = await createUser();
      const order = await recorded(token);
      const firstEdit = linesOnly
        ? { items: [{ id: order.items[0].id, title: 'Tab A', unitPriceCents: 1 }] }
        : { note: 'tab A' };
      await update(token, order.id, firstEdit).expect(200);

      const res = await update(token, order.id, {
        note: 'tab B',
        expectedUpdatedAt: order.updatedAt,
      }).expect(409);

      expect(res.body).toMatchObject({ code: 'SUPPLIER_ORDER_STALE' });
      const row = await prisma.supplierOrder.findUniqueOrThrow({ where: { id: order.id } });
      expect(row.note).not.toBe('tab B');
    });

    // The real reason is the stale form, not the move it carries.
    it('reports a stale edit as stale, even with a refused status', async () => {
      const { token } = await createUser();
      const order = await recorded(token);
      await update(token, order.id, { status: 'shipped' }).expect(200);

      const res = await update(token, order.id, {
        status: 'preparing',
        expectedUpdatedAt: order.updatedAt,
      }).expect(409);

      expect(res.body).toMatchObject({ code: 'SUPPLIER_ORDER_STALE' });
    });

    // Two tabs save edits from the same version at once: the row lock makes
    // one wait, and it then finds the version moved — one is applied, whole.
    it('lets one of two concurrent edits from the same version win', async () => {
      const { token } = await createUser();
      const order = await recorded(token);
      const edit = (title: string) =>
        update(token, order.id, {
          note: title,
          items: [{ title, unitPriceCents: 1 }],
          expectedUpdatedAt: order.updatedAt,
        });

      const responses = await Promise.all([edit('Tab A'), edit('Tab B')]);

      expect(responses.map((res) => res.status).sort()).toEqual([200, 409]);
      const winner = responses.find((res) => res.status === 200)!.body as SupplierOrder;
      const row = await prisma.supplierOrder.findUniqueOrThrow({
        where: { id: order.id },
        include: { items: true },
      });
      expect(row.note).toBe(winner.note);
      expect(row.items).toMatchObject([{ title: winner.note }]);
    });
  });

  describe('status changes', () => {
    it('moves forward, skipping steps', async () => {
      const { token } = await createUser();
      const order = await recorded(token);

      const res = await update(token, order.id, { status: 'shipped' }).expect(200);

      expect(res.body).toMatchObject({ status: 'shipped' });
    });

    // Waiting at the store, then collected — paid at the counter in the same
    // request, as the page sends it for cash on pickup.
    it('moves through ready for pickup to delivered, paid on collecting', async () => {
      const { token } = await createUser();
      const order = await recorded(token);
      await setStatus(order.id, 'shipped');

      await update(token, order.id, { status: 'ready_for_pickup' }).expect(200);
      const res = await update(token, order.id, {
        status: 'delivered',
        paidAt: '2026-11-12',
      }).expect(200);

      expect(res.body).toMatchObject({ status: 'delivered', paidAt: '2026-11-12' });
    });

    it.each<[SupplierOrderStatus, SupplierOrderStatus]>([
      ['shipped', 'preparing'],
      ['shipped', 'cancelled'],
      ['ready_for_pickup', 'shipped'],
      ['ready_for_pickup', 'cancelled'],
      ['delivered', 'ready_for_pickup'],
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
      'ordered→ready_for_pickup',
      'ordered→delivered',
      'ordered→cancelled',
      'preparing→shipped',
      'preparing→ready_for_pickup',
      'preparing→delivered',
      'preparing→cancelled',
      'shipped→ready_for_pickup',
      'shipped→delivered',
      'ready_for_pickup→delivered',
    ]);
    const statuses = supplierOrderStatusSchema.options;
    const pairs = statuses.flatMap((from) => statuses.map((to) => [from, to] as const));

    it.each(pairs)('%s → %s', (from, to) => {
      expect(canChangeSupplierOrderStatus(from, to)).toBe(allowed.has(`${from}→${to}`));
    });
  });
});
