import { randomUUID } from 'node:crypto';

import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import type { PublicUser } from '@vinyl-order/shared';
import request from 'supertest';
import { App } from 'supertest/types';

import { AppModule } from '../src/app.module';
import type { JwtPayload } from '../src/auth/jwt.strategy';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * GET /auth/me answers "who am I?" for everyone, including visitors who have
 * never signed in — the storefront asks it on every page. Routes that need a
 * session must still refuse one that isn't there.
 */
describe('Auth (e2e)', () => {
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

  /** A signed session token for a user, as the login route would issue. */
  const tokenFor = (user: { id: string; email: string; role: PublicUser['role'] }): string => {
    const payload: JwtPayload = { sub: user.id, email: user.email, role: user.role };
    return jwt.sign(payload);
  };

  const me = (token?: string) => {
    const call = request(app.getHttpServer()).get('/auth/me');
    return token ? call.set('Authorization', `Bearer ${token}`) : call;
  };

  it('answers with no user for a visitor who is not signed in', async () => {
    const res = await me().expect(200);

    expect(res.body).toEqual({ user: null });
  });

  it('answers with no user for a token it cannot verify', async () => {
    const res = await me('not.a.token').expect(200);

    expect(res.body).toEqual({ user: null });
  });

  /** A token can outlive the account it names; that is signed out, not an error. */
  it('answers with no user for a token whose account is gone', async () => {
    const user = await prisma.user.create({
      data: { email: `gone-${randomUUID()}@test.local`, passwordHash: 'unused' },
    });
    const token = tokenFor(user);
    await prisma.user.delete({ where: { id: user.id } });

    const res = await me(token).expect(200);

    expect(res.body).toEqual({ user: null });
  });

  it('answers with the signed-in user, and never their password hash', async () => {
    const user = await prisma.user.create({
      data: { email: `me-${randomUUID()}@test.local`, passwordHash: 'unused', name: 'Test User' },
    });
    const token = tokenFor(user);

    const res = await me(token).expect(200);

    const body = res.body as { user: PublicUser };
    expect(body.user).toMatchObject({
      id: user.id,
      email: user.email,
      name: 'Test User',
      role: 'customer',
    });
    expect(body.user).not.toHaveProperty('passwordHash');
  });

  /** The optional guard is for /auth/me alone: a real session is still required elsewhere. */
  it('still refuses routes that need a session', async () => {
    await request(app.getHttpServer()).get('/cart').expect(401);
    await request(app.getHttpServer()).get('/orders').expect(401);
  });
});
