import type { Supplier } from '@vinyl-order/shared';
import { z } from 'zod';

import { availabilityOf } from './availability';
import { readListingTitle, splitArtistNames } from './listing-title';
import { ShopFetcher, ShopFetchError, type ShopRules } from './shop-fetcher';
import { sitemapIndexLocs, type SitemapProduct, sitemapProducts } from './sitemap';
import {
  type CatalogBatch,
  catalogEntries,
  handleFromUrl,
  parseJson,
  type ParsedCatalogEntry,
  MAX_LIST_PAGES,
  type ParsedOffer,
  type StockBatch,
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

/**
 * Product pages, product sitemaps and the list of every product: robots.txt
 * allows all three (§4).
 */
const PATHS = ['/products/', '/sitemap_products', '/collections/all'];

/** A product page's path: `/products/<handle>`, nothing below it. */
const PRODUCT_PATH = /^\/products\/([^/]+)\/?$/;

const SCHEMA_ORG = 'https://schema.org/';

/** Products per sitemap file; the last file holds fewer (§4). */
const PER_FILE = 300;

/** Where a walk without the index stops whatever happens: ~60 000 products. */
const MAX_FILES = 200;

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

/**
 * A list page's `const collection = {...}`: the theme's own data for the 50
 * products on the page, stock and price included (§4).
 */
const collection = z.object({
  products: z.array(
    z.object({
      handle: z.string().min(1),
      // The shop's dollars, not cents.
      price: z.coerce.number().nonnegative(),
      available: z.boolean(),
      // Empty for some goods — Cosmic lists a T-shirt with none (2026-11-20).
      variants: z.array(
        z.object({
          inventory_quantity: z.number().int().nullable(),
          infinite_stock: z.boolean(),
        }),
      ),
    }),
  ),
});

const COLLECTION_START = 'const collection = ';

export interface EasyStoreAdapterOptions {
  /** Tests pass one with a fake fetch; the default goes to the shop. */
  fetcher?: Pick<ShopFetcher, 'fetchText'>;
  /** `YYYY-MM-DD` in Taipei, for a title's "12月". */
  today?: () => string;
}

/**
 * Reads an EasyStore shop (tracker.md §6): its product sitemaps for the
 * catalog, its list of every product for price and stock, and a product
 * page for an offer.
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
      stockQty: stockQtyOf(options),
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

  /**
   * The catalog, a sitemap file at a time: the files the index lists, or —
   * when the index can't be fetched — the files in turn.
   *
   * An index built on request can take over a minute, or end in a 504,
   * while the files it lists answer at once (§4). So a failed index falls
   * back to reading `sitemap_products_1.xml`, `_2`, …
   * Those batches aren't listed by the index: the sync then adds and
   * updates, but deletes nothing (§7.2).
   */
  async *syncCatalog(): AsyncIterable<CatalogBatch> {
    let index: string;
    try {
      index = await this.fetcher.fetchText(`${this.shop.origin}/sitemap_products.xml`);
    } catch (error) {
      if (!(error instanceof ShopFetchError) || error.kind !== 'failed') throw error;
      yield* this.filesInTurn();
      return;
    }
    const files = sitemapIndexLocs(index);
    if (files.length === 0) throw new ShopPageUnreadable('no product sitemaps listed');

    for (const file of files) {
      const products = sitemapProducts(await this.fetcher.fetchText(file));
      // A file the index lists but with nothing in it is a changed format,
      // not an empty shop: stop rather than let sync delete the catalog.
      if (products.length === 0) throw new ShopPageUnreadable('a product sitemap lists nothing');

      yield { entries: this.entriesOf(products), listedByIndex: true };
    }
  }

  /**
   * `sitemap_products_1.xml`, `_2`, … until the last. Each file holds
   * PER_FILE products and the last fewer; a number past the last is
   * answered with the last file again, not a 404. So the walk ends at a file
   * with fewer, or one the same as the file before, and at MAX_FILES
   * whatever happens.
   */
  private async *filesInTurn(): AsyncIterable<CatalogBatch> {
    let previous: string | null = null;
    for (let n = 1; n <= MAX_FILES; n += 1) {
      const products = sitemapProducts(
        await this.fetcher.fetchText(`${this.shop.origin}/sitemap_products_${n}.xml`),
      );
      if (products.length === 0) {
        if (n === 1) throw new ShopPageUnreadable('a product sitemap lists nothing');
        return;
      }
      const listing = products.map((product) => product.loc).join('\n');
      if (listing === previous) return;
      previous = listing;

      yield { entries: this.entriesOf(products), listedByIndex: false };
      if (products.length < PER_FILE) return;
    }
  }

  /**
   * Every product's price and stock, from `/collections/all?page=N`: 50 a
   * page, ~300 pages a shop. Ends at a page listing none, or the same as the
   * page before — past the last, a list may answer with the last again —
   * and at MAX_LIST_PAGES whatever happens.
   */
  async *syncStock(): AsyncIterable<StockBatch> {
    let previous: string | null = null;
    for (let page = 1; page <= MAX_LIST_PAGES; page += 1) {
      const products = readCollection(
        await this.fetcher.fetchText(`${this.shop.origin}/collections/all?page=${page}`),
      );
      if (products.length === 0) {
        if (page === 1) throw new ShopPageUnreadable('the list of products lists nothing');
        return;
      }
      const handles = products.map((product) => product.handle).join('\n');
      if (handles === previous) return;
      previous = handles;

      yield {
        entries: products.map((product) => ({
          externalId: product.handle,
          priceCents: Math.round(product.price * 100),
          available: product.available,
          stockQty: stockQtyOf(product.variants),
        })),
      };
    }
  }

  private entriesOf(products: SitemapProduct[]): ParsedCatalogEntry[] {
    return catalogEntries(products, this.today(), (loc) => this.handleOf(loc));
  }

  private handleOf(url: string): string | null {
    return handleFromUrl(url, this.shop.hosts, PRODUCT_PATH);
  }
}

/**
 * The shop's count, when it keeps one: only when every option is counted.
 * One untracked or "infinite" option — THT's pre-orders — means it doesn't
 * say, and so does a product with no options listed.
 */
const stockQtyOf = (
  options: { inventory_quantity: number | null; infinite_stock: boolean }[],
): number | null =>
  options.length > 0 &&
  options.every((option) => !option.infinite_stock && option.inventory_quantity !== null)
    ? options.reduce((sum, option) => sum + Math.max(option.inventory_quantity ?? 0, 0), 0)
    : null;

/** A list page's products, from its `const collection`, validated. */
const readCollection = (html: string): z.infer<typeof collection>['products'] => {
  const start = html.indexOf(COLLECTION_START);
  if (start === -1) throw new ShopPageUnreadable('no product list on the page');
  const parsed = collection.safeParse(
    parseJson(jsonArrayAt(html, start + COLLECTION_START.length)),
  );
  if (!parsed.success) throw new ShopPageUnreadable('the product list not as expected');
  return parsed.data.products;
};

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

/**
 * The JSON array or object that starts at `from`, cut where its brackets
 * close — strings and escapes skipped, so a "]" in a title doesn't end it
 * early.
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
