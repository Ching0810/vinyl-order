/**
 * Reads again every offer some member tracks, from the shops' product pages,
 * and tells the members tracking one whose price dropped (tracker.md §10,
 * §5.10). Run nightly after the catalog sync, or by hand:
 *
 *   pnpm --filter api offers:refresh
 *
 * It reads DATABASE_URL from the environment, then `.env`; one set in the
 * shell wins, which is how it is pointed at Neon. It prints counts and a
 * timing — never a listing's title: the workflow's log is public.
 */
import 'dotenv/config';

import { Logger, Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';

import { PrismaModule } from '../prisma/prisma.module';
import { createSupplierAdapters, SUPPLIER_ADAPTERS } from './adapters';
import { OfferRefreshService, type TrackedRefreshReport } from './offer-refresh.service';

@Module({
  imports: [PrismaModule],
  providers: [
    OfferRefreshService,
    { provide: SUPPLIER_ADAPTERS, useFactory: createSupplierAdapters },
  ],
})
class OfferRefreshCliModule {}

const logger = new Logger('offers:refresh');

const summaryOf = (report: TrackedRefreshReport): string =>
  [
    `${report.offers} tracked offers read:`,
    `${report.changed} changed (${report.drops} price drops told),`,
    `${report.failed} couldn't be read`,
    `in ${(report.ms / 1000).toFixed(1)} s`,
  ].join(' ');

/**
 * A page a shop won't answer keeps its offer's last good values and says
 * why on the record (§5.2): one, or a few, is a night like any other. Every
 * read failing is not — a shop down, or its pages changed — and fails the
 * run, so the workflow says so.
 */
const main = async (): Promise<number> => {
  const app = await NestFactory.createApplicationContext(OfferRefreshCliModule, {
    logger: ['error', 'warn', 'log'],
  });
  try {
    const report = await app.get(OfferRefreshService).refreshTracked();
    logger.log(summaryOf(report));
    return report.offers > 0 && report.failed === report.offers ? 1 : 0;
  } finally {
    await app.close();
  }
};

main().then(
  (code) => process.exit(code),
  (error: unknown) => {
    logger.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  },
);
