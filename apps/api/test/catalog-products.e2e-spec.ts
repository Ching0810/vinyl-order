import { randomUUID } from 'node:crypto';

import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import {
  type Artist,
  artistSchema,
  type TrackListingResult,
  trackListingResultSchema,
  type WatchedOffer,
  watchedOfferSchema,
  type AttachOfferResult,
  attachOfferResultSchema,
  type CatalogSearchHit,
  type ProductWithOffers,
  productWithOffersSchema,
  type PopularListing,
  popularListingSchema,
  type Supplier,
  type Connection,
  type Notification,
  notificationSchema,
  type UnreadCount,
} from '@vinyl-order/shared';
import request from 'supertest';
import { App } from 'supertest/types';

import { AppModule } from '../src/app.module';
import type { JwtPayload } from '../src/auth/jwt.strategy';
import { SUPPLIER_ADAPTERS, type SupplierAdapters } from '../src/catalog/adapters';
import { normalizeName, searchTitleOf } from '../src/catalog/listing-title';
import { ShopFetchError } from '../src/catalog/shop-fetcher';
import type { ParsedOffer, SupplierAdapter } from '../src/catalog/supplier-adapter';
import type { Role } from '../src/generated/prisma/client';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * Records made from a catalog listing, and their offers read again
 * (docs/design/tracker.md §5.2, §5.3, §5.7, §7.3): the listing's page read
 * live, the artist found by any of its names, history written only on a
 * change, and a shop that fails keeping its last good values.
 *
 * Fake adapters answer for the shops, from pages set per test: nothing here
 * reaches a shop.
 */
