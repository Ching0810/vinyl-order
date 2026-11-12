import { createHash, randomUUID } from 'node:crypto';

import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import type {
  CreatedSupplierOrderImportToken,
  SupplierOrderImportTokenStatus,
} from '@vinyl-order/shared';
import request from 'supertest';
import { App } from 'supertest/types';

import { AppModule } from '../src/app.module';
import type { JwtPayload } from '../src/auth/jwt.strategy';
import { PrismaService } from '../src/prisma/prisma.service';
import { SupplierOrderImportTokensService } from '../src/supplier-orders/import/import-token.service';

/**
 * The import token behind email import (docs/design/tracker.md §9.4): one per
 * user, shown once, stored only as a hash, replaceable and revocable.
 */
describe('Supplier order import token (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let jwt: JwtService;
  let tokens: SupplierOrderImportTokensService;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);
    jwt = app.get(JwtService);
    tokens = app.get(SupplierOrderImportTokensService);
  });

  afterAll(async () => {
    await app.close();
  });

  const createUser = async () => {
    const user = await prisma.user.create({
      data: { email: `importer-${randomUUID()}@test.local`, passwordHash: 'unused' },
    });
    const payload: JwtPayload = { sub: user.id, email: user.email, role: user.role };
    return { user, session: jwt.sign(payload) };
  };

  const server = () => request(app.getHttpServer());
  const auth = (session: string) => ({ Authorization: `Bearer ${session}` });
  const path = '/supplier-orders/import-token';

  const status = async (session: string) =>
    (await server().get(path).set(auth(session)).expect(200))
      .body as SupplierOrderImportTokenStatus;

  const created = async (session: string) =>
    (await server().post(path).set(auth(session)).expect(201))
      .body as CreatedSupplierOrderImportToken;

  const sha256 = (text: string) => createHash('sha256').update(text).digest('hex');

  it('refuses every route without a session', async () => {
    await server().get(path).expect(401);
    await server().post(path).expect(401);
    await server().delete(path).expect(401);
  });

  // Also pins the route order: were `GET /supplier-orders/:id` registered
  // first, this would be a 404 for an order with the id "import-token".
  it('says there is none before one is made', async () => {
    const { session } = await createUser();

    expect(await status(session)).toEqual({ importToken: null });
  });

  it('shows a new token once, then only when it was made', async () => {
    const { session } = await createUser();

    const token = await created(session);

    expect(token.token).toMatch(/^vo_imp_[A-Za-z0-9_-]{43}$/);
    expect(token.lastUsedAt).toBeNull();
    const shown = await status(session);
    expect(shown).toEqual({ importToken: { createdAt: token.createdAt, lastUsedAt: null } });
    expect(JSON.stringify(shown)).not.toContain(token.token);
  });

  it('stores only the hash', async () => {
    const { user, session } = await createUser();

    const { token } = await created(session);

    const row = await prisma.supplierOrderImportToken.findUniqueOrThrow({
      where: { userId: user.id },
    });
    expect(row.tokenHash).toBe(sha256(token));
    expect(JSON.stringify(row)).not.toContain(token);
  });

  it('finds its user, and records the use', async () => {
    const { user, session } = await createUser();
    const { token } = await created(session);

    expect(await tokens.userIdFor(token)).toBe(user.id);

    expect((await status(session)).importToken?.lastUsedAt).not.toBeNull();
  });

  it('replaces the old token: the old one stops working, the new one starts unused', async () => {
    const { user, session } = await createUser();
    const first = await created(session);
    await tokens.userIdFor(first.token);

    const second = await created(session);

    expect(second.token).not.toBe(first.token);
    expect(await tokens.userIdFor(first.token)).toBeNull();
    expect(await prisma.supplierOrderImportToken.count({ where: { userId: user.id } })).toBe(1);
    expect((await status(session)).importToken?.lastUsedAt).toBeNull();
    expect(await tokens.userIdFor(second.token)).toBe(user.id);
  });

  it('revokes: the token stops working, and revoking again is no error', async () => {
    const { session } = await createUser();
    const { token } = await created(session);

    await server().delete(path).set(auth(session)).expect(204);

    expect(await tokens.userIdFor(token)).toBeNull();
    expect(await status(session)).toEqual({ importToken: null });
    await server().delete(path).set(auth(session)).expect(204);
  });

  it("leaves another user's token alone", async () => {
    const mine = await createUser();
    const theirs = await createUser();
    const theirToken = await created(theirs.session);
    await created(mine.session);

    await server().delete(path).set(auth(mine.session)).expect(204);

    expect(await tokens.userIdFor(theirToken.token)).toBe(theirs.user.id);
  });

  it.each([
    ['no prefix', 'x'.repeat(50)],
    ['the right shape but no such token', `vo_imp_${'A'.repeat(43)}`],
    ['too short', 'vo_imp_abc'],
    ['an empty string', ''],
  ])('finds nobody for %s', async (_, token) => {
    expect(await tokens.userIdFor(token)).toBeNull();
  });

  // The import token is not a session: sent where a login is needed, it is
  // just a JWT that doesn't verify.
  it('is not accepted as a session', async () => {
    const { session } = await createUser();
    const { token } = await created(session);

    await server().get('/supplier-orders').set(auth(token)).expect(401);
  });
});
