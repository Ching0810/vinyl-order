import { randomUUID } from 'node:crypto';

import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { type CatalogSearchHit, catalogSearchHitSchema, type Supplier } from '@vinyl-order/shared';
import request from 'supertest';
import { App } from 'supertest/types';

import { AppModule } from '../src/app.module';
import type { JwtPayload } from '../src/auth/jwt.strategy';
import { searchTitleOf } from '../src/catalog/listing-title';
import type { Role } from '../src/generated/prisma/client';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * Searching the shops' copied catalogs (docs/design/tracker.md §7.3, §11):
 * admin-only, best match first, new vinyl unless asked, and Chinese and
 * Japanese names found as well as English ones (§15 Q6).
 *
 * The listings are made up, written straight into CatalogEntry the way the
 * sync writes them.
 */
describe('Catalog search (e2e)', () => {
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

  beforeEach(async () => {
    await prisma.catalogEntry.deleteMany();
  });

  afterAll(async () => {
    await app.close();
  });

  const createUser = async (role: Role) => {
    const user = await prisma.user.create({
      data: { email: `${role}-${randomUUID()}@test.local`, passwordHash: 'unused', role },
    });
    const payload: JwtPayload = { sub: user.id, email: user.email, role: user.role };
    return jwt.sign(payload);
  };

  /** Listings at a shop, by title; vinyl and new unless a flag says not. */
  const listed = (
    supplier: Supplier,
    titles: (string | { title: string; isVinyl?: boolean; isUsed?: boolean })[],
  ) =>
    prisma.catalogEntry.createMany({
      data: titles.map((listing) => {
        const {
          title,
          isVinyl = true,
          isUsed = false,
        } = typeof listing === 'string' ? { title: listing } : listing;
        const externalId = randomUUID();
        return {
          supplier,
          externalId,
          url: `https://www.example-shop.test/products/${externalId}`,
          title,
          searchTitle: searchTitleOf(title),
          imageUrl: null,
          isVinyl,
          isUsed,
          syncedAt: new Date(),
        };
      }),
    });

  const search = async (token: string, query: Record<string, string>) => {
    const response = await request(app.getHttpServer())
      .get('/admin/catalog/search')
      .query(query)
      .set({ Authorization: `Bearer ${token}` })
      .expect(200);
    return response.body as CatalogSearchHit[];
  };

  const titlesOf = (hits: CatalogSearchHit[]) => hits.map((hit) => hit.title);

  describe('who may search', () => {
    it('refuses anyone not signed in, and a customer', async () => {
      const customer = await createUser('customer');

      await request(app.getHttpServer()).get('/admin/catalog/search?q=abbey').expect(401);
      await request(app.getHttpServer())
        .get('/admin/catalog/search?q=abbey')
        .set({ Authorization: `Bearer ${customer}` })
        .expect(403);
    });

    it.each([
      ['no query', {}],
      ['a query of one character', { q: 'a' }],
      ['a query of spaces', { q: '    ' }],
      ['a query over 100 characters', { q: 'a'.repeat(101) }],
      ['a shop it doesn’t know', { q: 'abbey', supplier: 'discogs' }],
      ['a flag that isn’t one', { q: 'abbey', used: 'maybe' }],
    ])('refuses %s', async (_case, query) => {
      const admin = await createUser('admin');

      await request(app.getHttpServer())
        .get('/admin/catalog/search')
        .query(query)
        .set({ Authorization: `Bearer ${admin}` })
        .expect(400);
    });
  });

  describe('matching', () => {
    it('finds a record at every shop, best first, each hit in the shared shape', async () => {
      const admin = await createUser('admin');
      await listed('tht', ['The Beatles - Abbey Road LP', 'Pink Floyd - The Wall 2LP']);
      await listed('cosmic', ['The Beatles – Abbey Road (黑膠唱片LP)']);
      await listed('rotten_blues', ['【歐版黑膠】The Beatles《Abbey Road》']);

      const hits = await search(admin, { q: 'beatles abbey road' });

      expect(hits.map((hit) => hit.supplier).sort()).toEqual(['cosmic', 'rotten_blues', 'tht']);
      for (const hit of hits) expect(catalogSearchHitSchema.parse(hit)).toEqual(hit);
      expect(hits[0].score).toBe(1);
    });

    it('finds the words out of order, in another width and case, or with a typo', async () => {
      const admin = await createUser('admin');
      await listed('tht', ['The Beatles - Abbey Road LP']);

      for (const q of ['abbey road beatles', 'ＡＢＢＥＹ　ＲＯＡＤ', 'ABBEY ROAD', 'abbey roda']) {
        expect(titlesOf(await search(admin, { q }))).toEqual(['The Beatles - Abbey Road LP']);
      }
    });

    it('finds Chinese and Japanese names, two characters included', async () => {
      const admin = await createUser('admin');
      await listed('tht', ['坂本龍一 Ryuichi Sakamoto - 1996 LP', '珍妮 - 第一張 LP']);
      await listed('rotten_blues', ['【日版黑膠】米津玄師《LOST CORNER》']);
      await listed('cosmic', ['珍珠 - 第一張 LP']);

      expect(titlesOf(await search(admin, { q: '坂本龍一' }))).toEqual([
        '坂本龍一 Ryuichi Sakamoto - 1996 LP',
      ]);
      expect(titlesOf(await search(admin, { q: '米津玄師' }))).toEqual([
        '【日版黑膠】米津玄師《LOST CORNER》',
      ]);
      // One character apart is another artist.
      expect(titlesOf(await search(admin, { q: '珍妮' }))).toEqual(['珍妮 - 第一張 LP']);
    });

    it('finds a name inside a run of Chinese, after the names that start a word', async () => {
      const admin = await createUser('admin');
      // Unspaced, 金珍妮 is one word to pg_trgm: 珍妮 is found as a substring.
      await listed('tht', ['金珍妮 Jennie - Ruby LP', '珍妮 - 第一張 LP']);

      const hits = await search(admin, { q: '珍妮' });

      expect(titlesOf(hits)).toEqual(['珍妮 - 第一張 LP', '金珍妮 Jennie - Ruby LP']);
      expect(hits[1].score).toBeLessThan(0.6);
    });

    it('takes % and _ in a query as themselves', async () => {
      const admin = await createUser('admin');
      await listed('tht', ['Various - Rare Grooves LP']);

      // As LIKE's wildcards these would match any title; as text, none here.
      expect(await search(admin, { q: '%%' })).toEqual([]);
      expect(await search(admin, { q: '__' })).toEqual([]);
    });

    it('ranks the exact name first, a near one after it', async () => {
      const admin = await createUser('admin');
      await listed('tht', ['坂本龍二 - Something LP', '坂本龍一 - 1996 LP']);

      const hits = await search(admin, { q: '坂本龍一' });

      expect(titlesOf(hits)).toEqual(['坂本龍一 - 1996 LP', '坂本龍二 - Something LP']);
      expect(hits[0].score).toBeGreaterThan(hits[1].score);
    });

    it('among equal matches, the title closest to the query as a whole first', async () => {
      const admin = await createUser('admin');
      await listed('tht', [
        'The Beatles - Abbey Road (Super Deluxe Box Set) 4LP',
        'The Beatles - Abbey Road LP',
      ]);

      expect(titlesOf(await search(admin, { q: 'abbey road' }))).toEqual([
        'The Beatles - Abbey Road LP',
        'The Beatles - Abbey Road (Super Deluxe Box Set) 4LP',
      ]);
    });

    it('finds nothing for a query no title is near', async () => {
      const admin = await createUser('admin');
      await listed('tht', ['The Beatles - Abbey Road LP']);

      expect(await search(admin, { q: 'zz' })).toEqual([]);
    });

    it('returns 30 at most', async () => {
      const admin = await createUser('admin');
      await listed(
        'tht',
        Array.from({ length: 35 }, (_, index) => `Miles Davis - Kind of Blue #${index} LP`),
      );

      expect(await search(admin, { q: 'kind of blue' })).toHaveLength(30);
    });
  });

  describe('filters', () => {
    beforeEach(async () => {
      await listed('tht', [
        'Bill Evans - Waltz for Debby LP',
        { title: 'Bill Evans - Waltz for Debby LP (二手)', isUsed: true },
        { title: 'Bill Evans - Waltz for Debby CD', isVinyl: false },
      ]);
      await listed('cosmic', ['Bill Evans – Waltz for Debby (黑膠唱片LP)']);
    });

    it('new vinyl only, unless asked', async () => {
      const admin = await createUser('admin');

      expect(titlesOf(await search(admin, { q: 'waltz for debby' })).sort()).toEqual([
        'Bill Evans - Waltz for Debby LP',
        'Bill Evans – Waltz for Debby (黑膠唱片LP)',
      ]);
    });

    it('used records, when asked', async () => {
      const admin = await createUser('admin');

      const hits = await search(admin, { q: 'waltz for debby', used: 'true' });

      expect(hits.filter((hit) => hit.isUsed).map((hit) => hit.title)).toEqual([
        'Bill Evans - Waltz for Debby LP (二手)',
      ]);
      expect(hits.every((hit) => hit.isVinyl)).toBe(true);
    });

    it('other goods, when asked', async () => {
      const admin = await createUser('admin');

      const hits = await search(admin, { q: 'waltz for debby', nonVinyl: 'true' });

      expect(hits.filter((hit) => !hit.isVinyl).map((hit) => hit.title)).toEqual([
        'Bill Evans - Waltz for Debby CD',
      ]);
      expect(hits.some((hit) => hit.isUsed)).toBe(false);
    });

    it('one shop', async () => {
      const admin = await createUser('admin');

      const hits = await search(admin, { q: 'waltz for debby', supplier: 'cosmic' });

      expect(hits.map((hit) => hit.supplier)).toEqual(['cosmic']);
    });
  });
});
