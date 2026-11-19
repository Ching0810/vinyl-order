import { Injectable } from '@nestjs/common';
import type { Supplier } from '@vinyl-order/shared';

import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { searchTitleOf } from './listing-title';
import type { ParsedCatalogEntry, SupplierAdapter } from './supplier-adapter';

/** What one shop's sync did, for the command to print. Counts only. */
export interface CatalogSyncReport {
  supplier: Supplier;
  /** Sitemap files read. */
  files: number;
  /** Entries the shop listed, each counted once. */
  listed: number;
  added: number;
  /** Already copied, written again with what the shop lists now. */
  rewritten: number;
  /** The shop's entries it no longer lists, deleted. */
  deleted: number;
  /**
   * The run listed under half of what was copied, so nothing was deleted:
   * more likely the shop's sitemap failing than half its catalog gone.
   */
  deletionSkipped: boolean;
  /** Entries in the table before the run. */
  before: number;
  vinyl: number;
  used: number;
  ms: number;
}

/** A sync that stopped partway; what it wrote stays, nothing was deleted. */
export class CatalogSyncFailed extends Error {
  constructor(
    readonly report: CatalogSyncReport,
    readonly reason: unknown,
  ) {
    super(`${report.supplier}: stopped after ${report.files} files`);
    this.name = 'CatalogSyncFailed';
  }
}

/**
 * Below this share of what was copied, a run deletes nothing (§7.2): a shop
 * takes a few dozen listings down between syncs, never half.
 */
const KEEP_BELOW = 0.5;

/**
 * Copies a shop's catalog into CatalogEntry (tracker.md §7.2).
 *
 * Each batch — one sitemap file — is one statement, `INSERT … ON CONFLICT
 * DO UPDATE`: Prisma has no bulk upsert, and 30 000 single upserts against
 * a remote database would take most of an hour. Every entry a run writes is
 * stamped with the run's start, so once the whole catalog is read, what
 * still has an older stamp is what the shop took down. A run that stops
 * partway deletes nothing; the next one finishes the job.
 */
@Injectable()
export class CatalogSyncService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * @throws CatalogSyncFailed - a file couldn't be read or written
   */
  async sync(adapter: SupplierAdapter): Promise<CatalogSyncReport> {
    const startedAt = new Date();
    const { supplier } = adapter;
    const report: CatalogSyncReport = {
      supplier,
      files: 0,
      listed: 0,
      added: 0,
      rewritten: 0,
      deleted: 0,
      deletionSkipped: false,
      before: await this.prisma.catalogEntry.count({ where: { supplier } }),
      vinyl: 0,
      used: 0,
      ms: 0,
    };
    // A listing can appear in two files; it is counted, and written, once.
    const seen = new Set<string>();

    try {
      for await (const batch of adapter.syncCatalog()) {
        report.files += 1;
        const fresh = batch.filter((entry) => {
          if (seen.has(entry.externalId)) return false;
          seen.add(entry.externalId);
          return true;
        });
        if (fresh.length === 0) continue;
        const added = await this.write(supplier, fresh, startedAt);
        report.listed += fresh.length;
        report.added += added;
        report.rewritten += fresh.length - added;
        report.vinyl += fresh.filter((entry) => entry.isVinyl).length;
        report.used += fresh.filter((entry) => entry.isUsed).length;
      }
    } catch (reason) {
      report.ms = Date.now() - startedAt.getTime();
      throw new CatalogSyncFailed(report, reason);
    }

    if (report.listed < report.before * KEEP_BELOW) {
      report.deletionSkipped = true;
    } else {
      const { count } = await this.prisma.catalogEntry.deleteMany({
        where: { supplier, syncedAt: { lt: startedAt } },
      });
      report.deleted = count;
    }
    report.ms = Date.now() - startedAt.getTime();
    return report;
  }

  /** One batch, upserted in one statement. Returns how many were new. */
  private async write(
    supplier: Supplier,
    entries: ParsedCatalogEntry[],
    syncedAt: Date,
  ): Promise<number> {
    const rows = entries.map(
      (entry) => Prisma.sql`(
        gen_random_uuid(), ${supplier}::"Supplier", ${entry.externalId}, ${entry.url},
        ${entry.title}, ${searchTitleOf(entry.title)}, ${entry.imageUrl}, ${entry.priceCents},
        ${entry.isVinyl}, ${entry.isUsed}, ${entry.sourceUpdatedAt}, ${syncedAt}
      )`,
    );
    // xmax is 0 on a row this statement inserted, and set on one it updated.
    const written = await this.prisma.$queryRaw<{ inserted: boolean }[]>`
      INSERT INTO "CatalogEntry" (
        "id", "supplier", "externalId", "url", "title", "searchTitle", "imageUrl",
        "priceCents", "isVinyl", "isUsed", "sourceUpdatedAt", "syncedAt"
      )
      VALUES ${Prisma.join(rows)}
      ON CONFLICT ("supplier", "externalId") DO UPDATE SET
        "url" = EXCLUDED."url",
        "title" = EXCLUDED."title",
        "searchTitle" = EXCLUDED."searchTitle",
        "imageUrl" = EXCLUDED."imageUrl",
        "priceCents" = EXCLUDED."priceCents",
        "isVinyl" = EXCLUDED."isVinyl",
        "isUsed" = EXCLUDED."isUsed",
        "sourceUpdatedAt" = EXCLUDED."sourceUpdatedAt",
        "syncedAt" = EXCLUDED."syncedAt"
      RETURNING (xmax = 0) AS inserted
    `;
    return written.filter((row) => row.inserted).length;
  }
}