describe('Records from the catalog (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let jwt: JwtService;
  let admin: string;

  /** What each fake shop answers for a URL: an offer, or an error to throw. */
  const pages = new Map<string, ParsedOffer | Error>();
  const fetched: string[] = [];

  /** Each fake shop's host, as a pasted link names it. */
  const hostOf = (supplier: Supplier) => `www.${supplier.replace('_', '-')}.test`;

  const fakeAdapter = (supplier: Supplier): SupplierAdapter => ({
    supplier,
    rules: { hosts: [hostOf(supplier)], paths: [] },
    fetchOffer: (url: string) => {
      fetched.push(url);
      const page = pages.get(url);
      if (page === undefined) return Promise.reject(new ShopFetchError('failed', 'answered 404'));
      return page instanceof Error ? Promise.reject(page) : Promise.resolve(page);
    },
    syncCatalog: () => {
      throw new Error('not used');
    },
    syncStock: () => {
      throw new Error('not used');
    },
    syncPopular: () => Promise.reject(new Error('not used')),
  });

  // Candlelight has no adapter, as in the app.
  const adapters: SupplierAdapters = {
    tht: fakeAdapter('tht'),
    cosmic: fakeAdapter('cosmic'),
    rotten_blues: fakeAdapter('rotten_blues'),
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(SUPPLIER_ADAPTERS)
      .useValue(adapters)
      .compile();
    app = moduleRef.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);
    jwt = app.get(JwtService);
  });

  beforeEach(async () => {
    pages.clear();
    fetched.length = 0;
    await prisma.catalogEntry.deleteMany();
    await prisma.albumSplit.deleteMany();
    // Tracked records (offers and snapshots cascade), then artists: an artist
    // left by another test would own the names these tests resolve.
    await prisma.product.deleteMany();
    await prisma.artist.deleteMany();
    admin = await createUser('admin');
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

  /** A listing in the catalog, and the page its shop answers with. */
  const listing = async (
    supplier: Supplier,
    overrides: Partial<ParsedOffer> = {},
  ): Promise<{ entryId: string; url: string; offer: ParsedOffer }> => {
    const externalId = `handle-${randomUUID()}`;
    const url = `https://${hostOf(supplier)}/products/${externalId}`;
    const offer: ParsedOffer = {
      externalId,
      url,
      sourceTitle: '坂本龍一 Ryuichi Sakamoto - 1996 LP (日版)',
      priceCents: 150_000,
      currency: 'TWD',
      availability: 'in_stock',
      stockQty: 3,
      expectedAt: null,
      expectedNote: null,
      barcode: null,
      imageUrl: 'https://cdn.example-shop.test/1996.jpg',
      title: '1996',
      artistNames: ['坂本龍一', 'Ryuichi Sakamoto'],
      format: 'LP',
      edition: '日版',
      isVinyl: true,
      isUsed: false,
      ...overrides,
    };
    const entry = await prisma.catalogEntry.create({
      data: {
        supplier,
        externalId,
        url,
        title: offer.sourceTitle,
        searchTitle: searchTitleOf(offer.sourceTitle),
        imageUrl: null,
        isVinyl: true,
        isUsed: false,
        syncedAt: new Date(),
      },
    });
    pages.set(url, offer);
    return { entryId: entry.id, url, offer };
  };

  const server = () => request(app.getHttpServer());
  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  const create = (body: object, token = admin) =>
    server().post('/admin/products/from-catalog').set(auth(token)).send(body);

  const refresh = (id: string, token = admin) =>
    server().post(`/admin/products/${id}/refresh`).set(auth(token));

  const created = async (body: object) =>
    (await create(body).expect(201)).body as ProductWithOffers;

  const aliasesOf = async (artistId: string) =>
    (await prisma.artistAlias.findMany({ where: { artistId }, orderBy: { createdAt: 'asc' } })).map(
      (alias) => alias.name,
    );

  const snapshotsOf = (offerId: string) =>
    prisma.offerSnapshot.findMany({ where: { offerId }, orderBy: { takenAt: 'asc' } });

  /** An artist with these names, as an earlier record would have left it. */
  const artistNamed = (name: string, aliases: string[] = [name]) =>
    prisma.artist.create({
      data: {
        name,
        aliases: {
          create: aliases.map((alias) => ({ name: alias, normalized: normalizeName(alias) })),
        },
      },
      include: { aliases: true },
    });

  describe('who may', () => {
    it('refuses anyone not signed in, and a customer', async () => {
      const customer = await createUser('customer');
      const id = randomUUID();

      await server().post('/admin/products/from-catalog').send({ catalogEntryId: id }).expect(401);
      await create({ catalogEntryId: id }, customer).expect(403);
      await server().post(`/admin/products/${id}/refresh`).expect(401);
      await refresh(id, customer).expect(403);
    });
  });

  describe('creating a record from a listing', () => {
    it('reads the listing’s page and makes the record, its artist, its offer and its first snapshot', async () => {
      const { entryId, url } = await listing('tht');

      const product = await created({ catalogEntryId: entryId });

      expect(productWithOffersSchema.parse(product)).toEqual(product);
      expect(fetched).toEqual([url]);
      expect(product).toMatchObject({
        title: '1996',
        imageUrl: 'https://cdn.example-shop.test/1996.jpg',
        format: ['LP'],
        edition: '日版',
        artist: { name: '坂本龍一' },
      });
      expect(product.offers).toEqual([
        expect.objectContaining({
          supplier: 'tht',
          url,
          sourceTitle: '坂本龍一 Ryuichi Sakamoto - 1996 LP (日版)',
          priceCents: 150_000,
          availability: 'in_stock',
          stockQty: 3,
          expectedAt: null,
          lastError: null,
        }),
      ]);
      expect(await aliasesOf(product.artist.id)).toEqual(['坂本龍一', 'Ryuichi Sakamoto']);
      expect(await snapshotsOf(product.offers[0].id)).toEqual([
        expect.objectContaining({ priceCents: 150_000, availability: 'in_stock', stockQty: 3 }),
      ]);
    });

    it('keeps an expected date as the day the shop wrote', async () => {
      const { entryId } = await listing('rotten_blues', {
        availability: 'pre_order',
        expectedAt: '2026-12-05',
      });

      const product = await created({ catalogEntryId: entryId });

      expect(product.offers[0]).toMatchObject({
        availability: 'pre_order',
        expectedAt: '2026-12-05',
      });
    });

    it('refuses a listing already tracked, with its record, without asking the shop', async () => {
      const { entryId } = await listing('tht');
      const first = await created({ catalogEntryId: entryId });
      fetched.length = 0;

      const response = await create({ catalogEntryId: entryId }).expect(409);

      expect(response.body).toMatchObject({ code: 'OFFER_ALREADY_TRACKED', productId: first.id });
      expect(fetched).toEqual([]);
    });

    it('reuses the artist that owns one of the names, and adds the names it lacked', async () => {
      const known = await artistNamed('坂本龍一');
      const { entryId } = await listing('cosmic');

      const product = await created({ catalogEntryId: entryId });

      expect(product.artist).toMatchObject({ id: known.id, name: '坂本龍一' });
      expect(await aliasesOf(known.id)).toEqual(['坂本龍一', 'Ryuichi Sakamoto']);
      expect(await prisma.artist.count({ where: { id: { not: known.id } } })).toBe(0);
    });

    it('matches a name however it is written: width, case, spaces', async () => {
      const known = await artistNamed('Ryuichi Sakamoto');
      const { entryId } = await listing('tht', {
        artistNames: ['ＲＹＵＩＣＨＩ　ＳＡＫＡＭＯＴＯ'],
      });

      expect((await created({ catalogEntryId: entryId })).artist.id).toBe(known.id);
      expect(await aliasesOf(known.id)).toEqual(['Ryuichi Sakamoto']);
    });

    it('asks which artist when the names belong to two, and makes nothing until told', async () => {
      const first = await artistNamed('坂本龍一');
      const second = await artistNamed('Ryuichi Sakamoto');
      const { entryId, offer } = await listing('tht');

      const response = await create({ catalogEntryId: entryId }).expect(409);

      expect(response.body).toMatchObject({ code: 'ARTIST_AMBIGUOUS' });
      expect((response.body as { artists: unknown[] }).artists).toEqual(
        expect.arrayContaining([
          { id: first.id, name: '坂本龍一' },
          { id: second.id, name: 'Ryuichi Sakamoto' },
        ]),
      );
      expect((response.body as { artists: unknown[] }).artists).toHaveLength(2);
      expect(await prisma.offer.count({ where: { externalId: offer.externalId } })).toBe(0);
      expect(await aliasesOf(first.id)).toEqual(['坂本龍一']);

      const product = await created({ catalogEntryId: entryId, artistId: second.id });

      expect(product.artist.id).toBe(second.id);
      expect(await aliasesOf(second.id)).toEqual(['Ryuichi Sakamoto', '坂本龍一']);
    });

    it('asks for the artist when the title names none', async () => {
      const { entryId } = await listing('tht', { artistNames: [] });

      expect((await create({ catalogEntryId: entryId }).expect(422)).body).toMatchObject({
        code: 'ARTIST_UNREAD',
      });

      const product = await created({ catalogEntryId: entryId, artistName: 'Various Artists' });

      expect(product.artist.name).toBe('Various Artists');
    });

    it('refuses an artist id that names no artist', async () => {
      const { entryId, offer } = await listing('tht');

      await create({ catalogEntryId: entryId, artistId: randomUUID() }).expect(404);
      expect(await prisma.offer.count({ where: { externalId: offer.externalId } })).toBe(0);
    });

    it('refuses a listing that isn’t in the catalog, and a body that isn’t one', async () => {
      await create({ catalogEntryId: randomUUID() }).expect(404);
      await create({ catalogEntryId: 'not-a-uuid' }).expect(400);
      await create({}).expect(400);
    });

    it('refuses a shop no adapter reads yet', async () => {
      const { entryId } = await listing('candlelight');

      expect((await create({ catalogEntryId: entryId }).expect(422)).body).toMatchObject({
        code: 'SHOP_NOT_SUPPORTED',
      });
      expect(fetched).toEqual([]);
    });

    it('says why when the shop’s page can’t be read, and makes nothing', async () => {
      const { entryId, url, offer } = await listing('tht');
      pages.set(url, new ShopFetchError('failed', 'answered 503', true));

      const response = await create({ catalogEntryId: entryId }).expect(502);

      expect(response.body).toMatchObject({ code: 'SHOP_PAGE_UNREADABLE', reason: 'answered 503' });
      expect(await prisma.offer.count({ where: { externalId: offer.externalId } })).toBe(0);
      expect(await prisma.artist.count()).toBe(0);
    });
  });

  describe('refreshing a record', () => {
    /** A record with an offer at THT and one at Cosmic. */
    const tracked = async () => {
      const tht = await listing('tht');
      const product = await created({ catalogEntryId: tht.entryId });
      const cosmic = await listing('cosmic');
      const cosmicOffer = await prisma.offer.create({
        data: {
          productId: product.id,
          supplier: 'cosmic',
          externalId: cosmic.offer.externalId,
          url: cosmic.url,
          sourceTitle: cosmic.offer.sourceTitle,
          priceCents: 160_000,
          availability: 'in_stock',
          stockQty: null,
          lastCheckedAt: new Date('2026-11-01T00:00:00Z'),
        },
      });
      pages.set(cosmic.url, { ...cosmic.offer, priceCents: 160_000, stockQty: null });
      return {
        product,
        tht,
        cosmic,
        thtOfferId: product.offers[0].id,
        cosmicOfferId: cosmicOffer.id,
      };
    };

    it('reads every offer again; history only where something changed', async () => {
      const { product, tht, cosmic, thtOfferId, cosmicOfferId } = await tracked();
      pages.set(tht.url, { ...tht.offer, priceCents: 130_000, stockQty: 1 });
      fetched.length = 0;

      const response = await refresh(product.id).expect(200);
      const refreshed = response.body as ProductWithOffers;

      expect(fetched).toEqual([tht.url, cosmic.url]);
      expect(refreshed.offers.map((offer) => [offer.supplier, offer.priceCents])).toEqual([
        ['tht', 130_000],
        ['cosmic', 160_000],
      ]);
      expect((await snapshotsOf(thtOfferId)).map((snapshot) => snapshot.priceCents)).toEqual([
        150_000, 130_000,
      ]);
      // Cosmic said the same as before: no snapshot, but checked now.
      expect(await snapshotsOf(cosmicOfferId)).toEqual([]);
      expect(new Date(refreshed.offers[1].lastCheckedAt).getTime()).toBeGreaterThan(
        new Date('2026-11-01T00:00:00Z').getTime(),
      );
    });

    it('a date or availability moving is a change too', async () => {
      const { product, tht, thtOfferId } = await tracked();
      pages.set(tht.url, { ...tht.offer, availability: 'pre_order', expectedAt: '2027-01-15' });

      await refresh(product.id).expect(200);

      expect(await snapshotsOf(thtOfferId)).toEqual([
        expect.anything(),
        expect.objectContaining({
          availability: 'pre_order',
          expectedAt: new Date('2027-01-15T00:00:00Z'),
        }),
      ]);
    });

    it('a shop that fails keeps its last good values and says why; the others still refresh', async () => {
      const { product, tht, cosmic } = await tracked();
      pages.set(tht.url, new ShopFetchError('failed', 'answered 404'));
      pages.set(cosmic.url, { ...cosmic.offer, priceCents: 155_000, stockQty: null });

      const refreshed = (await refresh(product.id).expect(200)).body as ProductWithOffers;

      expect(refreshed.offers[0]).toMatchObject({
        priceCents: 150_000,
        stockQty: 3,
        lastError: 'answered 404',
      });
      expect(refreshed.offers[0].lastErrorAt).not.toBeNull();
      expect(refreshed.offers[1]).toMatchObject({ priceCents: 155_000, lastError: null });
    });

    it('a later read that succeeds clears the error', async () => {
      const { product, tht } = await tracked();
      pages.set(tht.url, new ShopFetchError('failed', 'timed out', true));
      await refresh(product.id).expect(200);
      pages.set(tht.url, tht.offer);

      const refreshed = (await refresh(product.id).expect(200)).body as ProductWithOffers;

      expect(refreshed.offers[0]).toMatchObject({ lastError: null, lastErrorAt: null });
    });

    it('404 for a record that isn’t there', async () => {
      await refresh(randomUUID()).expect(404);
    });
  });

  describe('candidates at the other shops', () => {
    const candidatesOf = async (productId: string) =>
      (await server().get(`/admin/products/${productId}/candidates`).set(auth(admin)).expect(200))
        .body as CatalogSearchHit[];

    /** A catalog listing only: a candidate, not yet anything's offer. */
    const listed = (supplier: Supplier, sourceTitle: string, flags: Partial<ParsedOffer> = {}) =>
      listing(supplier, { sourceTitle, ...flags });

    it('finds the record by the artist, best album title first, at the shops it isn’t at', async () => {
      const { entryId } = await listing('tht', {
        sourceTitle: '坂本龍一 Ryuichi Sakamoto - async 2LP',
        title: 'async',
      });
      const product = await created({ catalogEntryId: entryId });
      await listed('cosmic', '坂本龍一 RYUICHI SAKAMOTO - Async（黑膠唱片 2LP）');
      await listed('cosmic', '坂本龍一 Ryuichi Sakamoto - To the Moon and Back（黑膠唱片 LP）');
      await listed('rotten_blues', '【日版黑膠】坂本龍一《async》雙片黑膠唱片 180克重量盤');
      // Another artist's record, with the same album title.
      await listed('cosmic', 'Somebody Else - Async LP');
      // At THT, which has the record already.
      await listed('tht', '坂本龍一 Ryuichi Sakamoto - async (Remodels) 2LP');

      const candidates = await candidatesOf(product.id);

      expect(candidates.map((hit) => [hit.supplier, hit.title])).toEqual([
        ['cosmic', '坂本龍一 RYUICHI SAKAMOTO - Async（黑膠唱片 2LP）'],
        ['cosmic', '坂本龍一 Ryuichi Sakamoto - To the Moon and Back（黑膠唱片 LP）'],
        ['rotten_blues', '【日版黑膠】坂本龍一《async》雙片黑膠唱片 180克重量盤'],
      ]);
      expect(candidates[0].score).toBe(1);
      expect(candidates[1].score).toBeLessThan(0.5);
    });

    it('finds a listing that names the artist only in another script, by an alias', async () => {
      const { entryId } = await listing('rotten_blues', {
        sourceTitle: '【日版黑膠】坂本龍一《1996》',
        title: '1996',
        artistNames: ['坂本龍一'],
      });
      const product = await created({ catalogEntryId: entryId });
      await prisma.artistAlias.create({
        data: {
          artistId: product.artist.id,
          name: 'Ryuichi Sakamoto',
          normalized: normalizeName('Ryuichi Sakamoto'),
        },
      });
      await listed('cosmic', 'Ryuichi Sakamoto - 1996 (黑膠唱片LP)');

      expect((await candidatesOf(product.id)).map((hit) => hit.title)).toEqual([
        'Ryuichi Sakamoto - 1996 (黑膠唱片LP)',
      ]);
    });

    it('leaves out listings tracked under another record, used records and other goods', async () => {
      const { entryId } = await listing('tht', { title: '1996' });
      const product = await created({ catalogEntryId: entryId });
      // The same record at Cosmic, but tracked under a record of its own.
      const elsewhere = await listing('cosmic', { title: '1996' });
      await created({ catalogEntryId: elsewhere.entryId });
      const used = await listed('cosmic', '坂本龍一 - 1996 LP (二手)');
      await prisma.catalogEntry.update({ where: { id: used.entryId }, data: { isUsed: true } });
      const cd = await listed('rotten_blues', '坂本龍一 - 1996 CD');
      await prisma.catalogEntry.update({ where: { id: cd.entryId }, data: { isVinyl: false } });

      expect(await candidatesOf(product.id)).toEqual([]);
    });

    it('takes up to five a shop', async () => {
      const { entryId } = await listing('tht', { title: '1996' });
      const product = await created({ catalogEntryId: entryId });
      for (let index = 0; index < 7; index += 1) {
        await listed('cosmic', `坂本龍一 - Record ${index} LP`);
      }

      expect(await candidatesOf(product.id)).toHaveLength(5);
    });

    it('404 for a record that isn’t tracked', async () => {
      await server().get(`/admin/products/${randomUUID()}/candidates`).set(auth(admin)).expect(404);
    });
  });

  describe('attaching offers', () => {
    const attach = (productId: string, body: object) =>
      server().post(`/admin/products/${productId}/offers`).set(auth(admin)).send(body);

    it('attaches a confirmed candidate, and proposes the names its shop wrote', async () => {
      const { entryId } = await listing('tht', { artistNames: ['坂本龍一'] });
      const product = await created({ catalogEntryId: entryId });
      const cosmic = await listing('cosmic', {
        priceCents: 140_000,
        artistNames: ['坂本龍一', 'RYUICHI SAKAMOTO'],
      });

      const response = await attach(product.id, { catalogEntryId: cosmic.entryId }).expect(201);
      const result = response.body as AttachOfferResult;

      expect(attachOfferResultSchema.parse(result)).toEqual(result);
      expect(result.product.offers.map((offer) => [offer.supplier, offer.priceCents])).toEqual([
        ['tht', 150_000],
        ['cosmic', 140_000],
      ]);
      expect(result.proposedAliases).toEqual(['RYUICHI SAKAMOTO']);
      // Proposed, not added.
      expect(await aliasesOf(product.artist.id)).toEqual(['坂本龍一']);
      expect(await snapshotsOf(result.product.offers[1].id)).toHaveLength(1);
    });

    it('attaches a pasted link, the shop known by its host', async () => {
      const { entryId } = await listing('tht');
      const product = await created({ catalogEntryId: entryId });
      // A listing the catalog hasn't copied yet: only the shop's page has it.
      const url = `https://${hostOf('rotten_blues')}/products/new-arrival`;
      pages.set(url, { ...(await listing('rotten_blues')).offer, externalId: 'new-arrival', url });

      const result = (await attach(product.id, { url }).expect(201)).body as AttachOfferResult;

      expect(result.product.offers.map((offer) => offer.externalId)).toContain('new-arrival');
    });

    it('refuses a link to no shop it reads, and a body with both or neither', async () => {
      const { entryId } = await listing('tht');
      const product = await created({ catalogEntryId: entryId });

      expect(
        (await attach(product.id, { url: 'https://www.elsewhere.test/products/x' }).expect(422))
          .body,
      ).toMatchObject({ code: 'SHOP_NOT_SUPPORTED' });
      await attach(product.id, {}).expect(400);
      await attach(product.id, {
        catalogEntryId: randomUUID(),
        url: `https://${hostOf('tht')}/products/x`,
      }).expect(400);
      await attach(product.id, { url: `http://${hostOf('tht')}/products/x` }).expect(400);
    });

    it('refuses a listing tracked already, by this record or another', async () => {
      const first = await listing('tht');
      const product = await created({ catalogEntryId: first.entryId });

      expect(
        (await attach(product.id, { catalogEntryId: first.entryId }).expect(409)).body,
      ).toMatchObject({ code: 'OFFER_ALREADY_TRACKED', productId: product.id });
      expect((await attach(product.id, { url: first.url }).expect(409)).body).toMatchObject({
        code: 'OFFER_ALREADY_TRACKED',
      });
    });

    it('says why when the page can’t be read, and attaches nothing', async () => {
      const { entryId } = await listing('tht');
      const product = await created({ catalogEntryId: entryId });
      const cosmic = await listing('cosmic');
      pages.set(cosmic.url, new ShopFetchError('failed', 'answered 503', true));

      await attach(product.id, { catalogEntryId: cosmic.entryId }).expect(502);
      expect(await prisma.offer.count({ where: { productId: product.id } })).toBe(1);
    });
  });

  /** The admin's corrections to search's albums (tracker.md §7.3, §5.9). */
  describe('splitting a listing out of its album', () => {
    const split = (catalogEntryId: string, token = admin) =>
      server().post('/admin/album-splits').set(auth(token)).send({ catalogEntryId });

    const putBack = (catalogEntryId: string, token = admin) =>
      server().delete(`/admin/album-splits/${catalogEntryId}`).set(auth(token));

    const offerAt = (url: string) => prisma.offer.findFirstOrThrow({ where: { url } });

    /** A record holding THT's listing and Cosmic's, Cosmic's tracked by a member. */
    const recordOfTwo = async () => {
      const tht = await listing('tht');
      const product = await created({ catalogEntryId: tht.entryId });
      const cosmic = await listing('cosmic', {
        sourceTitle: '坂本龍一 - 1996 (黑膠唱片 LP)',
        priceCents: 140_000,
      });
      await server()
        .post(`/admin/products/${product.id}/offers`)
        .set(auth(admin))
        .send({ catalogEntryId: cosmic.entryId })
        .expect(201);
      const cosmicOffer = await offerAt(cosmic.url);
      const member = await prisma.user.create({
        data: { email: `member-${randomUUID()}@test.local`, passwordHash: 'unused' },
      });
      await prisma.offerWatch.create({ data: { userId: member.id, offerId: cosmicOffer.id } });
      return { product, tht, cosmic, cosmicOffer, memberId: member.id };
    };

    it('moves its offer to a record of its own, with its history and its trackers', async () => {
      const { product, cosmic, cosmicOffer, memberId } = await recordOfTwo();

      await split(cosmic.entryId).expect(204);

      const moved = await prisma.offer.findUniqueOrThrow({
        where: { id: cosmicOffer.id },
        include: { product: true, snapshots: true, watches: true },
      });
      expect(moved.productId).not.toBe(product.id);
      expect(moved.product).toMatchObject({
        title: '1996',
        artistId: product.artist.id,
        format: ['LP'],
      });
      expect(moved.snapshots).toHaveLength(1);
      expect(moved.watches.map((watch) => watch.userId)).toEqual([memberId]);
      // The comparison it was wrongly in no longer lists it.
      const left = (await server().get(`/products/${product.id}/offers`).expect(200))
        .body as ProductWithOffers;
      expect(left.offers.map((offer) => offer.supplier)).toEqual(['tht']);
    });

    it('leaves a record’s only offer where it is', async () => {
      const tht = await listing('tht');
      const product = await created({ catalogEntryId: tht.entryId });

      await split(tht.entryId).expect(204);

      expect((await offerAt(tht.url)).productId).toBe(product.id);
      expect(
        await prisma.albumSplit.findFirstOrThrow({ where: { externalId: tht.offer.externalId } }),
      ).toMatchObject({ fromProductId: null });
    });

    it('puts it back: its offer goes home, and its own record goes', async () => {
      const { product, cosmic, cosmicOffer } = await recordOfTwo();
      await split(cosmic.entryId).expect(204);
      const own = (await offerAt(cosmic.url)).productId;

      await putBack(cosmic.entryId).expect(204);

      expect((await offerAt(cosmic.url)).productId).toBe(product.id);
      expect(await prisma.product.findUnique({ where: { id: own } })).toBeNull();
      expect(
        await prisma.albumSplit.count({ where: { externalId: cosmic.offer.externalId } }),
      ).toBe(0);
      expect(await prisma.offerWatch.count({ where: { offerId: cosmicOffer.id } })).toBe(1);
    });

    /** Its own record holds another listing since: moving it would leave that alone. */
    it('puts back without moving an offer whose record holds more now', async () => {
      const { cosmic } = await recordOfTwo();
      await split(cosmic.entryId).expect(204);
      const own = (await offerAt(cosmic.url)).productId;
      const other = await listing('rotten_blues');
      await server()
        .post(`/admin/products/${own}/offers`)
        .set(auth(admin))
        .send({ catalogEntryId: other.entryId })
        .expect(201);

      await putBack(cosmic.entryId).expect(204);

      expect((await offerAt(cosmic.url)).productId).toBe(own);
    });

    it('is no error twice over, and 404s a listing that isn’t there', async () => {
      const { product, cosmic } = await recordOfTwo();

      await split(cosmic.entryId).expect(204);
      const own = (await offerAt(cosmic.url)).productId;
      await split(cosmic.entryId).expect(204);
      expect((await offerAt(cosmic.url)).productId).toBe(own);

      await putBack(cosmic.entryId).expect(204);
      await putBack(cosmic.entryId).expect(204);
      expect((await offerAt(cosmic.url)).productId).toBe(product.id);

      await split(randomUUID()).expect(404);
      await putBack(randomUUID()).expect(404);
    });

    it('is the admin’s alone', async () => {
      const { entryId } = await listing('tht');
      const customer = await createUser('customer');

      await split(entryId, customer).expect(403);
      await putBack(entryId, customer).expect(403);
      await server().post('/admin/album-splits').send({ catalogEntryId: entryId }).expect(401);
      expect(await prisma.albumSplit.count()).toBe(0);
    });

    /** A page open since before the split still sends the old album. */
    it('keeps tracking from attaching a split listing, or a split one’s companions', async () => {
      const tht = await listing('tht');
      const cosmic = await listing('cosmic');
      const rottenBlues = await listing('rotten_blues');
      const member = await createUser('customer');
      await split(cosmic.entryId).expect(204);
      const shopsTracked = async (catalogEntryId: string, catalogEntryIds: string[]) => {
        const response = await server()
          .post('/watches')
          .set(auth(member))
          .send({ catalogEntryId, catalogEntryIds })
          .expect(201);
        return (response.body as TrackListingResult).product.offers.map((offer) => offer.supplier);
      };

      expect(await shopsTracked(tht.entryId, [tht.entryId, cosmic.entryId])).toEqual(['tht']);
      expect(await shopsTracked(cosmic.entryId, [cosmic.entryId, rottenBlues.entryId])).toEqual([
        'cosmic',
      ]);
    });
  });

  describe("editing an artist's names", () => {
    const update = (artistId: string, body: object, token = admin) =>
      server().patch(`/admin/artists/${artistId}`).set(auth(token)).send(body);

    const updated = async (artistId: string, body: object) =>
      (await update(artistId, body).expect(200)).body as Artist;

    /** Names created together share a timestamp: compared in any order. */
    const namesOf = (artist: Artist) => artist.aliases.map((alias) => alias.name).sort();
    const sorted = (names: string[]) => [...names].sort();

    it('a record’s artist comes with every name, the shared shape', async () => {
      const { entryId } = await listing('tht');

      const product = await created({ catalogEntryId: entryId });

      expect(artistSchema.parse(product.artist)).toEqual(product.artist);
      expect(namesOf(product.artist)).toEqual(sorted(['坂本龍一', 'Ryuichi Sakamoto']));
    });

    it('keeps a proposed name, once however it is written', async () => {
      const artist = await artistNamed('坂本龍一');

      const result = await updated(artist.id, {
        addAliases: ['RYUICHI SAKAMOTO', 'Ryuichi Sakamoto', '坂本龍一'],
      });

      expect(namesOf(result)).toEqual(sorted(['坂本龍一', 'RYUICHI SAKAMOTO']));
    });

    it('renames: the new name becomes an alias, and its records follow', async () => {
      const { entryId } = await listing('tht', { artistNames: ['坂本龍一'] });
      const product = await created({ catalogEntryId: entryId });

      const result = await updated(product.artist.id, { name: 'Ryuichi Sakamoto' });

      expect(result.name).toBe('Ryuichi Sakamoto');
      expect(namesOf(result)).toEqual(sorted(['坂本龍一', 'Ryuichi Sakamoto']));
    });

    it('removes a wrong name', async () => {
      const artist = await artistNamed('坂本龍一', ['坂本龍一', 'Somebody Else']);
      const wrong = artist.aliases.find((alias) => alias.name === 'Somebody Else');

      const result = await updated(artist.id, { removeAliasIds: [wrong!.id] });

      expect(namesOf(result)).toEqual(sorted(['坂本龍一']));
    });

    it('swaps a spelling in one request: the removal goes first', async () => {
      const artist = await artistNamed('坂本龍一', ['坂本龍一', 'ryuichi sakamoto']);
      const lower = artist.aliases.find((alias) => alias.name === 'ryuichi sakamoto');

      const result = await updated(artist.id, {
        removeAliasIds: [lower!.id],
        addAliases: ['Ryuichi Sakamoto'],
      });

      expect(namesOf(result)).toEqual(sorted(['坂本龍一', 'Ryuichi Sakamoto']));
    });

    it('won’t remove the name’s own alias, but will once renamed', async () => {
      const artist = await artistNamed('坂本龍一', ['坂本龍一', 'Ryuichi Sakamoto']);
      const own = artist.aliases.find((alias) => alias.name === '坂本龍一');

      expect(
        (await update(artist.id, { removeAliasIds: [own!.id] }).expect(422)).body,
      ).toMatchObject({ code: 'ARTIST_NAME_ALIAS' });
      expect(
        namesOf(await updated(artist.id, { name: 'Ryuichi Sakamoto', removeAliasIds: [own!.id] })),
      ).toEqual(sorted(['Ryuichi Sakamoto']));
    });

    it('404s another artist’s alias, and an artist that isn’t there; changes nothing', async () => {
      const artist = await artistNamed('坂本龍一');
      const other = await artistNamed('細野晴臣');

      await update(artist.id, {
        removeAliasIds: [other.aliases[0].id],
        addAliases: ['Ryuichi Sakamoto'],
      }).expect(404);
      expect(await aliasesOf(artist.id)).toEqual(['坂本龍一']);
      await update(randomUUID(), { name: 'Anyone' }).expect(404);
    });

    it('refuses a body with nothing to change, or a name with no letters', async () => {
      const artist = await artistNamed('坂本龍一');

      await update(artist.id, {}).expect(400);
      await update(artist.id, { addAliases: [] }).expect(400);
      await update(artist.id, { name: '  ' }).expect(400);
      await update(artist.id, { addAliases: ['！！'] }).expect(400);
    });

    it('refuses anyone not an admin', async () => {
      const artist = await artistNamed('坂本龍一');
      const customer = await createUser('customer');

      await server().patch(`/admin/artists/${artist.id}`).send({ name: 'X' }).expect(401);
      await update(artist.id, { name: 'X' }, customer).expect(403);
    });
  });

  describe('tracking a listing', () => {
    const track = (token: string, body: object) =>
      server().post('/watches').set(auth(token)).send(body);

    const tracked = async (token: string, body: object) =>
      (await track(token, body).expect(201)).body as TrackListingResult;

    const watchesOf = async (token: string) =>
      (await server().get('/watches').set(auth(token)).expect(200)).body as WatchedOffer[];

    /** An album at THT, standard and red, and at Cosmic. */
    const album = async () => {
      const thtStandard = await listing('tht', { priceCents: 150_000 });
      const cosmic = await listing('cosmic', { priceCents: 140_000 });
      const thtRed = await listing('tht', {
        priceCents: 180_000,
        sourceTitle: '坂本龍一 Ryuichi Sakamoto - 1996 LP (Red Vinyl)',
      });
      return {
        thtStandard,
        cosmic,
        thtRed,
        ids: [thtStandard.entryId, cosmic.entryId, thtRed.entryId],
      };
    };

    it('tracks the one version picked; the record holds the whole album', async () => {
      const member = await createUser('customer');
      const { thtRed, ids } = await album();

      const result = await tracked(member, {
        catalogEntryId: thtRed.entryId,
        catalogEntryIds: ids,
      });

      expect(trackListingResultSchema.parse(result)).toEqual(result);
      // Made from the version picked, then the rest attached.
      expect(result.product.offers.map((offer) => [offer.supplier, offer.priceCents])).toEqual([
        ['tht', 180_000],
        ['tht', 150_000],
        ['cosmic', 140_000],
      ]);
      expect(result.offerId).toBe(result.product.offers[0].id);
      expect(result.skipped).toEqual([]);

      const watches = await watchesOf(member);
      expect(watches).toHaveLength(1);
      expect(watchedOfferSchema.parse(watches[0])).toEqual(watches[0]);
      expect(watches[0]).toMatchObject({
        offerId: result.offerId,
        productId: result.product.id,
        title: '1996',
        artist: '坂本龍一',
        sourceTitle: '坂本龍一 Ryuichi Sakamoto - 1996 LP (Red Vinyl)',
        supplier: 'tht',
        priceCents: 180_000,
        cheaperElsewhere: { supplier: 'cosmic', priceCents: 140_000, currency: 'TWD' },
      });
    });

    it('another version of an album held already: the same record, a list of one’s own', async () => {
      const [first, second] = [await createUser('customer'), await createUser('customer')];
      const { thtStandard, cosmic, ids } = await album();
      const theirs = await tracked(first, {
        catalogEntryId: thtStandard.entryId,
        catalogEntryIds: ids,
      });
      fetched.length = 0;

      const mine = await tracked(second, { catalogEntryId: cosmic.entryId, catalogEntryIds: ids });

      expect(mine.product.id).toBe(theirs.product.id);
      expect(fetched).toEqual([]);
      expect((await watchesOf(first)).map((watch) => watch.supplier)).toEqual(['tht']);
      expect((await watchesOf(second)).map((watch) => watch.supplier)).toEqual(['cosmic']);
    });

    it('a version a record lacks is added when anyone tracks the album', async () => {
      const [first, second] = [await createUser('customer'), await createUser('customer')];
      const { thtStandard, thtRed } = await album();
      const before = await tracked(first, {
        catalogEntryId: thtStandard.entryId,
        catalogEntryIds: [thtStandard.entryId],
      });

      const after = await tracked(second, {
        catalogEntryId: thtRed.entryId,
        catalogEntryIds: [thtStandard.entryId, thtRed.entryId],
      });

      expect(after.product.id).toBe(before.product.id);
      expect(after.product.offers.map((offer) => offer.externalId)).toEqual([
        thtStandard.offer.externalId,
        thtRed.offer.externalId,
      ]);
      expect(after.offerId).toBe(after.product.offers[1].id);
    });

    it('skips the album’s other listings another record holds or it can’t read, and says so', async () => {
      const member = await createUser('customer');
      const tht = await listing('tht');
      const cosmic = await listing('cosmic');
      const unreadable = await listing('rotten_blues');
      const recordA = await created({ catalogEntryId: tht.entryId });
      const recordB = await created({ catalogEntryId: cosmic.entryId });
      pages.set(unreadable.url, new ShopFetchError('failed', 'answered 503', true));

      const result = await tracked(member, {
        catalogEntryId: tht.entryId,
        catalogEntryIds: [tht.entryId, cosmic.entryId, unreadable.entryId],
      });

      expect(result.product.id).toBe(recordA.id);
      expect(result.skipped).toEqual([
        { catalogEntryId: cosmic.entryId, reason: 'OFFER_ALREADY_TRACKED' },
        { catalogEntryId: unreadable.entryId, reason: 'SHOP_PAGE_UNREADABLE' },
      ]);
      expect(recordB.offers.map((offer) => offer.supplier)).toEqual(['cosmic']);
    });

    it('the listing tracked must be read: its page failing tracks nothing', async () => {
      const member = await createUser('customer');
      const { thtStandard, cosmic, ids } = await album();
      await tracked(member, {
        catalogEntryId: thtStandard.entryId,
        catalogEntryIds: [thtStandard.entryId],
      });
      pages.set(cosmic.url, new ShopFetchError('failed', 'answered 503', true));

      expect(
        (await track(member, { catalogEntryId: cosmic.entryId, catalogEntryIds: ids }).expect(502))
          .body,
      ).toMatchObject({ code: 'SHOP_PAGE_UNREADABLE' });
      expect((await watchesOf(member)).map((watch) => watch.supplier)).toEqual(['tht']);
    });

    it('asks which artist as creating does, and tracks nothing until told', async () => {
      const member = await createUser('customer');
      await artistNamed('坂本龍一');
      await artistNamed('Ryuichi Sakamoto');
      const tht = await listing('tht');

      expect(
        (
          await track(member, {
            catalogEntryId: tht.entryId,
            catalogEntryIds: [tht.entryId],
          }).expect(409)
        ).body,
      ).toMatchObject({ code: 'ARTIST_AMBIGUOUS' });
      expect(await watchesOf(member)).toEqual([]);
    });

    it('refuses a listing outside its album, an empty album, or one that isn’t there', async () => {
      const member = await createUser('customer');
      const [first, second] = [await listing('tht'), await listing('cosmic')];

      await track(member, {
        catalogEntryId: first.entryId,
        catalogEntryIds: [second.entryId],
      }).expect(400);
      await track(member, { catalogEntryId: first.entryId, catalogEntryIds: [] }).expect(400);
      const missing = randomUUID();
      await track(member, { catalogEntryId: missing, catalogEntryIds: [missing] }).expect(404);
      await server()
        .post('/watches')
        .send({ catalogEntryId: first.entryId, catalogEntryIds: [first.entryId] })
        .expect(401);
    });

    it('stops tracking one listing, as often as asked; each list is its owner’s alone', async () => {
      const [member, other] = [await createUser('customer'), await createUser('customer')];
      const { thtStandard, cosmic, ids } = await album();
      const standard = await tracked(member, {
        catalogEntryId: thtStandard.entryId,
        catalogEntryIds: ids,
      });
      await tracked(member, { catalogEntryId: cosmic.entryId, catalogEntryIds: ids });

      expect(await watchesOf(other)).toEqual([]);
      await server().delete(`/watches/${standard.offerId}`).set(auth(member)).expect(204);
      await server().delete(`/watches/${standard.offerId}`).set(auth(member)).expect(204);
      expect((await watchesOf(member)).map((watch) => watch.supplier)).toEqual(['cosmic']);
      // The record and its offers stay: others may track them.
      expect(await prisma.offer.count({ where: { productId: standard.product.id } })).toBe(3);
    });

    it('cheaper elsewhere counts only what can be bought, and only what is cheaper', async () => {
      const member = await createUser('customer');
      const tht = await listing('tht', { priceCents: 150_000 });
      const cosmic = await listing('cosmic', { priceCents: 90_000, availability: 'sold_out' });

      await tracked(member, {
        catalogEntryId: tht.entryId,
        catalogEntryIds: [tht.entryId, cosmic.entryId],
      });
      expect((await watchesOf(member))[0].cheaperElsewhere).toBeNull();

      pages.set(cosmic.url, { ...cosmic.offer, availability: 'in_stock' });
      await refresh((await watchesOf(member))[0].productId).expect(200);
      expect((await watchesOf(member))[0].cheaperElsewhere).toMatchObject({
        supplier: 'cosmic',
        priceCents: 90_000,
      });
    });
  });

  describe('a record’s comparison', () => {
    const offersOf = (productId: string) => server().get(`/products/${productId}/offers`);

    const memberRefresh = (productId: string, token: string) =>
      server().post(`/products/${productId}/refresh`).set(auth(token));

    /** Every offer of a record read this long ago, as if refreshed then. */
    const readAgo = (productId: string, ms: number) =>
      prisma.offer.updateMany({
        where: { productId },
        data: { lastCheckedAt: new Date(Date.now() - ms), lastErrorAt: null },
      });

    it('anyone reads it: every offer, each with its own cover', async () => {
      const { entryId } = await listing('tht', {
        imageUrl: 'https://cdn.example-shop.test/red.jpg',
      });
      const product = await created({ catalogEntryId: entryId });

      const response = await offersOf(product.id).expect(200);
      const read = response.body as ProductWithOffers;

      expect(productWithOffersSchema.parse(read)).toEqual(read);
      expect(read.offers[0].imageUrl).toBe('https://cdn.example-shop.test/red.jpg');
    });

    it('404 for a record that isn’t there', async () => {
      await offersOf(randomUUID()).expect(404);
    });

    it('a member reads it again at most every ten minutes; a failed read counts', async () => {
      const member = await createUser('customer');
      const { entryId, url, offer } = await listing('tht');
      const product = await created({ catalogEntryId: entryId });

      // Just made: read a moment ago.
      const tooSoon = await memberRefresh(product.id, member).expect(429);
      expect(tooSoon.body).toMatchObject({ code: 'REFRESH_TOO_SOON' });
      expect((tooSoon.body as { retryAfterSeconds: number }).retryAfterSeconds).toBeGreaterThan(
        590,
      );

      await readAgo(product.id, 11 * 60 * 1000);
      pages.set(url, {
        ...offer,
        priceCents: 120_000,
        imageUrl: 'https://cdn.example-shop.test/new.jpg',
      });
      const refreshed = (await memberRefresh(product.id, member).expect(200))
        .body as ProductWithOffers;
      expect(refreshed.offers[0]).toMatchObject({
        priceCents: 120_000,
        imageUrl: 'https://cdn.example-shop.test/new.jpg',
      });

      // A read that failed a minute ago holds it too.
      await readAgo(product.id, 11 * 60 * 1000);
      await prisma.offer.updateMany({
        where: { productId: product.id },
        data: { lastErrorAt: new Date(Date.now() - 60 * 1000) },
      });
      await memberRefresh(product.id, member).expect(429);
    });

    it('refreshing needs a member; the admin’s has no wait', async () => {
      const { entryId } = await listing('tht');
      const product = await created({ catalogEntryId: entryId });

      await server().post(`/products/${product.id}/refresh`).expect(401);
      await refresh(product.id).expect(200);
    });

    it('a member tracks a version from it, and stops', async () => {
      const member = await createUser('customer');
      const { entryId } = await listing('tht');
      const product = await created({ catalogEntryId: entryId });
      const [offer] = product.offers;
      const watched = async () =>
        ((await server().get('/watches').set(auth(member)).expect(200)).body as WatchedOffer[]).map(
          (watch) => watch.offerId,
        );

      await server().put(`/watches/${offer.id}`).set(auth(member)).expect(204);
      await server().put(`/watches/${offer.id}`).set(auth(member)).expect(204);
      expect(await watched()).toEqual([offer.id]);

      await server().delete(`/watches/${offer.id}`).set(auth(member)).expect(204);
      expect(await watched()).toEqual([]);
      await server().put(`/watches/${randomUUID()}`).set(auth(member)).expect(404);
      await server().put(`/watches/${offer.id}`).expect(401);
    });
  });

  describe('price drops', () => {
    const track = async (token: string, body: object) =>
      (await server().post('/watches').set(auth(token)).send(body).expect(201))
        .body as TrackListingResult;

    const notificationsOf = async (token: string, query = '') =>
      (await server().get(`/notifications${query}`).set(auth(token)).expect(200))
        .body as Connection<Notification>;

    const unreadOf = async (token: string) =>
      (
        (await server().get('/notifications/unread-count').set(auth(token)).expect(200))
          .body as UnreadCount
      ).count;

    const pricesOf = async (token: string) =>
      (await notificationsOf(token)).edges.map(({ node }) => [
        node.fromPriceCents,
        node.toPriceCents,
      ]);

    /**
     * One album at THT and Cosmic: a member tracking THT's, another
     * Cosmic's, and a third tracking nothing.
     */
    const album = async () => {
      const tht = await listing('tht', { priceCents: 150_000 });
      const cosmic = await listing('cosmic', { priceCents: 140_000 });
      const ids = [tht.entryId, cosmic.entryId];
      const thtMember = await createUser('customer');
      const cosmicMember = await createUser('customer');
      const bystander = await createUser('customer');
      const { product } = await track(thtMember, {
        catalogEntryId: tht.entryId,
        catalogEntryIds: ids,
      });
      await track(cosmicMember, { catalogEntryId: cosmic.entryId, catalogEntryIds: ids });
      return { tht, cosmic, productId: product.id, thtMember, cosmicMember, bystander };
    };

    it('tells each member tracking that version, with both prices, and no one else', async () => {
      const { tht, productId, thtMember, cosmicMember, bystander } = await album();
      const secondThtMember = await createUser('customer');
      const thtOffer = await prisma.offer.findUniqueOrThrow({
        where: { supplier_externalId: { supplier: 'tht', externalId: tht.offer.externalId } },
      });
      await server().put(`/watches/${thtOffer.id}`).set(auth(secondThtMember)).expect(204);
      pages.set(tht.url, { ...tht.offer, priceCents: 135_000 });

      await refresh(productId).expect(200);

      for (const member of [thtMember, secondThtMember]) {
        const [notification] = (await notificationsOf(member)).edges.map(({ node }) => node);
        expect(notificationSchema.parse(notification)).toEqual(notification);
        expect(notification).toMatchObject({
          kind: 'price_drop',
          offerId: thtOffer.id,
          productId,
          title: '1996',
          supplier: 'tht',
          sourceTitle: tht.offer.sourceTitle,
          fromPriceCents: 150_000,
          toPriceCents: 135_000,
          currency: 'TWD',
          readAt: null,
        });
      }
      // Another version of the album, and nothing tracked: no one told.
      expect(await pricesOf(cosmicMember)).toEqual([]);
      expect(await pricesOf(bystander)).toEqual([]);
    });

    it('the same price, a rise or a failed read tells no one; another drop tells again', async () => {
      const { tht, productId, thtMember } = await album();

      await refresh(productId).expect(200);
      pages.set(tht.url, { ...tht.offer, priceCents: 160_000 });
      await refresh(productId).expect(200);
      pages.set(tht.url, new ShopFetchError('failed', 'answered 404'));
      await refresh(productId).expect(200);
      expect(await pricesOf(thtMember)).toEqual([]);

      pages.set(tht.url, { ...tht.offer, priceCents: 140_000 });
      await refresh(productId).expect(200);
      pages.set(tht.url, { ...tht.offer, priceCents: 150_000 });
      await refresh(productId).expect(200);
      pages.set(tht.url, { ...tht.offer, priceCents: 120_000 });
      await refresh(productId).expect(200);

      // Newest first, each from the price before it.
      expect(await pricesOf(thtMember)).toEqual([
        [150_000, 120_000],
        [160_000, 140_000],
      ]);
    });

    it('counts my unread, marks them read, and keeps them after I stop tracking', async () => {
      const { tht, productId, thtMember } = await album();
      const other = await createUser('customer');
      const thtOffer = await prisma.offer.findUniqueOrThrow({
        where: { supplier_externalId: { supplier: 'tht', externalId: tht.offer.externalId } },
      });
      await server().put(`/watches/${thtOffer.id}`).set(auth(other)).expect(204);
      for (const priceCents of [140_000, 150_000, 130_000]) {
        pages.set(tht.url, { ...tht.offer, priceCents });
        await refresh(productId).expect(200);
      }
      expect(await unreadOf(thtMember)).toBe(2);

      await server().post('/notifications/read').set(auth(thtMember)).expect(204);

      expect(await unreadOf(thtMember)).toBe(0);
      expect((await notificationsOf(thtMember)).edges.every(({ node }) => node.readAt)).toBe(true);
      // Read marks are each member's own.
      expect(await unreadOf(other)).toBe(2);

      await server().delete(`/watches/${thtOffer.id}`).set(auth(thtMember)).expect(204);
      expect((await notificationsOf(thtMember)).totalCount).toBe(2);
    });

    it('pages my notifications, newest first', async () => {
      const { tht, productId, thtMember } = await album();
      for (const priceCents of [140_000, 150_000, 130_000, 150_000, 120_000]) {
        pages.set(tht.url, { ...tht.offer, priceCents });
        await refresh(productId).expect(200);
      }

      const first = await notificationsOf(thtMember, '?first=2');
      const next = await notificationsOf(thtMember, `?first=2&after=${first.pageInfo.endCursor}`);

      expect(first.totalCount).toBe(3);
      expect(first.edges.map(({ node }) => node.toPriceCents)).toEqual([120_000, 130_000]);
      expect(next.edges.map(({ node }) => node.toPriceCents)).toEqual([140_000]);
      expect(next.pageInfo.hasNextPage).toBe(false);
    });

    it('is for members only', async () => {
      await server().get('/notifications').expect(401);
      await server().get('/notifications/unread-count').expect(401);
      await server().post('/notifications/read').expect(401);
    });
  });

  describe('what’s popular at the shops', () => {
    const popularNow = async () =>
      (await server().get('/catalog/popular').expect(200)).body as PopularListing[];

    /** A listing on its shop's popular list, as the list pages last read it. */
    const ranked = (
      supplier: Supplier,
      title: string,
      popularRank: number,
      overrides: Partial<{
        availability: 'in_stock' | 'pre_order' | 'sold_out' | null;
        priceCents: number | null;
        isVinyl: boolean;
        isUsed: boolean;
      }> = {},
    ) => {
      const externalId = randomUUID();
      return prisma.catalogEntry.create({
        data: {
          supplier,
          externalId,
          url: `https://${hostOf(supplier)}/products/${externalId}`,
          title,
          searchTitle: searchTitleOf(title),
          imageUrl: null,
          isVinyl: overrides.isVinyl ?? true,
          isUsed: overrides.isUsed ?? false,
          priceCents: overrides.priceCents === undefined ? 150_000 : overrides.priceCents,
          availability: overrides.availability === undefined ? 'in_stock' : overrides.availability,
          syncedAt: new Date(),
          popularRank,
        },
      });
    };

    it('anyone reads it: the shops in turn, new vinyl that can be bought, a search for each', async () => {
      await ranked('tht', 'Coldplay - Parachutes LP', 1);
      // Not shown: sold out, never read, used, not a record.
      await ranked('tht', 'Sold Out - Gone LP', 2, { availability: 'sold_out' });
      await ranked('tht', 'Unread - Never LP', 3, { availability: null, priceCents: null });
      await ranked('tht', 'Used - Second Hand LP (二手)', 4, { isUsed: true });
      await ranked('tht', 'Oasis - Some Might Say 7"', 5);
      await ranked('cosmic', 'A Book - Words', 1, { isVinyl: false });
      await ranked('cosmic', '米津玄師 - LOST CORNER（黑膠唱片 LP）', 2, {
        availability: 'pre_order',
      });
      // Not on a list.
      await listing('tht');

      const listings = await popularNow();

      for (const each of listings) expect(popularListingSchema.parse(each)).toEqual(each);
      // Each shop's first shown, then each one's second.
      expect(listings.map((each) => [each.supplier, each.title])).toEqual([
        ['tht', 'Coldplay - Parachutes LP'],
        ['cosmic', '米津玄師 - LOST CORNER（黑膠唱片 LP）'],
        ['tht', 'Oasis - Some Might Say 7"'],
      ]);
      expect(listings[0]).toMatchObject({
        priceCents: 150_000,
        currency: 'TWD',
        availability: 'in_stock',
        searchQuery: 'Coldplay Parachutes',
        rank: 1,
      });
      expect(listings[1]).toMatchObject({ availability: 'pre_order', rank: 2 });
    });

    it('a dozen at most', async () => {
      for (let rank = 1; rank <= 15; rank += 1)
        await ranked('tht', `Artist - Album ${rank} LP`, rank);

      expect(await popularNow()).toHaveLength(12);
    });

    it('says nothing of what anyone tracks', async () => {
      const { entryId } = await listing('tht');
      await prisma.catalogEntry.update({
        where: { id: entryId },
        data: { availability: 'in_stock', priceCents: 150_000, popularRank: 1 },
      });
      await created({ catalogEntryId: entryId });

      const [listed] = await popularNow();

      expect(Object.keys(listed).sort()).toEqual(
        [
          'availability',
          'currency',
          'id',
          'imageUrl',
          'priceCents',
          'rank',
          'searchQuery',
          'supplier',
          'title',
          'url',
        ].sort(),
      );
    });
  });
});
