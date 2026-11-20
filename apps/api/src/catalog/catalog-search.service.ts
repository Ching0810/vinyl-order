import { Injectable } from '@nestjs/common';
import type {
  CatalogAlbum,
  CatalogAlbumListing,
  CatalogSearchHit,
  CatalogSearchQuery,
} from '@vinyl-order/shared';

import { Prisma } from '../generated/prisma/client';
import type { Availability } from '../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';
import { groupIntoAlbums, type Listing } from './album-grouping';
import { containsPattern, readListingTitle, searchTitleOf } from './listing-title';
import { taipeiToday } from './supplier-adapter';

/**
 * Listings read to group, best first: enough that a popular artist's albums
 * each gather their shops, few enough to group in a moment.
 */
const LISTINGS = 120;

/**
 * Albums returned, best first. No paging: albums ranked by score don't page
 * by cursor, and a search too wide for this many is narrowed by another word.
 */
const ALBUMS = 30;

/**
 * Searches the shops' copied catalogs (tracker.md §7.3), answering with
 * albums: each listing found, grouped with the same album's listings at the
 * other shops (album-grouping.ts), the record holding them if any, and which
 * of them the searcher tracks.
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

  /**
   * @param query - the words and filters
   * @param userId - who is searching, for which listings they track
   */
  async search(query: CatalogSearchQuery, userId: string): Promise<CatalogAlbum[]> {
    const today = taipeiToday();
    const groups = groupIntoAlbums(await this.listings(query), today).slice(0, ALBUMS);
    const listings = groups.flatMap((group) => group.listings);

    const tracked = listings.length
      ? await this.prisma.offer.findMany({
          where: {
            OR: listings.map(({ supplier, externalId }) => ({ supplier, externalId })),
          },
          select: {
            supplier: true,
            externalId: true,
            productId: true,
            availability: true,
            priceCents: true,
            currency: true,
            stockQty: true,
            lastCheckedAt: true,
            // Whether this user tracks it: one row or none.
            watches: { where: { userId }, select: { userId: true } },
          },
        })
      : [];
    const offerOf = new Map(
      tracked.map((offer) => [`${offer.supplier}/${offer.externalId}`, offer]),
    );
    const offerFor = (listing: Listing) => offerOf.get(`${listing.supplier}/${listing.externalId}`);
    const walkedAt = new Map(
      (await this.prisma.catalogStockRun.findMany()).map((run) => [run.supplier, run.finishedAt]),
    );

    return groups.map((group) => ({
      key: group.listings[0].id,
      artist: group.artist,
      title: group.title,
      imageUrl: group.listings.find((listing) => listing.imageUrl)?.imageUrl ?? null,
      score: group.listings[0].score,
      listings: group.listings.map((listing) => {
        const offer = offerFor(listing);
        return {
          ...toHit(listing),
          watched: (offer?.watches.length ?? 0) > 0,
          ...stockOf(listing, offer, walkedAt.get(listing.supplier), today),
        };
      }),
      productId:
        group.listings.map((listing) => offerFor(listing)?.productId).find(Boolean) ?? null,
    }));
  }

  private listings({ q, supplier, used, nonVinyl }: CatalogSearchQuery): Promise<CatalogRow[]> {
    const query = searchTitleOf(q);
    return this.prisma.$queryRaw<CatalogRow[]>`
      SELECT "id", "supplier", "externalId", "url", "title", "imageUrl", "isVinyl", "isUsed",
             "priceCents", "availability", "stockQty",
             word_similarity(${query}, "searchTitle") AS "score"
      FROM "CatalogEntry"
      WHERE (${query} <% "searchTitle" OR "searchTitle" LIKE ${containsPattern(query)})
        ${supplier ? Prisma.sql`AND "supplier" = ${supplier}::"Supplier"` : Prisma.empty}
        ${used ? Prisma.empty : Prisma.sql`AND NOT "isUsed"`}
        ${nonVinyl ? Prisma.empty : Prisma.sql`AND "isVinyl"`}
      -- Among equal scores, the title closest to the query as a whole: a
      -- bare "Abbey Road" before a box set that contains it.
      ORDER BY "score" DESC, similarity(${query}, "searchTitle") DESC, "title", "id"
      LIMIT ${LISTINGS}
    `;
  }
}

/** A listing as search answers with it: without the shop's own id. */
const toHit = (listing: Listing): CatalogSearchHit => ({
  id: listing.id,
  supplier: listing.supplier,
  url: listing.url,
  title: listing.title,
  imageUrl: listing.imageUrl,
  isVinyl: listing.isVinyl,
  isUsed: listing.isUsed,
  score: listing.score,
});

/** A listing as the catalog copies it: with price and stock from the list pages. */
interface CatalogRow extends Listing {
  priceCents: number | null;
  availability: Availability | null;
  stockQty: number | null;
}

/** What a record's offer last read from the listing's product page. */
interface OfferRead {
  availability: Availability;
  priceCents: number;
  currency: string;
  stockQty: number | null;
  lastCheckedAt: Date;
}

/** The catalogs' prices are the shops' own, all in TWD (§4). */
const CATALOG_CURRENCY = 'TWD';

/**
 * A listing's price and stock as far as search knows (§7.2, §12.3): the
 * newer of its record's offer — read from the product page — and the
 * catalog, read from the shop's list pages as of its last stock walk. A
 * listing neither has read is a pre-order if its title says so, and
 * otherwise unknown: a guess would read as a fact.
 *
 * @param walkedAt - when the shop's last stock walk finished
 */
const stockOf = (
  row: CatalogRow,
  offer: OfferRead | undefined,
  walkedAt: Date | undefined,
  today: string,
): Pick<
  CatalogAlbumListing,
  'availability' | 'priceCents' | 'currency' | 'stockQty' | 'checkedAt'
> => {
  const catalogAt = row.availability !== null ? (walkedAt ?? null) : null;
  if (offer && (catalogAt === null || offer.lastCheckedAt >= catalogAt)) {
    return {
      availability: offer.availability,
      priceCents: offer.priceCents,
      currency: offer.currency,
      stockQty: offer.stockQty,
      checkedAt: offer.lastCheckedAt.toISOString(),
    };
  }
  if (row.availability !== null) {
    return {
      availability: row.availability,
      priceCents: row.priceCents,
      currency: CATALOG_CURRENCY,
      stockQty: row.stockQty,
      checkedAt: catalogAt?.toISOString() ?? null,
    };
  }
  return {
    availability: readListingTitle(row.title, today).isPreOrder ? 'pre_order' : 'unknown',
    priceCents: null,
    currency: CATALOG_CURRENCY,
    stockQty: null,
    checkedAt: null,
  };
};
