import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { ShopFetcher } from '../src/catalog/shop-fetcher';
import { ROTTEN_BLUES, ShopifyAdapter } from '../src/catalog/shopify-adapter';
import type {
  CatalogBatch,
  ParsedCatalogEntry,
  ParsedStock,
} from '../src/catalog/supplier-adapter';
import { ShopPageUnreadable } from '../src/catalog/supplier-adapter';

/**
 * The Shopify adapter, for Rotten Blues (docs/design/tracker.md §6): a
 * product's storefront JSON into an offer, product sitemaps into catalog
 * entries, the list of every product's cards into price and stock.
 *
 * The fixtures are the shop's public sitemaps and product JSON (2026-11-19).
 * A fake fetch answers from them, so nothing here reaches the shop. Pure, no
 * app: kept as an e2e spec only because CI runs those.
 */

const fixture = (name: string): string =>
  readFileSync(resolve(__dirname, 'fixtures/shops', name), 'utf8');

const TODAY = '2026-11-19';
const ORIGIN = 'https://www.rottenblues.com';
const CD = `${ORIGIN}/products/44471187690`;
const LP = `${ORIGIN}/products/44104434849`;
const PRE_ORDER = `${ORIGIN}/products/40802646704`;

/** A fetcher that answers from fixtures, keyed by the URL as fetched. */
const fakeFetcher = (pages: Record<string, string>) => {
  const asked: string[] = [];
  return {
    asked,
    fetchText: (url: string) => {
      asked.push(url);
      const body = pages[url];
      return body === undefined
        ? Promise.reject(new Error(`no fixture for ${url}`))
        : Promise.resolve(body);
    },
  };
};

const rottenBlues = (pages: Record<string, string>) => {
  const fetcher = fakeFetcher(pages);
  return {
    adapter: new ShopifyAdapter(ROTTEN_BLUES, { fetcher, today: () => TODAY }),
    fetcher,
  };
};

/** Each batch's entries, and whether every batch came from the index. */
const collect = async (batches: AsyncIterable<CatalogBatch>) => {
  const entries: ParsedCatalogEntry[][] = [];
  for await (const batch of batches) entries.push(batch.entries);
  return entries;
};

const listedByIndex = async (batches: AsyncIterable<CatalogBatch>) => {
  const flags: boolean[] = [];
  for await (const batch of batches) flags.push(batch.listedByIndex);
  return flags;
};

