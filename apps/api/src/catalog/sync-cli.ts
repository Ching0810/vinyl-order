/**
 * Copies the shops' catalogs into CatalogEntry, run by hand (tracker.md §7.2):
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
import {
  CatalogSyncFailed,
  type CatalogSyncReport,
  CatalogSyncService,
} from './catalog-sync.service';
import { COSMIC, EasyStoreAdapter, THT } from './easystore-adapter';
import { ROTTEN_BLUES, ShopifyAdapter } from './shopify-adapter';
import type { SupplierAdapter } from './supplier-adapter';

/** The shops whose catalogs are read; Candlelight comes with step 11. */
const ADAPTERS: Partial<Record<Supplier, () => SupplierAdapter>> = {
  tht: () => new EasyStoreAdapter(THT),
  cosmic: () => new EasyStoreAdapter(COSMIC),
  rotten_blues: () => new ShopifyAdapter(ROTTEN_BLUES),
};

@Module({
  imports: [PrismaModule],
  providers: [CatalogSyncService],
})
class CatalogSyncCliModule {}

const logger = new Logger('catalog:sync');

const describe = (report: CatalogSyncReport): string =>
  [
    `${report.supplier}: ${report.files} files, ${report.listed} listed`,
    `(${report.vinyl} vinyl, ${report.used} used)`,
    `— ${report.added} added, ${report.rewritten} rewritten, ${report.deleted} deleted`,
    report.deletionSkipped ? `— NOT deleted: listed under half of the ${report.before} copied` : '',
    `in ${(report.ms / 1000).toFixed(1)} s`,
  ]
    .filter(Boolean)
    .join(' ');

const main = async (): Promise<number> => {
  const arg = process.argv[2];
  const known = Object.keys(ADAPTERS) as Supplier[];
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
    for (const supplier of suppliers) {
      try {
        logger.log(describe(await sync.sync(ADAPTERS[supplier]!())));
      } catch (error) {
        failed = true;
        if (!(error instanceof CatalogSyncFailed)) throw error;
        const reason = error.reason instanceof Error ? error.reason.message : String(error.reason);
        // Only the reason's phrase: a fetch or page error names no listing.
        logger.error(`${describe(error.report)} — stopped: ${reason}; nothing deleted`);
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
