import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import type {
  CreatedSupplierOrderImportToken,
  ImportSupplierOrderEmailInput,
  SupplierOrder,
  SupplierOrderStatus,
} from '@vinyl-order/shared';
import request from 'supertest';
import { App } from 'supertest/types';

import { AppModule } from '../src/app.module';
import type { JwtPayload } from '../src/auth/jwt.strategy';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * Payment, shipping and arrival notices through POST /supplier-orders/import, end to
 * end (docs/design/tracker.md §9.5): a notice moves the order it names
 * forward, fills only what is empty, never undoes what was marked by hand,
 * and answers "not yet" for an order not recorded.
 *
 * The parsing itself is pinned in email-notices.e2e-spec.ts; this is what a
 * notice does to an order.
 */
describe('Supplier order notices (e2e)', () => {
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

  const fixture = (name: string): string =>
    readFileSync(resolve(__dirname, 'fixtures/emails', `${name}.html`), 'utf8');

  const THT_FROM = 'THT唱片 <notifications+thtrecords@mail.easystore.co>';

  /** THT's confirmation of order 1001, sent on 2026-11-04. */
  const THT_CONFIRMATION: ImportSupplierOrderEmailInput = {
    from: THT_FROM,
    subject: '您的訂單已確認。',
    date: '2026-11-04T07:39:50.000Z',
    html: fixture('tht-confirmation'),
  };

  /** Order 1001 paid on 2026-11-04 (支付日期 04/11/2026). */
  const THT_PAYMENT: ImportSupplierOrderEmailInput = {
    from: THT_FROM,
    subject: '確認收款通知',
    date: '2026-11-04T07:40:21.000Z',
    html: fixture('tht-payment'),
  };

  /** Order 1001 shipped; no tracking number. */
  const THT_SHIPPING: ImportSupplierOrderEmailInput = {
    from: THT_FROM,
    subject: '更新訂單出貨通知',
    date: '2026-11-05T09:56:23.000Z',
    html: fixture('tht-shipping'),
  };

  /** Order 3003 shipped, 7-11 tracking number H00000000001. */
  const RB_SHIPPING: ImportSupplierOrderEmailInput = {
    from: '爛調唱片 <store+100236001461@t.shopifyemail.com>',
    subject: '訂單 #3003 的貨件配送中',
    date: '2026-11-17T13:45:53.000Z',
    html: fixture('shopify-shipping'),
  };

  /** Cosmic's order 1001 paid on 2026-10-09 (支付日期 09/10/2026): THT's template. */
  const COSMIC_PAYMENT: ImportSupplierOrderEmailInput = {
    from: 'CM Music <notifications+universalvinylmusic@mail.easystore.co>',
    subject: '確認收款通知',
    date: '2026-10-09T07:45:37.000Z',
    html: fixture('cosmic-payment'),
  };

  /** Order 3003 at the store, 7-11 tracking number H00000000002. */
  const RB_ARRIVAL: ImportSupplierOrderEmailInput = {
    from: '爛調唱片 <store+100236001461@t.shopifyemail.com>',
    subject: '訂單 #3003 的貨件已送達',
    date: '2026-10-03T23:32:02.000Z',
    html: fixture('shopify-arrival'),
  };

  const server = () => request(app.getHttpServer());
  const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

  /** A user with a session and an import token. */
  const createImporter = async () => {
    const user = await prisma.user.create({
      data: { email: `notices-${randomUUID()}@test.local`, passwordHash: 'unused' },
    });
    const payload: JwtPayload = { sub: user.id, email: user.email, role: user.role };
    const session = jwt.sign(payload);
    const { token } = (
      await server().post('/supplier-orders/import-token').set(bearer(session)).expect(201)
    ).body as CreatedSupplierOrderImportToken;
    return { session, token };
  };

  const send = (token: string, email: ImportSupplierOrderEmailInput) =>
    server().post('/supplier-orders/import').set(bearer(token)).send(email);

  /** Send a notice and expect a 200 with only this result in it. */
  const expectResult = async (
    token: string,
    email: ImportSupplierOrderEmailInput,
    result: 'updated' | 'unchanged' | 'not_yet',
  ) => {
    const res = await send(token, email).expect(200);
    // Never the order: the route only writes.
    expect(res.body).toEqual({ result });
  };

  /**
   * An order typed in by hand, then moved to `status` if given — as the
   * user would, through the API.
   */
  const typeOrder = async (
    session: string,
    order: {
      supplier: SupplierOrder['supplier'];
      orderNumber: string;
      paidAt?: string;
      trackingNumber?: string;
      status?: SupplierOrderStatus;
    },
  ): Promise<SupplierOrder> => {
    const { status, ...fields } = order;
    const created = (
      await server()
        .post('/supplier-orders')
        .set(bearer(session))
        .send({
          orderedAt: '2026-11-01',
          items: [{ title: 'Typed', unitPriceCents: 88_000 }],
          ...fields,
        })
        .expect(201)
    ).body as SupplierOrder;
    if (!status) return created;
    return (
      await server()
        .patch(`/supplier-orders/${created.id}`)
        .set(bearer(session))
        .send({ status })
        .expect(200)
    ).body as SupplierOrder;
  };

  const orderOf = async (session: string, id: string) =>
    (await server().get(`/supplier-orders/${id}`).set(bearer(session)).expect(200))
      .body as SupplierOrder;

  const listOf = async (session: string) =>
    (await server().get('/supplier-orders').set(bearer(session)).expect(200))
      .body as SupplierOrder[];

  it('the whole THT flow: confirmation, payment, shipping', async () => {
    const { session, token } = await createImporter();

    await send(token, THT_CONFIRMATION).expect(201);
    await expectResult(token, THT_PAYMENT, 'updated');
    await expectResult(token, THT_SHIPPING, 'updated');

    const [order] = await listOf(session);
    expect(order).toMatchObject({
      orderNumber: '1001',
      paidAt: '2026-11-04',
      status: 'shipped',
      trackingNumber: null,
    });
  });

  describe('a notice before its order', () => {
    it('is not yet, and records nothing', async () => {
      const { session, token } = await createImporter();

      await expectResult(token, THT_PAYMENT, 'not_yet');
      await expectResult(token, RB_SHIPPING, 'not_yet');
      await expectResult(token, RB_ARRIVAL, 'not_yet');

      expect(await listOf(session)).toHaveLength(0);
    });

    it('applies once the order is recorded, when the next run sends it again', async () => {
      const { session, token } = await createImporter();
      await expectResult(token, THT_PAYMENT, 'not_yet');

      await send(token, THT_CONFIRMATION).expect(201);
      await expectResult(token, THT_PAYMENT, 'updated');

      const [order] = await listOf(session);
      expect(order.paidAt).toBe('2026-11-04');
    });
  });

  describe('payment', () => {
    it('fills an empty payment day without moving the status; a repeat changes nothing', async () => {
      const { session, token } = await createImporter();
      const typed = await typeOrder(session, { supplier: 'tht', orderNumber: '1001' });

      await expectResult(token, THT_PAYMENT, 'updated');
      await expectResult(token, THT_PAYMENT, 'unchanged');

      expect(await orderOf(session, typed.id)).toMatchObject({
        paidAt: '2026-11-04',
        status: 'ordered',
      });
    });

    it('keeps a payment day set by hand', async () => {
      const { session, token } = await createImporter();
      const typed = await typeOrder(session, {
        supplier: 'tht',
        orderNumber: '1001',
        paidAt: '2026-11-03',
      });

      await expectResult(token, THT_PAYMENT, 'unchanged');

      expect((await orderOf(session, typed.id)).paidAt).toBe('2026-11-03');
    });

    it("reads Cosmic's, and fills only Cosmic's order", async () => {
      const { session, token } = await createImporter();
      const atCosmic = await typeOrder(session, { supplier: 'cosmic', orderNumber: '1001' });
      const atTht = await typeOrder(session, { supplier: 'tht', orderNumber: '1001' });

      await expectResult(token, COSMIC_PAYMENT, 'updated');

      expect((await orderOf(session, atCosmic.id)).paidAt).toBe('2026-10-09');
      expect((await orderOf(session, atTht.id)).paidAt).toBeNull();
    });

    it('is recorded on a cancelled order too: having paid is a fact', async () => {
      const { session, token } = await createImporter();
      const typed = await typeOrder(session, {
        supplier: 'tht',
        orderNumber: '1001',
        status: 'cancelled',
      });

      await expectResult(token, THT_PAYMENT, 'updated');

      expect(await orderOf(session, typed.id)).toMatchObject({
        paidAt: '2026-11-04',
        status: 'cancelled',
      });
    });
  });

  describe('shipping', () => {
    it('moves an open order to shipped with its tracking number; a repeat changes nothing', async () => {
      const { session, token } = await createImporter();
      const typed = await typeOrder(session, {
        supplier: 'rotten_blues',
        orderNumber: '3003',
        status: 'preparing',
      });

      await expectResult(token, RB_SHIPPING, 'updated');
      await expectResult(token, RB_SHIPPING, 'unchanged');

      expect(await orderOf(session, typed.id)).toMatchObject({
        status: 'shipped',
        trackingNumber: 'H00000000001',
      });
    });

    it('keeps a tracking number typed by hand', async () => {
      const { session, token } = await createImporter();
      const typed = await typeOrder(session, {
        supplier: 'rotten_blues',
        orderNumber: '3003',
        trackingNumber: 'TYPED-1',
      });

      // Still moved to shipped: only the number is kept.
      await expectResult(token, RB_SHIPPING, 'updated');

      expect(await orderOf(session, typed.id)).toMatchObject({
        status: 'shipped',
        trackingNumber: 'TYPED-1',
      });
    });

    it('never moves an order back from a later step marked by hand', async () => {
      const { session, token } = await createImporter();
      const typed = await typeOrder(session, {
        supplier: 'tht',
        orderNumber: '1001',
        status: 'ready_for_pickup',
      });

      await expectResult(token, THT_SHIPPING, 'unchanged');

      expect((await orderOf(session, typed.id)).status).toBe('ready_for_pickup');
    });

    it('still fills an empty tracking number on an order past shipped', async () => {
      const { session, token } = await createImporter();
      const typed = await typeOrder(session, {
        supplier: 'rotten_blues',
        orderNumber: '3003',
        status: 'delivered',
      });

      await expectResult(token, RB_SHIPPING, 'updated');

      expect(await orderOf(session, typed.id)).toMatchObject({
        status: 'delivered',
        trackingNumber: 'H00000000001',
      });
    });

    it('leaves a cancelled order alone, tracking number included', async () => {
      const { session, token } = await createImporter();
      const typed = await typeOrder(session, {
        supplier: 'rotten_blues',
        orderNumber: '3003',
        status: 'cancelled',
      });

      await expectResult(token, RB_SHIPPING, 'unchanged');

      expect(await orderOf(session, typed.id)).toMatchObject({
        status: 'cancelled',
        trackingNumber: null,
      });
    });
  });

  describe('arrival at the store', () => {
    it('follows shipping to ready for pickup, keeping the first tracking number', async () => {
      const { session, token } = await createImporter();
      const typed = await typeOrder(session, { supplier: 'rotten_blues', orderNumber: '3003' });

      await expectResult(token, RB_SHIPPING, 'updated');
      await expectResult(token, RB_ARRIVAL, 'updated');
      await expectResult(token, RB_ARRIVAL, 'unchanged');

      expect(await orderOf(session, typed.id)).toMatchObject({
        status: 'ready_for_pickup',
        trackingNumber: 'H00000000001',
      });
    });

    it('moves an order straight there when its shipping notice was missed', async () => {
      const { session, token } = await createImporter();
      const typed = await typeOrder(session, { supplier: 'rotten_blues', orderNumber: '3003' });

      await expectResult(token, RB_ARRIVAL, 'updated');

      expect(await orderOf(session, typed.id)).toMatchObject({
        status: 'ready_for_pickup',
        trackingNumber: 'H00000000002',
      });
    });

    it('never moves back an order marked delivered', async () => {
      const { session, token } = await createImporter();
      const typed = await typeOrder(session, {
        supplier: 'rotten_blues',
        orderNumber: '3003',
        trackingNumber: 'TYPED-1',
        status: 'delivered',
      });

      await expectResult(token, RB_ARRIVAL, 'unchanged');

      expect(await orderOf(session, typed.id)).toMatchObject({
        status: 'delivered',
        trackingNumber: 'TYPED-1',
      });
    });

    it('leaves a cancelled order alone', async () => {
      const { session, token } = await createImporter();
      const typed = await typeOrder(session, {
        supplier: 'rotten_blues',
        orderNumber: '3003',
        status: 'cancelled',
      });

      await expectResult(token, RB_ARRIVAL, 'unchanged');

      expect(await orderOf(session, typed.id)).toMatchObject({
        status: 'cancelled',
        trackingNumber: null,
      });
    });
  });

  describe('which order', () => {
    it("never another user's order with the same number", async () => {
      const owner = await createImporter();
      const typed = await typeOrder(owner.session, { supplier: 'tht', orderNumber: '1001' });
      const other = await createImporter();

      await expectResult(other.token, THT_PAYMENT, 'not_yet');

      expect((await orderOf(owner.session, typed.id)).paidAt).toBeNull();
    });

    it('never an order with the same number at another shop', async () => {
      const { session, token } = await createImporter();
      const typed = await typeOrder(session, { supplier: 'cosmic', orderNumber: '1001' });

      await expectResult(token, THT_PAYMENT, 'not_yet');

      expect((await orderOf(session, typed.id)).paidAt).toBeNull();
    });
  });

  it('a notice it cannot read is a 422 with a reason, and changes nothing', async () => {
    const { session, token } = await createImporter();
    const typed = await typeOrder(session, { supplier: 'tht', orderNumber: '1001' });
    const html = THT_SHIPPING.html.replace('已出貨', '已送達');

    const res = await send(token, { ...THT_SHIPPING, html }).expect(422);

    expect(res.body).toMatchObject({
      code: 'SUPPLIER_ORDER_EMAIL_UNREADABLE',
      reason: 'a shipping status this site does not read',
    });
    expect(JSON.stringify(res.body)).not.toContain('王小明');
    expect((await orderOf(session, typed.id)).status).toBe('ordered');
  });
});
