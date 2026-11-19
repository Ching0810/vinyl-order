import type { Supplier } from '@vinyl-order/shared';
import { z } from 'zod';

import { availabilityOf } from './availability';
import { readListingTitle, splitArtistNames } from './listing-title';
import { ShopFetcher, type ShopRules } from './shop-fetcher';
import { sitemapIndexLocs, sitemapProducts } from './sitemap';
import {
  type ParsedCatalogEntry,
  type ParsedOffer,
  type SupplierAdapter,
  ShopPageUnreadable,
  taipeiToday,
} from './supplier-adapter';

/** An EasyStore shop: THT and Cosmic run on the same platform (tracker.md §4). */
export interface EasyStoreShop {
  supplier: Supplier;
  /** Where the shop serves from, e.g. `https://www.thtrecords.com`. */
  origin: string;
  /** The hosts a pasted URL may name; the bare domain redirects to `www.`. */
  hosts: readonly string[];
}

export const THT: EasyStoreShop = {
  supplier: 'tht',
  origin: 'https://www.thtrecords.com',
  hosts: ['www.thtrecords.com', 'thtrecords.com'],
};

export const COSMIC: EasyStoreShop = {
  supplier: 'cosmic',
  origin: 'https://www.cosmicmusicrecord.com',
  hosts: ['www.cosmicmusicrecord.com', 'cosmicmusicrecord.com'],
};

/** Product pages and product sitemaps: robots.txt allows both (§4). */
const PATHS = ['/products/', '/sitemap_products'];

/** A product page's path: `/products/<handle>`, nothing below it. */
const PRODUCT_PATH = /^\/products\/([^/]+)\/?$/;

const SCHEMA_ORG = 'https://schema.org/';

/** The page's JSON-LD Product: name, price and availability. */
const productLd = z.object({
  '@type': z.literal('Product'),
  name: z.string().min(1),
  image: z.union([z.string(), z.array(z.string())]).optional(),
  offers: z.object({
    price: z.coerce.number().nonnegative(),
    priceCurrency: z.string().length(3),
    availability: z.string().startsWith(SCHEMA_ORG),
  }),
});

/** The page's `variants = [...]`: stock, barcode and what can be bought. */
const variants = z
  .array(
    z.object({
      title: z.string(),
      barcode: z.string().nullable(),
      available: z.boolean(),
      inventory_quantity: z.number().int().nullable(),
      infinite_stock: z.boolean(),
    }),
  )
  .min(1);

const LD_SCRIPT = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/g;

export interface EasyStoreAdapterOptions {
  /** Tests pass one with a fake fetch; the default goes to the shop. */
  fetcher?: Pick<ShopFetcher, 'fetchText'>;
  /** `YYYY-MM-DD` in Taipei, for a title's "12月". */
  today?: () => string;
}

/**
 * Reads an EasyStore shop (tracker.md §6): its product sitemaps for the
 * catalog, and a product page for an offer.
 *
 * The page carries what an offer needs in two scripts: a JSON-LD Product
 * (name, price, availability) and the theme's `variants` array (stock,
 * barcode, what can be bought). Both are validated; a page missing either is
 * unreadable rather than an offer with gaps (§6.3).
 */
export class EasyStoreAdapter implements SupplierAdapter {
  readonly supplier: Supplier;
  readonly rules: ShopRules;
  private readonly fetcher: Pick<ShopFetcher, 'fetchText'>;
  private readonly today: () => string;

  constructor(
    private readonly shop: EasyStoreShop,
    options: EasyStoreAdapterOptions = {},
  ) {
    this.supplier = shop.supplier;
    this.rules = { hosts: shop.hosts, paths: PATHS };
    this.fetcher = options.fetcher ?? new ShopFetcher(this.rules);
    this.today = options.today ?? (() => taipeiToday());
  }

