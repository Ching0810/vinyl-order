import { randomUUID } from 'node:crypto';

import { JwtService } from '@nestjs/jwt';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import type { Role } from '@vinyl-order/shared';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import type { JwtPayload } from '../src/auth/jwt.strategy';
import { applyTrustProxy } from '../src/common/trust-proxy';
import { validateEnv } from '../src/config/env.validation';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * Which address the API takes as the client's — the one the rate limit counts
 * by — behind a given number of proxies (docs/design/deploy.md §6.2).
 *
 * There are no real proxies here: each request carries the X-Forwarded-For a
 * proxy chain would hand on, starting with an entry the client wrote itself
 * (6.6.6.6). That entry must never be taken, or a client could pick a fresh
 * address per request and never be limited. 203.0.113.0/24 and 10.0.0.0/8 are
 * documentation and private ranges, so no address here is anyone's.
 */
describe('Trust proxy (e2e)', () => {
  const SPOOFED = '6.6.6.6';
  const CLIENT = '203.0.113.7';
  const PROXY = '10.0.0.1';

  /** One app per setting, each set up by the same function main.ts calls. */
  const apps = new Map<number, NestExpressApplication>();
  let adminToken: string;
  let customerToken: string;

  beforeAll(async () => {
    for (const hops of [0, 1, 2]) {
      const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
      const app = moduleRef.createNestApplication<NestExpressApplication>();
      applyTrustProxy(app, hops);
      await app.init();
      apps.set(hops, app);
    }

    // Users built through Prisma and signed tokens, as in the orders spec: the
    // route's guards are under test here, not /auth.
    const app = apps.get(0)!;
    const prisma = app.get(PrismaService);
    const jwt = app.get(JwtService);
    const tokenFor = async (role: Role) => {
      const user = await prisma.user.create({
        data: { email: `${role}-${randomUUID()}@test.local`, passwordHash: 'unused', role },
      });
      const payload: JwtPayload = { sub: user.id, email: user.email, role: user.role };
      return jwt.sign(payload);
    };
    adminToken = await tokenFor('admin');
    customerToken = await tokenFor('customer');
  });

  afterAll(async () => {
    for (const app of apps.values()) await app.close();
  });

  /** What GET /admin/debug/request-ip answers, asked as an admin. */
  interface RequestIp {
    ip: string;
    ips: string[];
    forwardedFor: string | null;
    remoteAddress: string;
  }

  const requestIp = (hops: number, forwardedFor?: string) => {
    const req = request(apps.get(hops)!.getHttpServer())
      .get('/admin/debug/request-ip')
      .set('Authorization', `Bearer ${adminToken}`);
    if (forwardedFor) void req.set('X-Forwarded-For', forwardedFor);
    return req.expect(200).then((res) => res.body as RequestIp);
  };

  describe('with no proxy trusted (TRUST_PROXY=0)', () => {
    it("takes the connection's own address and ignores the header", async () => {
      const seen = await requestIp(0, `${SPOOFED}, ${CLIENT}`);

      expect(seen.ip).toBe(seen.remoteAddress);
      expect(seen.ips).toEqual([]);
      expect(seen.forwardedFor).toBe(`${SPOOFED}, ${CLIENT}`);
    });
  });

  describe('behind one proxy (TRUST_PROXY=1)', () => {
    it('takes the entry the proxy appended, not the one the client wrote', async () => {
      const seen = await requestIp(1, `${SPOOFED}, ${CLIENT}`);

      expect(seen.ip).toBe(CLIENT);
    });

    it('takes the client when it sent no header of its own', async () => {
      const seen = await requestIp(1, CLIENT);

      expect(seen.ip).toBe(CLIENT);
    });
  });

  describe('behind two proxies (TRUST_PROXY=2)', () => {
    it('counts back past both, and still not into what the client wrote', async () => {
      const seen = await requestIp(2, `${SPOOFED}, ${CLIENT}, ${PROXY}`);

      expect(seen.ip).toBe(CLIENT);
      expect(seen.ips).toEqual([CLIENT, PROXY]);
    });

    // Why the count must match the real chain: two hops are trusted, but only
    // one proxy appended an entry — as on a path with fewer proxies than the
    // setting assumes (deploy.md §6.2) — so the count reaches into what the
    // client wrote.
    it('takes what the client wrote when it trusts more hops than there are', async () => {
      const seen = await requestIp(2, `${SPOOFED}, ${CLIENT}`);

      expect(seen.ip).toBe(SPOOFED);
    });
  });

  describe('who may ask', () => {
    it('refuses a visitor who is not signed in', async () => {
      await request(apps.get(0)!.getHttpServer()).get('/admin/debug/request-ip').expect(401);
    });

    it('refuses a customer', async () => {
      await request(apps.get(0)!.getHttpServer())
        .get('/admin/debug/request-ip')
        .set('Authorization', `Bearer ${customerToken}`)
        .expect(403);
    });
  });

  describe('TRUST_PROXY', () => {
    /** The variables validateEnv requires, so only TRUST_PROXY varies. */
    const required = {
      DATABASE_URL: 'postgresql://localhost/vinyl',
      JWT_SECRET: 'x'.repeat(16),
      JWT_EXPIRES_IN: '1d',
      DISCOGS_TOKEN: 'token',
      MOCKPAY_WEBHOOK_SECRET: 'x'.repeat(32),
    };

    it('trusts no proxy when unset', () => {
      expect(validateEnv(required).TRUST_PROXY).toBe(0);
    });

    it('reads a count as a number, which Express takes as hops', () => {
      // A string "2" would be read by Express as an address to trust instead.
      expect(validateEnv({ ...required, TRUST_PROXY: '2' }).TRUST_PROXY).toBe(2);
    });

    // "true" would trust every hop, so the leftmost entry — the client's own —
    // would be taken.
    it.each(['true', 'false', '-1', '1.5'])('refuses "%s"', (value) => {
      expect(() => validateEnv({ ...required, TRUST_PROXY: value })).toThrow(/TRUST_PROXY/);
    });
  });
});
