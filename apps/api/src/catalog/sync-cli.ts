/**
 * Copies the shops' catalogs into CatalogEntry, then their price and stock
 * from the shops' list pages, run by hand (tracker.md §7.2):
 *
 *   pnpm --filter api catalog:sync tht
 *   pnpm --filter api catalog:sync all
 *
 * It reads DATABASE_URL from the environment, then `.env`; one set in the
 * shell wins, which is how it is pointed at Neon. It prints counts, timings
 * and the table's size — never a listing's title.
 */
import 'dotenv/config';

import { Logger, Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { Supplier } from '@vinyl-order/shared';

import { PrismaModule } from '../prisma/prisma.module';
import { PrismaService } from '../prisma/prisma.service';
import { createSupplierAdapters } from './adapters';
import {
  CatalogStockFailed,
  type CatalogStockReport,
  CatalogStockService,
} from './catalog-stock.service';
import {
  CatalogSyncFailed,
  type CatalogSyncReport,
  CatalogSyncService,
} from './catalog-sync.service';

@Module({
  imports: [PrismaModule],
  providers: [CatalogSyncService, CatalogStockService],
})
class CatalogSyncCliModule {}

const logger = new Logger('catalog:sync');

const summaryOf = (report: CatalogSyncReport): string =>
  [
    `${report.supplier}: ${report.files} files, ${report.listed} listed`,
    `(${report.vinyl} vinyl, ${report.used} used)`,
    `— ${report.added} added, ${report.changed} changed, ${report.unchanged} unchanged, ${report.deleted} deleted`,
    report.deletionSkipped === 'under_half'
      ? `— NOT deleted: listed under half of the ${report.before} copied`
      : '',
    report.deletionSkipped === 'no_index' ? "— NOT deleted: read without the shop's index" : '',
    `in ${(report.ms / 1000).toFixed(1)} s`,
  ]
    .filter(Boolean)
    .join(' ');

const stockSummaryOf = (report: CatalogStockReport): string =>
  [
    `${report.supplier} stock: ${report.pages} pages, ${report.seen} shown, ${report.matched} in the catalog`,
    `(${report.inStock} in stock, ${report.preOrder} pre-order, ${report.soldOut} sold out)`,
    `— ${report.updated} updated in ${(report.ms / 1000).toFixed(1)} s`,
  ].join(' ');

/** A failure's own phrase: a fetch or page error names no listing. */
const reasonOf = (reason: unknown): string =>
  reason instanceof Error ? reason.message : String(reason);

const main = async (): Promise<number> => {
  const arg = process.argv[2];
  const adapters = createSupplierAdapters();
  const known = Object.keys(adapters) as Supplier[];
  const suppliers = arg === 'all' ? known : known.filter((supplier) => supplier === arg);
  if (suppliers.length === 0) {
    logger.error(`Usage: catalog:sync <${known.join(' | ')} | all>`);
    return 2;
  }

  const app = await NestFactory.createApplicationContext(CatalogSyncCliModule, {
    logger: ['error', 'warn', 'log'],
  });
  let failed = false;
  try {
    const sync = app.get(CatalogSyncService);
    const stock = app.get(CatalogStockService);
    for (const supplier of suppliers) {
      const adapter = adapters[supplier]!;
      try {
        logger.log(summaryOf(await sync.sync(adapter)));
      } catch (error) {
        failed = true;
        if (!(error instanceof CatalogSyncFailed)) throw error;
        logger.error(
          `${summaryOf(error.report)} — stopped: ${reasonOf(error.reason)}; nothing deleted`,
        );
      }
      // Stock fills what's copied, whether or not this run's sitemap walk
      // finished: the listings it didn't reach are there from the last.
      try {
        logger.log(stockSummaryOf(await stock.sync(adapter)));
      } catch (error) {
        failed = true;
        if (!(error instanceof CatalogStockFailed)) throw error;
        logger.error(`${stockSummaryOf(error.report)} — stopped: ${reasonOf(error.reason)}`);
      }
    }
    const [{ size }] = await app.get(PrismaService).$queryRaw<{ size: string }[]>`
      SELECT pg_size_pretty(pg_total_relation_size('"CatalogEntry"')) AS size
    `;
    logger.log(`CatalogEntry, indexes included: ${size}`);
  } finally {
    await app.close();
  }
  return failed ? 1 : 0;
};

main().then(
  (code) => process.exit(code),
  (error: unknown) => {
    logger.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  },
);
