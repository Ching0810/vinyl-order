import { randomUUID } from 'node:crypto';

import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import {
  type CatalogAlbum,
  catalogAlbumSchema,
  type CatalogSearchHit,
  type Supplier,
} from '@vinyl-order/shared';
import request from 'supertest';
import { App } from 'supertest/types';

import { AppModule } from '../src/app.module';
import type { JwtPayload } from '../src/auth/jwt.strategy';
import { searchTitleOf } from '../src/catalog/listing-title';
import type { Role } from '../src/generated/prisma/client';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * Searching the shops' copied catalogs (docs/design/tracker.md §7.3, §11):
 * anyone signed in, best match first, new vinyl unless asked, Chinese and
 * Japanese names found as well as English ones (§15 Q6), and the listings
 * grouped into albums, each saying whether a record tracks it.
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
    await prisma.catalogStockRun.deleteMany();
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
    prisma.catalogEntry.createManyAndReturn({
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

  const albumsFor = async (token: string, query: Record<string, string>) => {
    const response = await request(app.getHttpServer())
      .get('/catalog/search')
      .query(query)
      .set({ Authorization: `Bearer ${token}` })
      .expect(200);
    return response.body as CatalogAlbum[];
  };

  /** The listings found, album by album: what matching is about. */
  const search = async (token: string, query: Record<string, string>) =>
    (await albumsFor(token, query)).flatMap((album) => album.listings);

  const titlesOf = (hits: CatalogSearchHit[]) => hits.map((hit) => hit.title);

  describe('who may search', () => {
    it('anyone signed in, no one else', async () => {
      const customer = await createUser('customer');
      await listed('tht', ['The Beatles - Abbey Road LP']);

      await request(app.getHttpServer()).get('/catalog/search?q=abbey').expect(401);
      expect(titlesOf(await search(customer, { q: 'abbey' }))).toEqual([
        'The Beatles - Abbey Road LP',
      ]);
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
        .get('/catalog/search')
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

    it('returns 30 albums at most', async () => {
      const admin = await createUser('admin');
      await listed(
        'tht',
        Array.from({ length: 35 }, (_, index) => `Miles Davis - Kind of Blue #${index} LP`),
      );

      expect(await albumsFor(admin, { q: 'kind of blue' })).toHaveLength(30);
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

  describe('albums', () => {
    /** Each shop's listing's availability; equal scores come in either order. */
    const availabilityByShop = (album: CatalogAlbum) =>
      Object.fromEntries(album.listings.map((listing) => [listing.supplier, listing.availability]));

    it('groups one album’s listings at every shop, the shared shape, tracked by no one', async () => {
      const member = await createUser('customer');
      await listed('tht', ['Coldplay - Parachutes LP', 'Coldplay - X & Y 2LP']);
      await listed('cosmic', ['Coldplay - Parachutes（黑膠唱片 LP）']);
      await listed('rotten_blues', ['【歐版黑膠】Coldplay《Parachutes》']);

      const albums = await albumsFor(member, { q: 'coldplay parachutes' });

      for (const album of albums) expect(catalogAlbumSchema.parse(album)).toEqual(album);
      expect(albums[0]).toMatchObject({ artist: 'Coldplay', title: 'Parachutes' });
      expect(albums[0].listings.map((listing) => listing.supplier).sort()).toEqual([
        'cosmic',
        'rotten_blues',
        'tht',
      ]);
      expect(albums[0].productId).toBeNull();
      expect(albums[0].listings.every((listing) => !listing.watched)).toBe(true);
      expect(albums[0].key).toBe(albums[0].listings[0].id);
    });

    it('keeps two pressings at one shop in one album; another album apart', async () => {
      const member = await createUser('customer');
      await listed('tht', ['Coldplay - Parachutes LP', 'Coldplay - Parachutes LP (Red Vinyl)']);
      await listed('tht', ['Coldplay - Parachutes Live LP']);

      const albums = await albumsFor(member, { q: 'coldplay parachutes' });

      const parachutes = albums.find((album) => album.title === 'Parachutes');
      expect(parachutes?.listings).toHaveLength(2);
      expect(albums.map((album) => album.title)).toContain('Parachutes Live');
    });

    it('the same album title by another artist is another album', async () => {
      const member = await createUser('customer');
      await listed('tht', ['Coldplay - Greatest Hits LP', 'Queen - Greatest Hits LP']);

      expect(await albumsFor(member, { q: 'greatest hits' })).toHaveLength(2);
    });

    it('names the record holding an album, and which of its listings this user tracks', async () => {
      const [tracker, other] = [await createUser('customer'), await createUser('customer')];
      const [tht] = await listed('tht', ['Coldplay - Parachutes LP']);
      await listed('cosmic', ['Coldplay - Parachutes（黑膠唱片 LP）']);
      const artist = await prisma.artist.create({ data: { name: 'Coldplay' } });
      const product = await prisma.product.create({
        include: { offers: true },
        data: {
          title: 'Parachutes',
          artistId: artist.id,
          offers: {
            create: {
              supplier: 'tht',
              externalId: tht.externalId,
              url: tht.url,
              sourceTitle: tht.title,
              priceCents: 100_000,
              availability: 'in_stock',
              lastCheckedAt: new Date(),
            },
          },
        },
      });
      const trackerId = jwt.decode<JwtPayload>(tracker).sub;
      await prisma.offerWatch.create({
        data: { userId: trackerId, offerId: product.offers[0].id },
      });

      const [mine] = await albumsFor(tracker, { q: 'coldplay parachutes' });
      const [theirs] = await albumsFor(other, { q: 'coldplay parachutes' });

      const watchedIn = (album: CatalogAlbum) =>
        album.listings.filter((listing) => listing.watched).map((listing) => listing.supplier);
      expect(mine.productId).toBe(product.id);
      // THT's listing is tracked; Cosmic's, on no record yet, isn't.
      expect(watchedIn(mine)).toEqual(['tht']);
      expect(theirs.productId).toBe(product.id);
      expect(watchedIn(theirs)).toEqual([]);
      // THT's was read when it was tracked; Cosmic's never has been.
      expect(availabilityByShop(mine)).toEqual({ tht: 'in_stock', cosmic: 'unknown' });
    });

    it('a listing on no record is a pre-order if its title says so, else unknown', async () => {
      const member = await createUser('customer');
      await listed('tht', ['Coldplay - Parachutes 2LP (12/11發行預訂)']);
      await listed('cosmic', ['Coldplay - Parachutes（黑膠唱片 LP）']);

      const [album] = await albumsFor(member, { q: 'coldplay parachutes' });

      expect(availabilityByShop(album)).toEqual({ tht: 'pre_order', cosmic: 'unknown' });
    });

    describe('price and stock', () => {
      const WALKED = new Date('2026-11-20T04:00:00Z');

      /** A shop's stock walked at WALKED, its list showing this listing so. */
      const walked = async (
        listing: { id: string; supplier: Supplier },
        stock: {
          priceCents: number;
          availability: 'in_stock' | 'sold_out';
          stockQty: number | null;
        },
      ) => {
        await prisma.catalogEntry.update({ where: { id: listing.id }, data: stock });
        await prisma.catalogStockRun.upsert({
          where: { supplier: listing.supplier },
          create: { supplier: listing.supplier, finishedAt: WALKED, pages: 1, entries: 1 },
          update: { finishedAt: WALKED },
        });
      };

      /** A record holding this listing, its offer read at `checkedAt`. */
      const offerOn = async (
        listing: { supplier: Supplier; externalId: string; url: string; title: string },
        checkedAt: Date,
      ) => {
        const artist = await prisma.artist.create({ data: { name: 'Coldplay' } });
        await prisma.product.create({
          data: {
            title: 'Parachutes',
            artistId: artist.id,
            offers: {
              create: {
                supplier: listing.supplier,
                externalId: listing.externalId,
                url: listing.url,
                sourceTitle: listing.title,
                priceCents: 140_000,
                availability: 'in_stock',
                stockQty: 5,
                lastCheckedAt: checkedAt,
              },
            },
          },
        });
      };

      it('a listing the list pages read: its price, stock and count, as of the walk', async () => {
        const member = await createUser('customer');
        const [tht] = await listed('tht', ['Coldplay - Parachutes LP']);
        await walked(tht, { priceCents: 158_000, availability: 'in_stock', stockQty: 2 });

        const [album] = await albumsFor(member, { q: 'coldplay parachutes' });

        expect(album.listings[0]).toMatchObject({
          availability: 'in_stock',
          priceCents: 158_000,
          currency: 'TWD',
          stockQty: 2,
          checkedAt: WALKED.toISOString(),
        });
      });

      it('the newer of a record’s offer and the list pages', async () => {
        const member = await createUser('customer');
        const [tht] = await listed('tht', ['Coldplay - Parachutes LP']);
        await walked(tht, { priceCents: 158_000, availability: 'sold_out', stockQty: 0 });

        // Read from its product page after the walk: the offer's.
        await offerOn(tht, new Date('2026-11-20T06:00:00Z'));
        expect(
          (await albumsFor(member, { q: 'coldplay parachutes' }))[0].listings[0],
        ).toMatchObject({ availability: 'in_stock', priceCents: 140_000, stockQty: 5 });

        // A walk since: the list's.
        await prisma.catalogStockRun.update({
          where: { supplier: 'tht' },
          data: { finishedAt: new Date('2026-11-20T08:00:00Z') },
        });
        expect(
          (await albumsFor(member, { q: 'coldplay parachutes' }))[0].listings[0],
        ).toMatchObject({
          availability: 'sold_out',
          priceCents: 158_000,
          stockQty: 0,
          checkedAt: '2026-11-20T08:00:00.000Z',
        });
      });

      it('a listing nothing has read: no price, no time', async () => {
        const member = await createUser('customer');
        await listed('tht', ['Coldplay - Parachutes LP']);

        const [album] = await albumsFor(member, { q: 'coldplay parachutes' });

        expect(album.listings[0]).toMatchObject({
          availability: 'unknown',
          priceCents: null,
          stockQty: null,
          checkedAt: null,
        });
      });
    });
  });
});
