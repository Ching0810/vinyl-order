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
 * The catalogue is shared by every spec in the run, so each test pages through
 * a category of its own and never assumes it sees the whole table.
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

  /** Minutes after a fixed instant, so "newer" is unambiguous. */
  const at = (minutes: number) => new Date(Date.UTC(2026, 0, 1, 0, minutes));

  /** A category holding one product per timestamp, returned newest first. */
  const createCategory = async (createdAts: Date[]) => {
    const slug = `test-${randomUUID()}`;
    const category = await prisma.category.create({ data: { slug, name: slug } });
    const artist = await prisma.artist.create({ data: { name: 'Test Artist' } });
    const products: { id: string; createdAt: Date }[] = [];
    for (const createdAt of createdAts) {
      products.push(
        await prisma.product.create({
          data: {
            title: `Album ${randomUUID()}`,
            artistId: artist.id,
            createdAt,
            categories: { connect: { id: category.id } },
          },
        }),
      );
    }
    // The catalogue order: newest first, id breaking ties.
    const newestFirst = [...products]
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime() || (a.id < b.id ? 1 : -1))
      .map((product) => product.id);
    return { slug, newestFirst };
  };

  const listPage = async (query: string) =>
    (await request(app.getHttpServer()).get(`/products?${query}`).expect(200))
      .body as Connection<Product>;

  it('pages forward and backward over a category exactly once', async () => {
    // Two products share a timestamp, so a page boundary falls between a tie.
    const { slug, newestFirst } = await createCategory([at(1), at(2), at(2), at(3), at(4)]);
    // Outside the category: must never appear.
    await prisma.product.create({
      data: {
        title: 'Elsewhere',
        artist: { create: { name: 'Test Artist' } },
        createdAt: at(3),
      },
    });

    const forward: string[] = [];
    let after = '';
    let hasNextPage = true;
    while (hasNextPage) {
      const page = await listPage(`category=${slug}&first=2${after && `&after=${after}`}`);
      forward.push(...page.edges.map((edge) => edge.node.id));
      ({ hasNextPage } = page.pageInfo);
      after = page.pageInfo.endCursor ?? '';
    }
    expect(forward).toEqual(newestFirst);

    const backward: string[] = [];
    let before = '';
    let hasPreviousPage = true;
    while (hasPreviousPage) {
      const page = await listPage(`category=${slug}&last=2${before && `&before=${before}`}`);
      backward.unshift(...page.edges.map((edge) => edge.node.id));
      ({ hasPreviousPage } = page.pageInfo);
      before = page.pageInfo.startCursor ?? '';
    }
    expect(backward).toEqual(newestFirst);
  });

  it('counts the whole category on every page, not just the page', async () => {
    const { slug } = await createCategory([at(1), at(2), at(3), at(4), at(5)]);

    const first = await listPage(`category=${slug}&first=2`);
    const next = await listPage(`category=${slug}&first=2&after=${first.pageInfo.endCursor}`);

    expect(first.totalCount).toBe(5);
    expect(next.totalCount).toBe(5);
  });

  /**
   * What the Last page button asks for: `last` sized to what is left over,
   * with no cursor. 5 records at 2 a page end on a page of 1.
   */
  it('serves the final page from `last` with no cursor', async () => {
    const { slug, newestFirst } = await createCategory([at(1), at(2), at(3), at(4), at(5)]);

    const page = await listPage(`category=${slug}&last=1`);

    expect(page.edges.map((edge) => edge.node.id)).toEqual(newestFirst.slice(-1));
    expect(page.pageInfo).toMatchObject({ hasNextPage: false, hasPreviousPage: true });

    // Stepping back from it lands on whole pages again.
    const previous = await listPage(`category=${slug}&last=2&before=${page.pageInfo.startCursor}`);
    expect(previous.edges.map((edge) => edge.node.id)).toEqual(newestFirst.slice(2, 4));
  });

  it('falls back to the default page size for a missing or unparseable size', async () => {
    const { slug, newestFirst } = await createCategory(
      Array.from({ length: 12 }, (_, i) => at(i + 1)),
    );

    for (const query of [`category=${slug}`, `category=${slug}&first=abc`]) {
      const page = await listPage(query);
      expect(page.edges.map((edge) => edge.node.id)).toEqual(newestFirst.slice(0, 10));
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