describe('Shopify adapter (e2e)', () => {
  describe('a product', () => {
    it('a CD: read from its .js, prices in cents already', async () => {
      const { adapter, fetcher } = rottenBlues({ [`${CD}.js`]: fixture('shopify-cd.json') });

      expect(await adapter.fetchOffer(CD)).toEqual({
        externalId: '44471187690',
        url: CD,
        sourceTitle: '【日版CD】ヨルシカ Yorushika《だから僕は音楽を辞めた》所以我放棄了音樂',
        priceCents: 80_000,
        currency: 'TWD',
        availability: 'in_stock',
        stockQty: null,
        expectedAt: null,
        expectedNote: null,
        barcode: null,
        imageUrl:
          'https://cdn.shopify.com/s/files/1/1002/3600/1461/files/tw-11134207-81ztq-mf1vqx021p8pd6.jpg?v=1772502762',
        title: 'だから僕は音楽を辞めた',
        artistNames: ['ヨルシカ', 'Yorushika'],
        format: 'CD',
        edition: '日版',
        isVinyl: false,
        isUsed: false,
      });
      expect(fetcher.asked).toEqual([`${CD}.js`]);
    });

    it('a record: vinyl by the shop’s own product type', async () => {
      const { adapter } = rottenBlues({ [`${LP}.js`]: fixture('shopify-lp.json') });

      expect(await adapter.fetchOffer(LP)).toMatchObject({
        priceCents: 75_000,
        availability: 'in_stock',
        title: 'Some Might Say',
        artistNames: ['Oasis'],
        isVinyl: true,
      });
    });

    it('a pre-order, by its title', async () => {
      const { adapter } = rottenBlues({ [`${PRE_ORDER}.js`]: fixture('shopify-pre-order.json') });

      expect(await adapter.fetchOffer(PRE_ORDER)).toMatchObject({
        priceCents: 178_000,
        availability: 'pre_order',
        isVinyl: true,
      });
    });

    it('a pre-order, by a tag', async () => {
      const js = fixture('shopify-lp.json').replace(/"tags":\s*\[/, '"tags": ["預購Pre-order", ');
      const { adapter } = rottenBlues({ [`${LP}.js`]: js });

      expect((await adapter.fetchOffer(LP)).availability).toBe('pre_order');
    });

    it('sold out when it cannot be bought', async () => {
      // The product's own flag, which comes before its variants'.
      const js = fixture('shopify-cd.json').replace(/"available":\s*true/, '"available": false');
      const { adapter } = rottenBlues({ [`${CD}.js`]: js });

      expect((await adapter.fetchOffer(CD)).availability).toBe('sold_out');
    });

    it.each([
      ['the bare domain', 'https://rottenblues.com/products/44471187690'],
      ['under a collection', 'https://www.rottenblues.com/collections/cd/products/44471187690'],
      [
        'with a variant and a fragment',
        'https://www.rottenblues.com/products/44471187690?variant=52300761792693#x',
      ],
    ])('reads %s at its canonical address', async (_case, url) => {
      const { adapter, fetcher } = rottenBlues({ [`${CD}.js`]: fixture('shopify-cd.json') });

      expect((await adapter.fetchOffer(url)).url).toBe(CD);
      expect(fetcher.asked).toEqual([`${CD}.js`]);
    });

    it.each([
      ['another shop', 'https://www.thtrecords.com/products/44471187690'],
      ['a collection', 'https://www.rottenblues.com/collections/cd'],
      ['the cart', 'https://www.rottenblues.com/cart'],
    ])('refuses %s without fetching', async (_case, url) => {
      const { adapter, fetcher } = rottenBlues({});

      await expect(adapter.fetchOffer(url)).rejects.toThrow(
        new ShopPageUnreadable('not a product page of this shop'),
      );
      expect(fetcher.asked).toHaveLength(0);
    });

    it.each([
      ['not JSON', '<html>maintenance</html>'],
      ['no price', fixture('shopify-cd.json').replace(/"price":\s*80000,/, '')],
      ['no variants', fixture('shopify-cd.json').replace(/"variants":\s*\[/, '"options_":[')],
    ])('refuses a product it cannot read: %s', async (_case, body) => {
      const { adapter } = rottenBlues({ [`${CD}.js`]: body });

      await expect(adapter.fetchOffer(CD)).rejects.toThrow(
        new ShopPageUnreadable('no product data on the page'),
      );
    });
  });

  describe('the catalog', () => {
    const SITEMAP_1 = `${ORIGIN}/sitemap_products_1.xml?from=10373388796085&to=10373460656309`;
    const SITEMAP_2 = `${ORIGIN}/sitemap_products_2.xml?from=10373460721845&to=10537728671925`;

    it('walks the product sitemaps only, not pages or collections', async () => {
      const { adapter, fetcher } = rottenBlues({
        [`${ORIGIN}/sitemap.xml`]: fixture('shopify-sitemap-index.xml'),
        [SITEMAP_1]: fixture('shopify-sitemap.xml'),
        [SITEMAP_2]: fixture('shopify-sitemap.xml'),
      });

      const batches = await collect(adapter.syncCatalog());

      expect(fetcher.asked).toEqual([`${ORIGIN}/sitemap.xml`, SITEMAP_1, SITEMAP_2]);
      expect(batches[0].map(({ externalId, isVinyl }) => ({ externalId, isVinyl }))).toEqual([
        { externalId: '44471187690', isVinyl: false },
        { externalId: '44104434849', isVinyl: true },
        { externalId: '40802646704', isVinyl: true },
      ]);
      expect(batches[0][0]).toMatchObject({
        url: CD,
        title: '【日版CD】ヨルシカ Yorushika《だから僕は音楽を辞めた》所以我放棄了音樂',
        priceCents: null,
        sourceUpdatedAt: new Date('2026-11-19T09:16:10+08:00'),
      });
    });

    it('every batch is listed by the index', async () => {
      const { adapter } = rottenBlues({
        [`${ORIGIN}/sitemap.xml`]: fixture('shopify-sitemap-index.xml'),
        [SITEMAP_1]: fixture('shopify-sitemap.xml'),
        [SITEMAP_2]: fixture('shopify-sitemap.xml'),
      });

      expect(await listedByIndex(adapter.syncCatalog())).toEqual([true, true]);
    });

    it("an entry's id is its offer's", async () => {
      const { adapter } = rottenBlues({
        [`${ORIGIN}/sitemap.xml`]: fixture('shopify-sitemap-index.xml'),
        [SITEMAP_1]: fixture('shopify-sitemap.xml'),
        [SITEMAP_2]: fixture('shopify-sitemap.xml'),
        [`${CD}.js`]: fixture('shopify-cd.json'),
      });

      const [[entry]] = await collect(adapter.syncCatalog());

      expect((await adapter.fetchOffer(entry.url)).externalId).toBe(entry.externalId);
    });

    it('stops at a sitemap that lists nothing, and at an index with no product sitemaps', async () => {
      const empty = rottenBlues({
        [`${ORIGIN}/sitemap.xml`]: fixture('shopify-sitemap-index.xml'),
        [SITEMAP_1]: '<urlset></urlset>',
      });
      await expect(collect(empty.adapter.syncCatalog())).rejects.toThrow(
        new ShopPageUnreadable('a product sitemap lists nothing'),
      );

      const noProducts = rottenBlues({
        [`${ORIGIN}/sitemap.xml`]: fixture('shopify-sitemap-index.xml').replace(
          /sitemap_products_\d/g,
          'sitemap_pages_9',
        ),
      });
      await expect(collect(noProducts.adapter.syncCatalog())).rejects.toThrow(
        new ShopPageUnreadable('no product sitemaps listed'),
      );
    });
  });

  describe('price and stock, from the list of every product', () => {
    const page = (n: number) => `${ORIGIN}/collections/all?page=${n}`;
    const LIST = fixture('shopify-collection.html');
    const EMPTY = '<html><body><ul id="product-grid"></ul></body></html>';

    const stockOf = async (adapter: ShopifyAdapter) => {
      const pages: ParsedStock[][] = [];
      for await (const batch of adapter.syncStock()) pages.push(batch.entries);
      return pages;
    };

    it('reads each card’s price, and whether the theme marks it sold out', async () => {
      const { adapter, fetcher } = rottenBlues({ [page(1)]: LIST, [page(2)]: EMPTY });

      expect(await stockOf(adapter)).toEqual([
        [
          {
            externalId: 'bd-cd-milet-the-story-of-us-初回生產限定盤-葬送的芙莉蓮第二季ed',
            priceCents: 85_000,
            available: true,
            stockQty: null,
          },
          // Options at more than one price: "從 $420.00 TWD 起", from.
          {
            externalId: 'bd-cd-band-maid-spin-初回生産限定盤-通常盤',
            priceCents: 42_000,
            available: true,
            stockQty: null,
          },
          // The theme's "售罄" badge.
          {
            externalId: 'cd-airiel-winks-kisses-20th-anniversary-deluxe-edition-4cd-box-set',
            priceCents: 199_000,
            available: false,
            stockQty: null,
          },
        ],
      ]);
      expect(fetcher.asked).toEqual([page(1), page(2)]);
    });

    it('ends at a page the same as the one before', async () => {
      const { adapter, fetcher } = rottenBlues({ [page(1)]: LIST, [page(2)]: LIST });

      expect(await stockOf(adapter)).toHaveLength(1);
      expect(fetcher.asked).toEqual([page(1), page(2)]);
    });

    it('refuses a first page with no cards: a changed theme, not an empty shop', async () => {
      const { adapter } = rottenBlues({ [page(1)]: EMPTY });

      await expect(stockOf(adapter)).rejects.toThrow(
        new ShopPageUnreadable('the list of products lists nothing'),
      );
    });
  });

  it('gives the fetcher the shop’s hosts, product pages, sitemaps and list — not /products.json', async () => {
    const { rules } = new ShopifyAdapter(ROTTEN_BLUES);
    const fetch = jest.fn();

    expect(rules).toEqual({
      hosts: ['www.rottenblues.com', 'rottenblues.com'],
      paths: ['/products/', '/sitemap', '/collections/all'],
    });
    // "/products.json" doesn't start with "/products/": refused before sending.
    await expect(
      new ShopFetcher(rules, { fetch }).fetchText(`${ORIGIN}/products.json`),
    ).rejects.toMatchObject({ kind: 'refused' });
    expect(fetch).not.toHaveBeenCalled();
  });
});
