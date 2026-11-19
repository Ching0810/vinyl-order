import type { Supplier } from '@vinyl-order/shared';
import { z } from 'zod';

import { availabilityOf } from './availability';
import { readListingTitle, splitArtistNames } from './listing-title';
import { ShopFetcher, type ShopRules } from './shop-fetcher';
import { sitemapIndexLocs, sitemapProducts } from './sitemap';
import {
  type CatalogBatch,
  catalogEntries,
  handleFromUrl,
  parseJson,
  type ParsedOffer,
  type SupplierAdapter,
  ShopPageUnreadable,
  taipeiToday,
} from './supplier-adapter';

/** A Shopify shop: Rotten Blues (tracker.md §4). */
export interface ShopifyShop {
  supplier: Supplier;
  /** Where the shop serves from, e.g. `https://www.rottenblues.com`. */
  origin: string;
  /** The hosts a pasted URL may name; the bare domain redirects to `www.`. */
  hosts: readonly string[];
}

export const ROTTEN_BLUES: ShopifyShop = {
  supplier: 'rotten_blues',
  origin: 'https://www.rottenblues.com',
  hosts: ['www.rottenblues.com', 'rottenblues.com'],
};

/**
 * Product pages (and their `.js`) and the sitemaps: robots.txt allows both.
 * The index is `/sitemap.xml`, so the prefix is `/sitemap`, not
 * `/sitemap_products` as on EasyStore.
 */
const PATHS = ['/products/', '/sitemap'];

/**
 * A product's path, as pasted or listed: `/products/<handle>`, also under a
 * collection (`/collections/new/products/<handle>`), as Shopify links it.
 */
const PRODUCT_PATH = /^(?:\/collections\/[^/]+)?\/products\/([^/.]+)\/?$/;

/** The sitemap index lists pages, collections and blogs too. */
const PRODUCT_SITEMAP = /\/sitemap_products_\d+\.xml/;

/**
 * `/products/<handle>.js`: Shopify's storefront JSON for one product, ~3 KB
 * against a ~250 KB page. Prices are in cents already.
 */
const productJs = z.object({
  title: z.string().min(1),
  handle: z.string().min(1),
  type: z.string(),
  tags: z.array(z.string()),
  available: z.boolean(),
  price: z.number().int().nonnegative(),
  featured_image: z.string().nullable(),
  variants: z
    .array(
      z.object({
        available: z.boolean(),
        barcode: z.string().nullable(),
      }),
    )
    .min(1),
});

/** A product type or tag that says pre-order, as Shopify shops write one. */
const PRE_ORDER_TAG = /預購|pre-?order/i;

export interface ShopifyAdapterOptions {
  /** Tests pass one with a fake fetch; the default goes to the shop. */
  fetcher?: Pick<ShopFetcher, 'fetchText'>;
  /** `YYYY-MM-DD` in Taipei, for a title's "12月". */
  today?: () => string;
}

/**
 * Reads a Shopify shop (tracker.md §6): its product sitemaps for the catalog,
 * and a product's `.js` for an offer.
 *
 * Not `/products.json`: it would give the catalog with prices in one walk,
 * but Rotten Blues rate-limits it for clients like this one (§4), and a
 * crawler that gets 429s is one to stop, not to retry.
 */
export class ShopifyAdapter implements SupplierAdapter {
  readonly supplier: Supplier;
  readonly rules: ShopRules;
  private readonly fetcher: Pick<ShopFetcher, 'fetchText'>;
  private readonly today: () => string;

  constructor(
    private readonly shop: ShopifyShop,
    options: ShopifyAdapterOptions = {},
  ) {
    this.supplier = shop.supplier;
    this.rules = { hosts: shop.hosts, paths: PATHS };
    this.fetcher = options.fetcher ?? new ShopFetcher(this.rules);
    this.today = options.today ?? (() => taipeiToday());
  }

  async fetchOffer(url: string): Promise<ParsedOffer> {
    const handle = handleFromUrl(url, this.shop.hosts, PRODUCT_PATH);
    if (handle === null) throw new ShopPageUnreadable('not a product page of this shop');
    const path = `/products/${encodeURIComponent(handle)}`;

    const parsed = productJs.safeParse(
      parseJson(await this.fetcher.fetchText(new URL(`${path}.js`, this.shop.origin).href)),
    );
    if (!parsed.success) throw new ShopPageUnreadable('no product data on the page');
    const product = parsed.data;
    const read = readListingTitle(product.title, this.today());

    return {
      externalId: handle,
      url: new URL(path, this.shop.origin).href,
      sourceTitle: product.title,
      priceCents: product.price,
      // The storefront JSON names no currency: the shop's is TWD (§4).
      currency: 'TWD',
      availability: availabilityOf({
        available: product.available,
        preOrder: read.isPreOrder || product.tags.some((tag) => PRE_ORDER_TAG.test(tag)),
      }),
      // The storefront JSON gives no count (§4's table).
      stockQty: null,
      expectedAt: read.expected?.at ?? null,
      expectedNote: read.expected?.note ?? null,
      barcode: product.variants.map((variant) => variant.barcode?.trim()).find(Boolean) ?? null,
      imageUrl: product.featured_image ? absolute(product.featured_image) : null,
      title: read.title,
      artistNames: read.artist ? splitArtistNames(read.artist) : [],
      format: read.format,
      edition: read.edition,
      // The shop's own product type is surer than the title: "黑膠" or "CD".
      isVinyl: product.type
        ? product.type.includes('黑膠') || /vinyl/i.test(product.type)
        : read.isVinyl,
      isUsed: read.isUsed,
    };
  }

  async *syncCatalog(): AsyncIterable<CatalogBatch> {
    const index = await this.fetcher.fetchText(`${this.shop.origin}/sitemap.xml`);
    const files = sitemapIndexLocs(index).filter((loc) => PRODUCT_SITEMAP.test(loc));
    if (files.length === 0) throw new ShopPageUnreadable('no product sitemaps listed');

    for (const file of files) {
      const products = sitemapProducts(await this.fetcher.fetchText(file));
      // A file the index lists but with nothing in it is a changed format,
      // not an empty shop: stop rather than let sync delete the catalog.
      if (products.length === 0) throw new ShopPageUnreadable('a product sitemap lists nothing');

      yield {
        entries: catalogEntries(products, this.today(), (loc) =>
          handleFromUrl(loc, this.shop.hosts, PRODUCT_PATH),
        ),
        listedByIndex: true,
      };
    }
  }
}

/** Shopify writes image URLs without a scheme: `//cdn.shopify.com/…`. */
const absolute = (url: string): string => (url.startsWith('//') ? `https:${url}` : url);
