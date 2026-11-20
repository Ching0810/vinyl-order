import { Injectable } from '@nestjs/common';
import type {
  CatalogAlbum,
  CatalogSearchHit,
  CatalogSearchQuery,
  ListingAvailability,
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
            // Whether this user tracks it: one row or none.
            watches: { where: { userId }, select: { userId: true } },
          },
        })
      : [];
    const offerOf = new Map(
      tracked.map((offer) => [`${offer.supplier}/${offer.externalId}`, offer]),
    );
    const offerFor = (listing: Listing) => offerOf.get(`${listing.supplier}/${listing.externalId}`);

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
          availability: availabilityOf(listing, offer?.availability, today),
        };
      }),
      productId:
        group.listings.map((listing) => offerFor(listing)?.productId).find(Boolean) ?? null,
    }));
  }

  private listings({ q, supplier, used, nonVinyl }: CatalogSearchQuery): Promise<Listing[]> {
    const query = searchTitleOf(q);
    return this.prisma.$queryRaw<Listing[]>`
      SELECT "id", "supplier", "externalId", "url", "title", "imageUrl", "isVinyl", "isUsed",
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

/**
 * As far as search knows (§4): a listing on a record has its page's last
 * read; one whose title says pre-order is a pre-order; any other is unknown —
 * the catalog carries no stock, and a guess would read as a fact.
 */
const availabilityOf = (
  listing: Listing,
  read: Availability | undefined,
  today: string,
): ListingAvailability => {
  if (read) return read;
  return readListingTitle(listing.title, today).isPreOrder ? 'pre_order' : 'unknown';
};
