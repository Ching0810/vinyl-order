import { randomUUID } from 'node:crypto';

import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { Availability, Connection, Product } from '@vinyl-order/shared';
import request from 'supertest';
import { App } from 'supertest/types';

import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * GET /products paging, through the shared cursor helper in common/pagination;
 * and what a record reads as, now its price is its offers' (tracker.md §8).
 *
 * The catalogue is shared by every spec in the run, so each test's records
 * are dated where no other spec's are — centuries ahead, at the newest end,
 * or behind, at the oldest — and it pages only the end it owns. The suite
 * resets the database and runs one spec at a time, so a run's dates are its
 * own.
 */
describe('Products (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await app.close();
  });

  /** Minutes into a year, so each test owns its span and "newer" is unambiguous. */
  const at = (year: number, minutes: number) => new Date(Date.UTC(year, 0, 1, 0, minutes));

  /** One record per timestamp; their ids newest first, as the catalogue orders. */
  const createRecords = async (createdAts: Date[]) => {
    const artist = await prisma.artist.create({ data: { name: 'Test Artist' } });
    const products: { id: string; createdAt: Date }[] = [];
    for (const createdAt of createdAts) {
      products.push(
        await prisma.product.create({
          data: { title: `Album ${randomUUID()}`, artistId: artist.id, createdAt },
        }),
      );
    }
    // The catalogue order: newest first, id breaking ties.
    return [...products]
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime() || (a.id < b.id ? 1 : -1))
      .map((product) => product.id);
  };

  const listPage = async (query: string) =>
    (await request(app.getHttpServer()).get(`/products?${query}`).expect(200))
      .body as Connection<Product>;

  const idsOf = (page: Connection<Product>) => page.edges.map((edge) => edge.node.id);

  it('pages forward and backward over the newest records exactly once', async () => {
    // Two share a timestamp, so a page boundary falls between a tie.
    const newestFirst = await createRecords([
      at(3001, 1),
      at(3001, 2),
      at(3001, 2),
      at(3001, 3),
      at(3001, 4),
    ]);
    // Older than all of them: where the walk back starts.
    await createRecords([at(2026, 0)]);

    const forward: Connection<Product>['edges'] = [];
    let after = '';
    while (forward.length <= newestFirst.length) {
      const page = await listPage(`first=2${after && `&after=${after}`}`);
      forward.push(...page.edges);
      after = page.pageInfo.endCursor ?? '';
    }
    expect(forward.slice(0, newestFirst.length).map((edge) => edge.node.id)).toEqual(newestFirst);

    // Back from the first record that isn't one of them, to the start.
    const backward: string[] = [];
    let before = forward[newestFirst.length].cursor;
    let hasPreviousPage = true;
    while (hasPreviousPage) {
      const page = await listPage(`last=2&before=${before}`);
      backward.unshift(...idsOf(page));
      ({ hasPreviousPage } = page.pageInfo);
      before = page.pageInfo.startCursor ?? '';
    }
    expect(backward).toEqual(newestFirst);
  });

  it('counts the whole catalogue on every page, not just the page', async () => {
    await createRecords([at(3002, 1), at(3002, 2), at(3002, 3)]);
    const total = await prisma.product.count();

    const first = await listPage('first=2');
    const next = await listPage(`first=2&after=${first.pageInfo.endCursor}`);

    expect(first.totalCount).toBe(total);
    expect(next.totalCount).toBe(total);
  });

  /**
   * What the Last page button asks for: `last` sized to what is left over,
   * with no cursor — the oldest records.
   */
  it('serves the final page from `last` with no cursor', async () => {
    const newestFirst = await createRecords([
      at(1001, 1),
      at(1001, 2),
      at(1001, 3),
      at(1001, 4),
      at(1001, 5),
    ]);

    const page = await listPage('last=1');

    expect(idsOf(page)).toEqual(newestFirst.slice(-1));
    expect(page.pageInfo).toMatchObject({ hasNextPage: false, hasPreviousPage: true });

    // Stepping back from it lands on whole pages again.
    const previous = await listPage(`last=2&before=${page.pageInfo.startCursor}`);
    expect(idsOf(previous)).toEqual(newestFirst.slice(2, 4));
  });

  it('falls back to the default page size for a missing or unparseable size', async () => {
    const newestFirst = await createRecords(Array.from({ length: 12 }, (_, i) => at(3003, i + 1)));

    for (const query of ['', 'first=abc']) {
      const page = await listPage(query);
      expect(idsOf(page)).toEqual(newestFirst.slice(0, 10));
      expect(page.pageInfo.hasNextPage).toBe(true);
    }
  });

  describe('a record as the catalogue reads it', () => {
    /** A record, and an offer per given shop price and availability. */
    const createRecord = async (offers: { priceCents: number; availability: Availability }[]) =>
      prisma.product.create({
        data: {
          title: `1996 ${randomUUID()}`,
          releaseDate: new Date('1996-06-21T00:00:00Z'),
          edition: '日版',
          artist: { create: { name: '坂本龍一' } },
          offers: {
            create: offers.map((offer) => ({
              ...offer,
              supplier: 'tht' as const,
              externalId: randomUUID(),
              url: 'https://www.thtrecords.com/products/test',
              sourceTitle: 'Test Album',
              lastCheckedAt: new Date(),
            })),
          },
        },
        include: { artist: true },
      });

    const read = async (id: string) =>
      (await request(app.getHttpServer()).get(`/products/${id}`).expect(200)).body as Product;

    it('is priced from its cheapest offer that can be ordered, with its artist’s name', async () => {
      const record = await createRecord([
        { priceCents: 160_000, availability: 'in_stock' },
        // A pre-order the shop still takes can be ordered.
        { priceCents: 100_000, availability: 'pre_order' },
        // Cheaper, but can't be bought: not a "from" price.
        { priceCents: 90_000, availability: 'sold_out' },
      ]);

      expect(await read(record.id)).toMatchObject({
        artist: record.artist.name,
        releaseDate: '1996-06-21',
        edition: '日版',
        fromPriceCents: 100_000,
        currency: 'TWD',
      });
    });

    it('has no price when none of its offers can be bought', async () => {
      const record = await createRecord([{ priceCents: 90_000, availability: 'sold_out' }]);

      expect((await read(record.id)).fromPriceCents).toBeNull();
    });
  });
});
