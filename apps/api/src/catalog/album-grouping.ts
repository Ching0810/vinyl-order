import type { CatalogSearchHit } from '@vinyl-order/shared';

import { normalizeName, readListingTitle, splitArtistNames } from './listing-title';

/** A search hit with the shop's id for it, to find the record tracking it. */
export interface Listing extends CatalogSearchHit {
  externalId: string;
}

/** Listings of one album, best first, and how the best one names it. */
export interface AlbumGroup<T extends Listing = Listing> {
  artist: string | null;
  title: string;
  listings: T[];
}

/**
 * Listings grouped into albums (tracker.md §7.3): two listings are one album
 * when their titles share an artist name and name **the same album**, once
 * case, width, spaces and punctuation are set aside.
 *
 * Measured on ten artists' 430 listings (2026-11-20): the same album, exactly,
 * found 78 albums at two shops or more and merged no two releases. A title
 * containing the other merged Kid A with Kid A Mnesia and OK Computer with
 * its OKNOTOK box — different records. A title with no artist read stays an
 * album of its own: "Greatest Hits" alone says nothing.
 *
 * @param listings - best first; albums keep that order, by their best listing
 * @param today - `YYYY-MM-DD` in Taipei, for reading a title's dates
 */
export const groupIntoAlbums = <T extends Listing>(
  listings: T[],
  today: string,
): AlbumGroup<T>[] => {
  const read = listings.map((listing) => {
    const title = readListingTitle(listing.title, today);
    return {
      title,
      artists: title.artist
        ? splitArtistNames(title.artist).map(normalizeName).filter(Boolean)
        : [],
      album: normalizeName(title.title),
    };
  });

  // Each listing joins the first album, best listing first, it belongs to.
  const groups: { first: number; members: number[] }[] = [];
  read.forEach((listing, index) => {
    const group = groups.find(({ first }) => {
      const best = read[first];
      return (
        listing.album !== '' &&
        listing.album === best.album &&
        listing.artists.some((artist) => best.artists.includes(artist))
      );
    });
    if (group) group.members.push(index);
    else groups.push({ first: index, members: [index] });
  });

  return groups.map(({ first, members }) => ({
    artist: read[first].title.artist,
    title: read[first].title.title || listings[first].title,
    listings: members.map((index) => listings[index]),
  }));
};