  async fetchOffer(url: string): Promise<ParsedOffer> {
    const handle = this.handleOf(url);
    if (handle === null) throw new ShopPageUnreadable('not a product page of this shop');
    const pageUrl = new URL(`/products/${encodeURIComponent(handle)}`, this.shop.origin).href;
    const html = await this.fetcher.fetchText(pageUrl);

    const ld = readProductLd(html);
    const options = readVariants(html);
    const read = readListingTitle(ld.name, this.today());

    const preOrder =
      read.isPreOrder ||
      ld.offers.availability === `${SCHEMA_ORG}PreOrder` ||
      options.some((option) => /預購|預訂/.test(option.title));
    // Stock is a count only when every option is counted; one untracked or
    // "infinite" option — THT's pre-orders — means the shop doesn't say.
    const counted = options.every(
      (option) => !option.infinite_stock && option.inventory_quantity !== null,
    );

    return {
      externalId: handle,
      url: pageUrl,
      sourceTitle: ld.name,
      priceCents: Math.round(ld.offers.price * 100),
      currency: ld.offers.priceCurrency,
      availability: availabilityOf({
        available: options.some((option) => option.available),
        preOrder,
      }),
      stockQty: counted
        ? options.reduce((sum, option) => sum + Math.max(option.inventory_quantity ?? 0, 0), 0)
        : null,
      expectedAt: read.expected?.at ?? null,
      expectedNote: read.expected?.note ?? null,
      barcode: options.map((option) => option.barcode?.trim()).find(Boolean) ?? null,
      imageUrl: (Array.isArray(ld.image) ? ld.image[0] : ld.image) ?? null,
      title: read.title,
      artistNames: read.artist ? splitArtistNames(read.artist) : [],
      format: read.format,
      edition: read.edition,
      isVinyl: read.isVinyl,
      isUsed: read.isUsed,
    };
  }

  async *syncCatalog(): AsyncIterable<ParsedCatalogEntry[]> {
    const index = await this.fetcher.fetchText(`${this.shop.origin}/sitemap_products.xml`);
    const files = sitemapIndexLocs(index);
    if (files.length === 0) throw new ShopPageUnreadable('no product sitemaps listed');

    for (const file of files) {
      const products = sitemapProducts(await this.fetcher.fetchText(file));
      // A file the index lists but with nothing in it is a changed format,
      // not an empty shop: stop rather than let sync delete the catalog.
      if (products.length === 0) throw new ShopPageUnreadable('a product sitemap lists nothing');

      const today = this.today();
      yield products.flatMap((product) => {
        const handle = this.handleOf(product.loc);
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
    }
  }

  /** The handle a URL of this shop names, decoded; null for anything else. */
  private handleOf(url: string): string | null {
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      return null;
    }
    if (!this.shop.hosts.includes(parsed.hostname)) return null;
    const match = PRODUCT_PATH.exec(parsed.pathname);
    if (!match) return null;
    try {
      return decodeURIComponent(match[1]);
    } catch {
      return null;
    }
  }
}

/** The page's JSON-LD Product, validated. */
const readProductLd = (html: string): z.infer<typeof productLd> => {
  for (const [, json] of html.matchAll(LD_SCRIPT)) {
    const parsed = productLd.safeParse(parseJson(json));
    if (parsed.success) return parsed.data;
  }
  throw new ShopPageUnreadable('no product data on the page');
};

/** The theme's `variants = [...]`, validated. */
const readVariants = (html: string): z.infer<typeof variants> => {
  const start = html.indexOf('variants = [');
  if (start === -1) throw new ShopPageUnreadable('no variants on the page');
  const parsed = variants.safeParse(parseJson(jsonArrayAt(html, start + 'variants = '.length)));
  if (!parsed.success) throw new ShopPageUnreadable('variants not as expected');
  return parsed.data;
};

const parseJson = (text: string): unknown => {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
};

/**
 * The JSON array that starts at `from`, cut where its brackets close —
 * strings and escapes skipped, so a "]" in a title doesn't end it early.
 */
const jsonArrayAt = (text: string, from: number): string => {
  let depth = 0;
  let inString = false;
  for (let i = from; i < text.length; i += 1) {
    const char = text[i];
    if (inString) {
      if (char === '\\') i += 1;
      else if (char === '"') inString = false;
    } else if (char === '"') {
      inString = true;
    } else if (char === '[' || char === '{') {
      depth += 1;
    } else if (char === ']' || char === '}') {
      depth -= 1;
      if (depth === 0) return text.slice(from, i + 1);
    }
  }
  return '';
};
