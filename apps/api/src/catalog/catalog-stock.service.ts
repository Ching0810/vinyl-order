import { Injectable } from '@nestjs/common';
import type { Supplier } from '@vinyl-order/shared';

import { Prisma } from '../generated/prisma/client';
import type { Availability } from '../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';
import { availabilityOf } from './availability';
import { readListingTitle } from './listing-title';
import { type ParsedStock, type SupplierAdapter, taipeiToday } from './supplier-adapter';

/** What one shop's stock walk did, for the command to print. Counts only. */
export interface CatalogStockReport {
  supplier: Supplier;
  /** List pages read. */
  pages: number;
  /** Listings the pages showed, each counted once. */
  seen: number;
  /** Of those, the ones in the copied catalog: the rest are ignored. */
  matched: number;
  /** Matched, and different now: written. */
  updated: number;
  inStock: number;
  preOrder: number;
  soldOut: number;
  ms: number;
}

/** A walk that stopped partway; what it wrote stays. */
export class CatalogStockFailed extends Error {
  constructor(
    readonly report: CatalogStockReport,
    readonly reason: unknown,
  ) {
    super(`${report.supplier}: stock stopped after ${report.pages} pages`);
    this.name = 'CatalogStockFailed';
  }
}

/**
 * Fills the copied catalog's price and stock from a shop's list pages
 * (tracker.md §7.2), after the sitemap sync has decided what's listed.
 *
 * A listing the pages show but the catalog hasn't is ignored: the sitemaps
 * decide what exists, and the next sync brings it in. One statement a page,
 * writing only the listings whose price, availability or count changed —
 * as the sitemap sync does, so a night with nothing new rewrites nothing.
 * Pre-order isn't on the pages; it's the listing's own title, as search
 * reads it (§12.3). When the walk ends, the shop's CatalogStockRun says so:
 * the time every listing's stock is as of, kept once a shop, not on each.
 */
@Injectable()
export class CatalogStockService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * @throws CatalogStockFailed - a page couldn't be read or written
   */
  async sync(adapter: SupplierAdapter): Promise<CatalogStockReport> {
    const startedAt = Date.now();
    const { supplier } = adapter;
    const today = taipeiToday();
    const report: CatalogStockReport = {
      supplier,
      pages: 0,
      seen: 0,
      matched: 0,
      updated: 0,
      inStock: 0,
      preOrder: 0,
      soldOut: 0,
      ms: 0,
    };
    // A listing on two pages — the list shifted under the walk — once.
    const seen = new Set<string>();

    try {
      for await (const batch of adapter.syncStock()) {
        report.pages += 1;
        const fresh = batch.entries.filter((entry) => {
          if (seen.has(entry.externalId)) return false;
          seen.add(entry.externalId);
          return true;
        });
        report.seen += fresh.length;
        if (fresh.length === 0) continue;

        const listed = await this.prisma.catalogEntry.findMany({
          where: { supplier, externalId: { in: fresh.map((entry) => entry.externalId) } },
          select: { externalId: true, title: true },
        });
        const titleOf = new Map(listed.map((entry) => [entry.externalId, entry.title]));
        const rows = fresh.flatMap((entry) => {
          const title = titleOf.get(entry.externalId);
          if (title === undefined) return [];
          return [{ ...entry, availability: availabilityFor(entry, title, today) }];
        });
        report.matched += rows.length;
        for (const row of rows) {
          if (row.availability === 'in_stock') report.inStock += 1;
          else if (row.availability === 'pre_order') report.preOrder += 1;
          else report.soldOut += 1;
        }
        if (rows.length > 0) report.updated += await this.write(supplier, rows);
      }
    } catch (reason) {
      report.ms = Date.now() - startedAt;
      throw new CatalogStockFailed(report, reason);
    }

    await this.prisma.catalogStockRun.upsert({
      where: { supplier },
      create: { supplier, finishedAt: new Date(), pages: report.pages, entries: report.matched },
      update: { finishedAt: new Date(), pages: report.pages, entries: report.matched },
    });
    report.ms = Date.now() - startedAt;
    return report;
  }

  /** One page's listings, in one statement; the unchanged left alone. */
  private write(
    supplier: Supplier,
    rows: (ParsedStock & { availability: Availability })[],
  ): Promise<number> {
    const values = rows.map(
      (row) =>
        Prisma.sql`(${row.externalId}::text, ${row.priceCents}::int,
          ${row.availability}::"Availability", ${row.stockQty}::int)`,
    );
    return this.prisma.$executeRaw`
      UPDATE "CatalogEntry" AS entry
      SET "priceCents" = page."priceCents",
          "availability" = page."availability",
          "stockQty" = page."stockQty"
      FROM (VALUES ${Prisma.join(values)})
        AS page("externalId", "priceCents", "availability", "stockQty")
      WHERE entry."supplier" = ${supplier}::"Supplier"
        AND entry."externalId" = page."externalId"
        AND (entry."priceCents", entry."availability", entry."stockQty")
          IS DISTINCT FROM (page."priceCents", page."availability", page."stockQty")
    `;
  }
}

/** Sold out if it can't be bought; a pre-order if its title says so. */
const availabilityFor = (stock: ParsedStock, title: string, today: string): Availability =>
  availabilityOf({
    available: stock.available,
    preOrder: readListingTitle(title, today).isPreOrder,
  });
