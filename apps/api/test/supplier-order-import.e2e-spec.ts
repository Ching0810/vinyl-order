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
  SupplierOrderImportTokenStatus,
} from '@vinyl-order/shared';
import request from 'supertest';
import { App } from 'supertest/types';

import { AppModule } from '../src/app.module';
import type { JwtPayload } from '../src/auth/jwt.strategy';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * POST /supplier-orders/import, end to end (docs/design/tracker.md §9.4): an
 * Apps Script with an import token sends a confirmation email, and the order
 * appears in that user's list — once, however often it is sent.
 *
 * The parsing itself is pinned in email-import.e2e-spec.ts; this is the route
 * around it: who may call it, what it records, and what it gives away.
 */
describe('Supplier order import (e2e)', () => {
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
    readFileSync(resolve(__dirname, 'fixtures/emails', `${name}-confirmation.html`), 'utf8');

  const THT: ImportSupplierOrderEmailInput = {
    from: 'THT唱片 <notifications+thtrecords@mail.easystore.co>',
    subject: '您的訂單已確認。',
    date: '2026-11-04T07:39:50.000Z',
    html: fixture('tht'),
  };

  const ROTTEN_BLUES: ImportSupplierOrderEmailInput = {
    from: '爛調唱片 <store+100236001461@t.shopifyemail.com>',
    subject: '訂單 #3003 已確認',
    date: '2026-10-05T08:28:51.000Z',
    html: fixture('shopify'),
  };

  const server = () => request(app.getHttpServer());
  const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

  /** A user with a session and an import token. */
  const createImporter = async () => {
    const user = await prisma.user.create({
      data: { email: `importer-${randomUUID()}@test.local`, passwordHash: 'unused' },
    });
    const payload: JwtPayload = { sub: user.id, email: user.email, role: user.role };
    const session = jwt.sign(payload);
    const { token } = (
      await server().post('/supplier-orders/import-token').set(bearer(session)).expect(201)
    ).body as CreatedSupplierOrderImportToken;
    return { user, session, token };
  };

  const send = (token: string, email: object) =>
    server().post('/supplier-orders/import').set(bearer(token)).send(email);

  const listOf = async (session: string) =>
    (await server().get('/supplier-orders').set(bearer(session)).expect(200))
      .body as SupplierOrder[];

  describe('who may send', () => {
    it('refuses no token, an unknown one, and a login session', async () => {
      const { session } = await createImporter();

      await server().post('/supplier-orders/import').send(THT).expect(401);
      await send(`vo_imp_${'A'.repeat(43)}`, THT).expect(401);
      await send(session, THT).expect(401);
    });

    it('refuses a token once revoked', async () => {
      const { session, token } = await createImporter();
      await server().delete('/supplier-orders/import-token').set(bearer(session)).expect(204);

      await send(token, THT).expect(401);
    });
  });

  describe('a confirmation', () => {
    it("records the order in the token owner's list, as an ordered order with its cover", async () => {
      const { session, token } = await createImporter();

      const res = await send(token, THT).expect(201);

      expect(res.body).toEqual({ result: 'created' });
      const orders = await listOf(session);
      expect(orders).toHaveLength(1);
      expect(orders[0]).toMatchObject({
        supplier: 'tht',
        orderNumber: '1001',
        orderedAt: '2026-11-04',
        status: 'ordered',
        totalCents: 94_000,
        // EasyStore's confirmation says nothing about payment.
        paidAt: null,
        trackingNumber: null,
        note: null,
      });
      expect(orders[0].items).toEqual([
        expect.objectContaining({
          title: 'Test Artist - Sample Album LP (12月補貨預訂)',
          quantity: 1,
          unitPriceCents: 88_000,
          expectedMonth: '2026-12',
          imageUrl: 'https://cdn.store-assets.com/s/270153/i/10000001.jpg',
          offerId: null,
        }),
      ]);
    });

    // The route keeps what the parser read about payment, not only the lines.
    it('records a card-paid Shopify order as paid on its day', async () => {
      const { session, token } = await createImporter();
      const html = ROTTEN_BLUES.html.replace('$0.00 TWD', '$1,240.00 TWD');

      await send(token, { ...ROTTEN_BLUES, html }).expect(201);

      const [order] = await listOf(session);
      expect(order).toMatchObject({ supplier: 'rotten_blues', paidAt: '2026-10-05' });
    });

    it('records the use of the token', async () => {
      const { session, token } = await createImporter();

      await send(token, ROTTEN_BLUES).expect(201);

      const res = await server()
        .get('/supplier-orders/import-token')
        .set(bearer(session))
        .expect(200);
      const { importToken } = res.body as SupplierOrderImportTokenStatus;
      expect(importToken?.lastUsedAt).not.toBeNull();
    });

    // The order number is the idempotency key: sending the same email again —
    // a label that didn't stick, a retry after a timeout — changes nothing.
    it('sent twice, is recorded once, and the second answer carries no order', async () => {
      const { session, token } = await createImporter();
      await send(token, THT).expect(201);

      const again = await send(token, THT).expect(200);

      expect(again.body).toEqual({ result: 'already_recorded' });
      expect(await listOf(session)).toHaveLength(1);
    });

    it('typed in by hand first, is not recorded again', async () => {
      const { session, token } = await createImporter();
      await server()
        .post('/supplier-orders')
        .set(bearer(session))
        .send({
          supplier: 'tht',
          orderNumber: '1001',
          orderedAt: '2026-11-03',
          items: [{ title: 'Typed', unitPriceCents: 1 }],
        })
        .expect(201);

      await send(token, THT).expect(200);

      const orders = await listOf(session);
      expect(orders).toHaveLength(1);
      expect(orders[0].items[0].title).toBe('Typed');
    });

    // Another user importing the same email gets their own order: the key is
    // per user, as when typing.
    it("is recorded for each user who sends it, apart from each other's", async () => {
      const first = await createImporter();
      const second = await createImporter();

      await send(first.token, THT).expect(201);
      await send(second.token, THT).expect(201);

      expect(await listOf(first.session)).toHaveLength(1);
      expect(await listOf(second.session)).toHaveLength(1);
    });
  });

  describe('an email it cannot read', () => {
    it('is a 422 with a reason that quotes nothing from the email, and records nothing', async () => {
      const { session, token } = await createImporter();

      const res = await send(token, { ...THT, subject: '更新訂單出貨通知' }).expect(422);

      expect(res.body).toMatchObject({
        code: 'SUPPLIER_ORDER_EMAIL_UNREADABLE',
        reason: 'not an order confirmation',
      });
      expect(JSON.stringify(res.body)).not.toContain('王小明');
      expect(await listOf(session)).toHaveLength(0);
    });

    it('is a 422 for a sender whose emails are not read', async () => {
      const { token } = await createImporter();

      const res = await send(token, { ...THT, from: 'shop@elsewhere.example' }).expect(422);

      expect(res.body).toMatchObject({ reason: 'not a sender whose emails are read' });
    });
  });

  describe('the request', () => {
    it.each([
      ['no body', {}],
      ['a date that is not a datetime', { ...THT, date: '2026-11-04' }],
      ['an empty body', { ...THT, html: '' }],
    ])('refuses %s', async (_, email) => {
      const { token } = await createImporter();

      await send(token, email).expect(400);
    });

    // Well past any confirmation seen: the JSON body limit stops it before
    // the parser reads a byte.
    it('refuses a body over the size limit', async () => {
      const { token } = await createImporter();

      await send(token, { ...THT, html: 'a'.repeat(150_000) }).expect(413);
    });
  });
});
