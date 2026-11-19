import { randomUUID } from 'node:crypto';

import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import {
  type AttachOfferResult,
  attachOfferResultSchema,
  type CatalogSearchHit,
  type ProductWithOffers,
  productWithOffersSchema,
  type Supplier,
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
    // Tracked records (offers and snapshots cascade), then artists: an artist
    // left by another test would own the names these tests resolve.
    await prisma.product.deleteMany({ where: { artistId: { not: null } } });
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
      // The demo store's columns, filled until step 5.
      expect(await prisma.product.findUniqueOrThrow({ where: { id: product.id } })).toMatchObject({
        artist: '坂本龍一',
        priceCents: 150_000,
        currency: 'TWD',
        stock: 0,
      });
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

      expect(product.artist).toEqual({ id: known.id, name: '坂本龍一' });
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
      // The demo store's price follows the first offer.
      expect(
        (await prisma.product.findUniqueOrThrow({ where: { id: product.id } })).priceCents,
      ).toBe(130_000);
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

    it('404 for a record that isn’t tracked, or isn’t there', async () => {
      const demo = await prisma.product.create({
        data: { title: 'Demo', artist: 'Demo Artist', priceCents: 100_000 },
      });

      await refresh(demo.id).expect(404);
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

  describe('attaching and detaching offers', () => {
    const attach = (productId: string, body: object) =>
      server().post(`/admin/products/${productId}/offers`).set(auth(admin)).send(body);

    const detach = (offerId: string) =>
      server().delete(`/admin/offers/${offerId}`).set(auth(admin));

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

    it('detaches a wrong match, its history with it, and the demo price follows', async () => {
      const { entryId } = await listing('tht');
      const product = await created({ catalogEntryId: entryId });
      const cosmic = await listing('cosmic', { priceCents: 140_000 });
      const attached = (await attach(product.id, { catalogEntryId: cosmic.entryId }).expect(201))
        .body as AttachOfferResult;
      const [thtOffer, cosmicOffer] = attached.product.offers;

      await detach(cosmicOffer.id).expect(204);
      expect(await prisma.offer.findUnique({ where: { id: cosmicOffer.id } })).toBeNull();
      expect(await snapshotsOf(cosmicOffer.id)).toEqual([]);

      // With the first one gone, the demo store's price is the next one's.
      await attach(product.id, { catalogEntryId: cosmic.entryId }).expect(201);
      await detach(thtOffer.id).expect(204);
      expect(
        (await prisma.product.findUniqueOrThrow({ where: { id: product.id } })).priceCents,
      ).toBe(140_000);
    });

    it('keeps a record’s last offer, and 404s an offer that isn’t there', async () => {
      const { entryId } = await listing('tht');
      const product = await created({ catalogEntryId: entryId });

      expect((await detach(product.offers[0].id).expect(409)).body).toMatchObject({
        code: 'LAST_OFFER',
      });
      await detach(randomUUID()).expect(404);
    });
  });
});
