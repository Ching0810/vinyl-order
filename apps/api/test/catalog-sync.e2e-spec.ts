import { Test } from '@nestjs/testing';
import type { Supplier } from '@vinyl-order/shared';

import { CatalogStockFailed, CatalogStockService } from '../src/catalog/catalog-stock.service';
import { CatalogSyncFailed, CatalogSyncService } from '../src/catalog/catalog-sync.service';
import type {
  ParsedCatalogEntry,
  ParsedStock,
  SupplierAdapter,
} from '../src/catalog/supplier-adapter';
import { PrismaModule } from '../src/prisma/prisma.module';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * Copying a shop's catalog into CatalogEntry (docs/design/tracker.md §7.2):
 * upsert by listing, delete what a finished run no longer lists, and never
 * delete after a run that stopped or listed far less than before.
 *
 * A fake adapter stands in for the shops; the database is the test one.
 */
describe('Catalog sync (e2e)', () => {
  let prisma: PrismaService;
  let sync: CatalogSyncService;
  let stock: CatalogStockService;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [PrismaModule],
      providers: [CatalogSyncService, CatalogStockService],
    }).compile();
    await moduleRef.init();
    prisma = moduleRef.get(PrismaService);
    sync = moduleRef.get(CatalogSyncService);
    stock = moduleRef.get(CatalogStockService);
  });

  beforeEach(async () => {
    await prisma.catalogEntry.deleteMany();
    await prisma.catalogStockRun.deleteMany();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  const entry = (
    externalId: string,
    overrides: Partial<ParsedCatalogEntry> = {},
  ): ParsedCatalogEntry => ({
    externalId,
    url: `https://www.thtrecords.com/products/${externalId}`,
    title: `Test Artist - ${externalId} LP`,
    imageUrl: 'https://cdn.store-assets.com/s/270153/i/1.jpeg',
    priceCents: null,
    isVinyl: true,
    isUsed: false,
    sourceUpdatedAt: new Date('2026-11-18T08:05:17Z'),
    ...overrides,
  });

  /**
   * An adapter whose catalog is these batches, its list pages these, each
   * perhaps ending in a failure.
   */
  const adapter = (
    batches: ParsedCatalogEntry[][],
    options: {
      supplier?: Supplier;
      failAfter?: number;
      listedByIndex?: boolean;
      stock?: ParsedStock[][];
      stockFailAfter?: number;
    } = {},
  ): SupplierAdapter => ({
    supplier: options.supplier ?? 'tht',
    rules: { hosts: [], paths: [] },
    fetchOffer: () => Promise.reject(new Error('not used')),
    syncCatalog: async function* () {
      for (const [index, batch] of batches.entries()) {
        if (index === options.failAfter) throw new Error('answered 503');
        yield await Promise.resolve({
          entries: batch,
          listedByIndex: options.listedByIndex ?? true,
        });
      }
    },
    syncStock: async function* () {
      for (const [index, entries] of (options.stock ?? []).entries()) {
        if (index === options.stockFailAfter) throw new Error('answered 503');
        yield await Promise.resolve({ entries });
      }
    },
  });

  /** One listing as a list page shows it: buyable, uncounted, unless said. */
  const shown = (externalId: string, overrides: Partial<ParsedStock> = {}): ParsedStock => ({
    externalId,
    priceCents: 150_000,
    available: true,
    stockQty: null,
    ...overrides,
  });

  const rowOf = (externalId: string, supplier: Supplier = 'tht') =>
    prisma.catalogEntry.findUniqueOrThrow({
      where: { supplier_externalId: { supplier, externalId } },
    });

  const idsOf = async (supplier: Supplier = 'tht') =>
    (
      await prisma.catalogEntry.findMany({ where: { supplier }, orderBy: { externalId: 'asc' } })
    ).map((row) => row.externalId);

  it('copies a catalog, a statement per batch, with each title in search form', async () => {
    const report = await sync.sync(
      adapter([
        [entry('a', { title: 'ＡＢＣ  Records - Ｌｏｕｄ LP' }), entry('b')],
        [entry('c', { isVinyl: false, isUsed: true })],
      ]),
    );

    expect(report).toMatchObject({
      supplier: 'tht',
      files: 2,
      listed: 3,
      added: 3,
      changed: 0,
      unchanged: 0,
      deleted: 0,
      deletionSkipped: null,
      before: 0,
      vinyl: 2,
      used: 1,
    });
    const row = await prisma.catalogEntry.findUniqueOrThrow({
      where: { supplier_externalId: { supplier: 'tht', externalId: 'a' } },
    });
    expect(row).toMatchObject({
      title: 'ＡＢＣ  Records - Ｌｏｕｄ LP',
      searchTitle: 'abc records - loud lp',
      priceCents: null,
      sourceUpdatedAt: new Date('2026-11-18T08:05:17Z'),
    });
  });

  it('writes what changed, adds what is new, deletes what the shop took down', async () => {
    await sync.sync(adapter([[entry('a'), entry('b'), entry('c')]]));

    const report = await sync.sync(
      adapter([[entry('a', { title: 'Renamed - a LP' }), entry('b'), entry('d')]]),
    );

    expect(report).toMatchObject({
      listed: 3,
      added: 1,
      changed: 1,
      unchanged: 1,
      deleted: 1,
      before: 3,
    });
    expect(await idsOf()).toEqual(['a', 'b', 'd']);
    const renamed = await prisma.catalogEntry.findUniqueOrThrow({
      where: { supplier_externalId: { supplier: 'tht', externalId: 'a' } },
    });
    expect(renamed).toMatchObject({ title: 'Renamed - a LP', searchTitle: 'renamed - a lp' });
  });

  it('leaves a listing that stayed the same unwritten, and keeps it', async () => {
    await sync.sync(adapter([[entry('a'), entry('b')]]));
    const before = await prisma.catalogEntry.findUniqueOrThrow({
      where: { supplier_externalId: { supplier: 'tht', externalId: 'a' } },
    });

    // The shops move lastmod for a stock change; that alone isn't a change.
    const report = await sync.sync(
      adapter([[entry('a', { sourceUpdatedAt: new Date('2026-11-19T01:00:00Z') }), entry('b')]]),
    );

    expect(report).toMatchObject({ added: 0, changed: 0, unchanged: 2, deleted: 0 });
    const after = await prisma.catalogEntry.findUniqueOrThrow({
      where: { supplier_externalId: { supplier: 'tht', externalId: 'a' } },
    });
    expect(after.syncedAt).toEqual(before.syncedAt);
    expect(await idsOf()).toEqual(['a', 'b']);
  });

  it('a flag or a cover changing is a change', async () => {
    await sync.sync(adapter([[entry('a'), entry('b')]]));

    const report = await sync.sync(
      adapter([[entry('a', { isVinyl: false }), entry('b', { imageUrl: null })]]),
    );

    expect(report).toMatchObject({ changed: 2, unchanged: 0 });
  });

  it('a run that stops partway keeps what it wrote and deletes nothing', async () => {
    await sync.sync(adapter([[entry('a'), entry('b'), entry('c')]]));

    const failed = await sync
      .sync(adapter([[entry('a', { title: 'Renamed - a LP' })], [entry('b')]], { failAfter: 1 }))
      .catch((error: unknown) => error);

    expect(failed).toBeInstanceOf(CatalogSyncFailed);
    expect((failed as CatalogSyncFailed).report).toMatchObject({ files: 1, listed: 1, deleted: 0 });
    expect(((failed as CatalogSyncFailed).reason as Error).message).toBe('answered 503');
    // b and c weren't listed by the stopped run, and are still there.
    expect(await idsOf()).toEqual(['a', 'b', 'c']);
    expect(
      (
        await prisma.catalogEntry.findUniqueOrThrow({
          where: { supplier_externalId: { supplier: 'tht', externalId: 'a' } },
        })
      ).title,
    ).toBe('Renamed - a LP');
  });

  it('deletes nothing when a run lists under half of what was copied', async () => {
    await sync.sync(adapter([[entry('a'), entry('b'), entry('c'), entry('d'), entry('e')]]));

    const report = await sync.sync(adapter([[entry('a'), entry('b')]]));

    expect(report).toMatchObject({
      listed: 2,
      deleted: 0,
      deletionSkipped: 'under_half',
      before: 5,
    });
    expect(await idsOf()).toEqual(['a', 'b', 'c', 'd', 'e']);
  });

  it('deletes at exactly half: a shop may halve its catalog, just not by accident often', async () => {
    await sync.sync(adapter([[entry('a'), entry('b'), entry('c'), entry('d')]]));

    const report = await sync.sync(adapter([[entry('a'), entry('b')]]));

    expect(report).toMatchObject({ deleted: 2, deletionSkipped: null });
  });

  it('deletes nothing after a run read without the shop’s index, but adds and changes', async () => {
    await sync.sync(adapter([[entry('a'), entry('b'), entry('c')]]));

    const report = await sync.sync(
      adapter([[entry('a', { title: 'Renamed - a LP' }), entry('d')]], { listedByIndex: false }),
    );

    expect(report).toMatchObject({
      added: 1,
      changed: 1,
      deleted: 0,
      deletionSkipped: 'no_index',
    });
    expect(await idsOf()).toEqual(['a', 'b', 'c', 'd']);
  });

  it('counts and writes a listing listed twice once, in one batch or across two', async () => {
    const report = await sync.sync(
      adapter([
        [entry('a'), entry('a')],
        [entry('a'), entry('b')],
      ]),
    );

    expect(report).toMatchObject({ listed: 2, added: 2 });
    expect(await idsOf()).toEqual(['a', 'b']);
  });

  it("never touches another shop's catalog", async () => {
    await sync.sync(adapter([[entry('x')]], { supplier: 'cosmic' }));
    await sync.sync(adapter([[entry('a')]]));
    await sync.sync(adapter([[entry('b')]]));

    expect(await idsOf('cosmic')).toEqual(['x']);
    expect(await idsOf('tht')).toEqual(['b']);
  });

  it('the same handle at two shops is two listings', async () => {
    await sync.sync(adapter([[entry('same')]], { supplier: 'cosmic' }));
    await sync.sync(adapter([[entry('same')]]));

    expect(await prisma.catalogEntry.count({ where: { externalId: 'same' } })).toBe(2);
  });

  describe('price and stock, from the list pages', () => {
    it('fills each listing’s price, availability and count; a title saying pre-order is one', async () => {
      await sync.sync(
        adapter([
          [entry('a'), entry('b'), entry('c', { title: 'Test Artist - c LP (12/11發行預訂)' })],
        ]),
      );

      const report = await stock.sync(
        adapter([], {
          stock: [
            [
              shown('a', { stockQty: 2 }),
              shown('b', { priceCents: 99_000, available: false, stockQty: 0 }),
            ],
            [shown('c')],
          ],
        }),
      );

      expect(report).toMatchObject({
        supplier: 'tht',
        pages: 2,
        seen: 3,
        matched: 3,
        updated: 3,
        inStock: 1,
        preOrder: 1,
        soldOut: 1,
      });
      expect(await rowOf('a')).toMatchObject({
        priceCents: 150_000,
        availability: 'in_stock',
        stockQty: 2,
      });
      expect(await rowOf('b')).toMatchObject({ priceCents: 99_000, availability: 'sold_out' });
      expect(await rowOf('c')).toMatchObject({ availability: 'pre_order', stockQty: null });
      const run = await prisma.catalogStockRun.findUniqueOrThrow({ where: { supplier: 'tht' } });
      expect(run).toMatchObject({ pages: 2, entries: 3 });
    });

    it('writes only what changed', async () => {
      await sync.sync(adapter([[entry('a'), entry('b')]]));
      await stock.sync(adapter([], { stock: [[shown('a'), shown('b')]] }));

      const report = await stock.sync(
        adapter([], { stock: [[shown('a'), shown('b', { available: false })]] }),
      );

      expect(report).toMatchObject({ matched: 2, updated: 1 });
    });

    it('ignores what the catalog hasn’t copied, and counts a listing on two pages once', async () => {
      await sync.sync(adapter([[entry('a')]]));

      const report = await stock.sync(
        adapter([], { stock: [[shown('a'), shown('new-arrival')], [shown('a')]] }),
      );

      expect(report).toMatchObject({ seen: 2, matched: 1, updated: 1 });
      expect(await prisma.catalogEntry.count()).toBe(1);
    });

    it('a walk that stops keeps what it wrote, and leaves the shop’s last run alone', async () => {
      await sync.sync(adapter([[entry('a'), entry('b')]]));
      await stock.sync(adapter([], { stock: [[shown('a'), shown('b')]] }));
      const before = await prisma.catalogStockRun.findUniqueOrThrow({ where: { supplier: 'tht' } });

      const failed = await stock
        .sync(
          adapter([], {
            stock: [[shown('a', { priceCents: 120_000 })], [shown('b')]],
            stockFailAfter: 1,
          }),
        )
        .catch((error: unknown) => error);

      expect(failed).toBeInstanceOf(CatalogStockFailed);
      expect((failed as CatalogStockFailed).report).toMatchObject({ pages: 1, updated: 1 });
      expect((await rowOf('a')).priceCents).toBe(120_000);
      expect(
        await prisma.catalogStockRun.findUniqueOrThrow({ where: { supplier: 'tht' } }),
      ).toEqual(before);
    });

    it('the sitemap sync leaves price and stock alone, and finds nothing changed', async () => {
      await sync.sync(adapter([[entry('a')]]));
      await stock.sync(adapter([], { stock: [[shown('a', { stockQty: 3 })]] }));

      const report = await sync.sync(adapter([[entry('a')]]));

      expect(report).toMatchObject({ changed: 0, unchanged: 1 });
      expect(await rowOf('a')).toMatchObject({
        priceCents: 150_000,
        availability: 'in_stock',
        stockQty: 3,
      });
    });

    it("never touches another shop's listings", async () => {
      await sync.sync(adapter([[entry('same')]], { supplier: 'cosmic' }));
      await sync.sync(adapter([[entry('same')]]));

      await stock.sync(adapter([], { stock: [[shown('same', { priceCents: 1 })]] }));

      expect((await rowOf('same', 'cosmic')).priceCents).toBeNull();
      expect((await rowOf('same')).priceCents).toBe(1);
    });
  });
});
