import { Injectable, NotFoundException } from '@nestjs/common';
import type { CatalogSearchHit } from '@vinyl-order/shared';

import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { containsPattern, readListingTitle, searchTitleOf } from './listing-title';
import { taipeiToday } from './supplier-adapter';

/** Candidates per shop, best first: enough to spot the record, few to read. */
const PER_SHOP = 5;

/**
 * The same record at the shops it has no offer at yet (tracker.md §7.3,
 * step 3), for me to confirm one by one.
 *
 * **The artist must match, then the album title ranks.** A listing is a
 * candidate if it names the artist by any alias — word similarity at
 * pg_trgm's 0.6, or the alias as a substring, as search does for CJK. Among
 * those, the closer the album title the higher: the record's own title and
 * each attached offer's, the best of them.
 *
 * Measured on the copied catalogs (2026-11-19): one query of artist and title
 * together let common words carry it — "30th Anniversary Edition" put other
 * artists' reissues at 0.7 and buried the same record under a shorter name.
 * Split, the same record ranks first at each shop, and the artist's other
 * records trail at 0.17 or less. No title cut-off: a different pressing
 * under a shorter title is still worth a look.
 *
 * Not ranked by barcode (§7.3): the catalogs carry none, and reading every
 * candidate's page for one would be dozens of requests a lookup.
 */
@Injectable()
export class OfferCandidatesService {
  constructor(private readonly prisma: PrismaService) {}

  /** @throws 404 - no such tracked record */
  async candidates(productId: string): Promise<CatalogSearchHit[]> {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
      select: {
        title: true,
        artist: { select: { aliases: { select: { name: true } } } },
        offers: { select: { supplier: true, sourceTitle: true } },
      },
    });
    if (!product) throw new NotFoundException('Product not found');

    const aliases = distinct(product.artist.aliases.map((alias) => searchTitleOf(alias.name)));
    if (aliases.length === 0) return [];
    const today = taipeiToday();
    const titles = distinct([
      searchTitleOf(product.title),
      ...product.offers.map((offer) =>
        searchTitleOf(readListingTitle(offer.sourceTitle, today).title),
      ),
    ]);
    // Shops it is at already: the record is found there, not a candidate.
    const offered = product.offers.map((offer) => offer.supplier as string);

    const namesTheArtist = Prisma.join(
      aliases.map(
        (alias) =>
          Prisma.sql`(${alias} <% e."searchTitle" OR e."searchTitle" LIKE ${containsPattern(alias)})`,
      ),
      ' OR ',
    );
    return this.prisma.$queryRaw<CatalogSearchHit[]>`
      WITH scored AS (
        SELECT e."id", e."supplier", e."url", e."title", e."imageUrl", e."isVinyl", e."isUsed",
               (SELECT max(word_similarity(t, e."searchTitle")) FROM unnest(${titles}::text[]) t)
                 AS "score"
        FROM "CatalogEntry" e
        WHERE e."isVinyl" AND NOT e."isUsed"
          AND NOT (e."supplier"::text = ANY(${offered}::text[]))
          -- Tracked under another record: attaching it would be refused.
          AND NOT EXISTS (
            SELECT 1 FROM "Offer" o
            WHERE o."supplier" = e."supplier" AND o."externalId" = e."externalId"
          )
          AND (${namesTheArtist})
      ),
      ranked AS (
        SELECT *, row_number() OVER (
          PARTITION BY "supplier" ORDER BY "score" DESC, "title", "id"
        ) AS "rank"
        FROM scored
      )
      SELECT "id", "supplier", "url", "title", "imageUrl", "isVinyl", "isUsed", "score"
      FROM ranked
      WHERE "rank" <= ${PER_SHOP}
      ORDER BY "supplier", "rank"
    `;
  }
}

const distinct = (values: string[]): string[] => [...new Set(values.filter(Boolean))];
