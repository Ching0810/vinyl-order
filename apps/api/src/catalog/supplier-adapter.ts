import type { Supplier } from '@vinyl-order/shared';

import type { Availability } from '../generated/prisma/enums';
import { readListingTitle } from './listing-title';
import type { ShopRules } from './shop-fetcher';
import type { SitemapProduct } from './sitemap';

/**
 * One shop's listing, read from its product page: §5.2's offer columns, and
 * what creating a product from it prefills (tracker.md §6.1).
 */
export interface ParsedOffer {
  /** The product's handle, the last part of its URL — as the catalog has it. */
  externalId: string;
  url: string;
  /** The shop's own name for the record, as written. */
  sourceTitle: string;
  priceCents: number;
  currency: string;
  availability: Availability;
  /** The shop's count; null when it doesn't track one. */
  stockQty: number | null;
  /** `YYYY-MM-DD`, from the title's release or restock note. */
  expectedAt: string | null;
  /** The note the date was read from, for the page to show. */
  expectedNote: string | null;
  barcode: string | null;
  imageUrl: string | null;
  // The prefill (§6.2): shown on the add form for correction.
  title: string;
  artistNames: string[];
  format: string | null;
  edition: string | null;
  isVinyl: boolean;
  isUsed: boolean;
}

/** One listing in a shop's catalog, for search (§5.4). */
export interface ParsedCatalogEntry {
  externalId: string;
  url: string;
  title: string;
  imageUrl: string | null;
  /** Null when the catalog source gives none — no sitemap does. */
  priceCents: number | null;
  isVinyl: boolean;
  isUsed: boolean;
  /** The sitemap's `lastmod`. */
  sourceUpdatedAt: Date | null;
}

/** One sitemap file's listings. */
export interface CatalogBatch {
  entries: ParsedCatalogEntry[];
  /**
   * Read from a file the shop's sitemap index listed. Only a catalog read
   * wholly from its index is known to be complete, so only then does a sync
   * delete what it didn't list (§7.2).
   */
  listedByIndex: boolean;
}

/**
 * One listing as a shop's list page shows it (§7.2): its price and whether
 * it can be bought. Pre-order isn't here: no shop marks it on a list, so it
 * is read from the listing's title where it's written.
 */
export interface ParsedStock {
  externalId: string;
  /** Null when the page shows none. */
  priceCents: number | null;
  available: boolean;
  /** The shop's count, when it keeps one for every option; else null. */
  stockQty: number | null;
}

/** One list page's listings. */
export interface StockBatch {
  entries: ParsedStock[];
}

/** List pages read at most, whatever happens: a shop of ~20 000 listings. */
export const MAX_LIST_PAGES = 400;

/** A shop's pages, read into the shared shapes (tracker.md §6.1). */
export interface SupplierAdapter {
  supplier: Supplier;
  /** Where ShopFetcher may go for this shop. */
  rules: ShopRules;
  /** Read one product page into an offer. */
  fetchOffer(url: string): Promise<ParsedOffer>;
  /** Walk the shop's public catalog, a sitemap file at a time. */
  syncCatalog(): AsyncIterable<CatalogBatch>;
  /** Walk the shop's list pages for price and stock, a page at a time (§7.2). */
  syncStock(): AsyncIterable<StockBatch>;
}

/**
 * A page that came back but can't be read as the shop's — a redesign, most
 * likely. Not an offer with gaps (§6.3): the last good values are kept. The
 * message is a short phrase, fit for `Offer.lastError`.
 */
export class ShopPageUnreadable extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ShopPageUnreadable';
  }
}

/**
 * The handle a product URL of a shop names, decoded; null for any other URL.
 *
 * @param url - as pasted, or as a sitemap lists it
 * @param hosts - the shop's hosts
 * @param path - the shop's product path, the handle its first group
 */
export const handleFromUrl = (
  url: string,
  hosts: readonly string[],
  path: RegExp,
): string | null => {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (!hosts.includes(parsed.hostname)) return null;
  const match = path.exec(parsed.pathname);
  if (!match) return null;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return null;
  }
};

/**
 * A product sitemap's listings as catalog entries: the shop's name for each,
 * flagged from it. A listing that isn't one of the shop's product pages, or
 * has no name, is left out.
 *
 * @param handleOf - the shop's handle for a URL, or null
 */
export const catalogEntries = (
  products: SitemapProduct[],
  today: string,
  handleOf: (url: string) => string | null,
): ParsedCatalogEntry[] =>
  products.flatMap((product) => {
    const handle = handleOf(product.loc);
    if (handle === null || !product.imageTitle) return [];
    const read = readListingTitle(product.imageTitle, today);
    const updated = product.lastmod ? new Date(product.lastmod) : null;
    return [
      {
        externalId: handle,
        url: product.loc,
        title: product.imageTitle,
        imageUrl: product.imageLoc,
        priceCents: null,
        isVinyl: read.isVinyl,
        isUsed: read.isUsed,
        sourceUpdatedAt: updated && !Number.isNaN(updated.getTime()) ? updated : null,
      },
    ];
  });

/**
 * A page's JSON, or null when it isn't JSON — for the caller's schema to
 * refuse, so a broken page is unreadable rather than a crash.
 */
export const parseJson = (text: string): unknown => {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
};

/** Today in Taipei, `YYYY-MM-DD`: what a title's "12月" is read against. */
export const taipeiToday = (now: Date = new Date()): string =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Taipei' }).format(now);
