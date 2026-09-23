import { randomUUID } from 'node:crypto';

import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { Connection, Product } from '@vinyl-order/shared';
import request from 'supertest';
import { App } from 'supertest/types';

import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * GET /products paging, through the shared cursor helper in common/pagination.
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
    const products: { id: string; createdAt: Date }[] = [];
    for (const createdAt of createdAts) {
      products.push(
        await prisma.product.create({
          data: {
            title: `Album ${randomUUID()}`,
            artist: 'Test Artist',
            priceCents: 1_000,
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

  /**
   * GET /products/hot is a front-page strip, not a catalogue: it answers with
   * a bounded number of rows however many records are flagged hot, and
   * whatever a caller asks for.
   */
  it('returns hot products newest first, defaulting to 6 and capped at 24', async () => {
    // More hot records than the cap, so the cap is actually exercised. Which
    // rows come back isn't asserted: hot records are global, and other specs
    // (and earlier runs against a database that isn't reset) have their own.
    await prisma.product.createMany({
      data: Array.from({ length: 25 }, () => ({
        title: `Hot ${randomUUID()}`,
        artist: 'Test Artist',
        priceCents: 1_000,
        isHot: true,
      })),
    });

    const get = async (query: string) =>
      (await request(app.getHttpServer()).get(`/products/hot${query}`).expect(200))
        .body as Product[];

    expect(await get('')).toHaveLength(6);
    expect(await get('?limit=2')).toHaveLength(2);
    // Unreadable and out-of-range limits land on the default and the bounds
    // rather than erroring — a strip on a public page shouldn't 400.
    expect(await get('?limit=abc')).toHaveLength(6);
    expect(await get('?limit=0')).toHaveLength(1);
    expect(await get('?limit=999')).toHaveLength(24);

    // Newest first. The contract carries no dates, so the returned ids are
    // dated from the rows themselves — which also holds for hot records this
    // test didn't create.
    const page = await get('?limit=24');
    expect(page.every((product) => product.isHot)).toBe(true);

    const rows = await prisma.product.findMany({
      where: { id: { in: page.map((product) => product.id) } },
      select: { id: true, createdAt: true },
    });
    const dateById = new Map(rows.map((row) => [row.id, row.createdAt.getTime()]));
    const dates = page.map((product) => dateById.get(product.id) ?? 0);
    expect(dates).toEqual([...dates].sort((a, b) => b - a));
  });

  it('pages forward and backward over a category exactly once', async () => {
    // Two products share a timestamp, so a page boundary falls between a tie.
    const { slug, newestFirst } = await createCategory([at(1), at(2), at(2), at(3), at(4)]);
    // Outside the category: must never appear.
    await prisma.product.create({
      data: { title: 'Elsewhere', artist: 'Test Artist', priceCents: 1_000, createdAt: at(3) },
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
});
