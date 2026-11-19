import type { Supplier } from '@vinyl-order/shared';

import type { Availability } from '../generated/prisma/enums';
import type { ShopRules } from './shop-fetcher';

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

/** A shop's pages, read into the shared shapes (tracker.md §6.1). */
export interface SupplierAdapter {
  supplier: Supplier;
  /** Where ShopFetcher may go for this shop. */
  rules: ShopRules;
  /** Read one product page into an offer. */
  fetchOffer(url: string): Promise<ParsedOffer>;
  /** Walk the shop's public catalog, a sitemap file at a time. */
  syncCatalog(): AsyncIterable<ParsedCatalogEntry[]>;
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

/** Today in Taipei, `YYYY-MM-DD`: what a title's "12月" is read against. */
export const taipeiToday = (now: Date = new Date()): string =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Taipei' }).format(now);
