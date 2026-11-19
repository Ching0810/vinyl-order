import { Injectable } from '@nestjs/common';
import type { CatalogSearchHit, CatalogSearchQuery } from '@vinyl-order/shared';

import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { searchTitleOf } from './listing-title';

/**
 * Hits returned, best first. No paging: hits ranked by score don't page by
 * cursor, and a search too wide for this many is narrowed by another word.
 */
const LIMIT = 30;

/**
 * Searches the shops' copied catalogs (tracker.md §7.3).
 *
 * `q <% searchTitle` — pg_trgm's word similarity: how much of the query is
 * found in one stretch of the title, not in the title as a whole, so a short
 * query isn't scored down by a long title. It finds the words out of order
 * or apart ("beatles abbey road" in "The Beatles - Abbey Road"), which a
 * substring can't, and uses the GIN trigram index on `searchTitle`. The
 * cut-off is pg_trgm's default, 0.6.
 *
 * **Or the query as a substring.** Chinese and Japanese aren't written with
 * spaces, so to pg_trgm a run of them is one word, and a name inside it
 * misses its word-start trigram: `珍妮` scores 0.33 in `金珍妮 jennie`. A
 * substring finds it; its low score ranks it after the word matches.
 */
@Injectable()
export class CatalogSearchService {
  constructor(private readonly prisma: PrismaService) {}

  async search({ q, supplier, used, nonVinyl }: CatalogSearchQuery): Promise<CatalogSearchHit[]> {
    const query = searchTitleOf(q);
    // A `%` or `_` typed is meant as itself, not as LIKE's wildcard.
    const substring = `%${query.replace(/[\\%_]/g, '\\$&')}%`;
    return this.prisma.$queryRaw<CatalogSearchHit[]>`
      SELECT "id", "supplier", "url", "title", "imageUrl", "isVinyl", "isUsed",
             word_similarity(${query}, "searchTitle") AS "score"
      FROM "CatalogEntry"
      WHERE (${query} <% "searchTitle" OR "searchTitle" LIKE ${substring})
        ${supplier ? Prisma.sql`AND "supplier" = ${supplier}::"Supplier"` : Prisma.empty}
        ${used ? Prisma.empty : Prisma.sql`AND NOT "isUsed"`}
        ${nonVinyl ? Prisma.empty : Prisma.sql`AND "isVinyl"`}
      -- Among equal scores, the title closest to the query as a whole: a
      -- bare "Abbey Road" before a box set that contains it.
      ORDER BY "score" DESC, similarity(${query}, "searchTitle") DESC, "title", "id"
      LIMIT ${LIMIT}
    `;
  }
}
