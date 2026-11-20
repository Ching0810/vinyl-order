import { Injectable } from '@nestjs/common';
import type { Supplier } from '@vinyl-order/shared';

import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { SupplierAdapter } from './supplier-adapter';

/** What one shop's home page picks did, for the command to print. Counts only. */
export interface CatalogPopularReport {
  supplier: Supplier;
  /** Listings the home page features. */
  listed: number;
  /** Of those, the ones in the copied catalog: ranked. */
  ranked: number;
  ms: number;
}

/**
 * Ranks the copied catalog by what each shop's home page features
 * (tracker.md §7.2) — Cosmic's slideshow, THT's featured row, Rotten Blues'
 * rows of picks — for the home page's popular section. The shops' own signal, from their public
 * pages: nothing in it is what members track.
 *
 * Each run replaces the shop's ranks: last night's popular aren't today's.
 * The page is read before anything is cleared, so a page that can't be read
 * leaves the last ranks standing.
 */
@Injectable()
export class CatalogPopularService {
  constructor(private readonly prisma: PrismaService) {}

  async sync(adapter: SupplierAdapter): Promise<CatalogPopularReport> {
    const startedAt = Date.now();
    const { supplier } = adapter;
    const handles = [...new Set(await adapter.syncPopular())];

    const ranked = await this.prisma.$transaction(async (tx) => {
      await tx.catalogEntry.updateMany({
        where: { supplier, popularRank: { not: null } },
        data: { popularRank: null },
      });
      if (handles.length === 0) return 0;
      const values = handles.map(
        (handle, index) => Prisma.sql`(${handle}::text, ${index + 1}::int)`,
      );
      return tx.$executeRaw`
        UPDATE "CatalogEntry" AS entry
        SET "popularRank" = list."rank"
        FROM (VALUES ${Prisma.join(values)}) AS list("externalId", "rank")
        WHERE entry."supplier" = ${supplier}::"Supplier"
          AND entry."externalId" = list."externalId"
      `;
    });

    return { supplier, listed: handles.length, ranked, ms: Date.now() - startedAt };
  }
}
