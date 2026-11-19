import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { COSMIC, EasyStoreAdapter, THT } from '../src/catalog/easystore-adapter';
import { ShopFetcher } from '../src/catalog/shop-fetcher';
import type { ParsedCatalogEntry } from '../src/catalog/supplier-adapter';
import { ShopPageUnreadable } from '../src/catalog/supplier-adapter';

/**
 * The EasyStore adapter, for THT and Cosmic (docs/design/tracker.md §6):
 * product pages into offers, product sitemaps into catalog entries.
 *
 * The fixtures are the shops' public pages and sitemaps (2026-11-19),
 * trimmed to what is read. A fake fetch answers from them, so nothing here
 * reaches a shop. Pure, no app: kept as an e2e spec only because CI runs
 * those.
 */

const fixture = (name: string): string =>
  readFileSync(resolve(__dirname, 'fixtures/shops', name), 'utf8');

const TODAY = '2026-11-19';

const THT_IN_STOCK = 'https://www.thtrecords.com/products/山本剛-daahoud-lp';
const THT_PRE_ORDER =
  'https://www.thtrecords.com/products/grey-october-sound-late-night-lo-fi-2-lp-2027-2-17發行預訂-';
const COSMIC_PAGE =
  'https://www.cosmicmusicrecord.com/products/-wham-last-christmas-代購-黑膠唱片-lp';

/** A fetcher that answers from fixtures, keyed by the URL as fetched. */
const fakeFetcher = (pages: Record<string, string>) => {
  const byHref = Object.fromEntries(
    Object.entries(pages).map(([url, body]) => [new URL(url).href, body]),
  );
  const asked: string[] = [];
  return {
    asked,
    fetchText: (url: string) => {
      asked.push(url);
      const body = byHref[url];
      return body === undefined
        ? Promise.reject(new Error(`no fixture for ${url}`))
        : Promise.resolve(body);
    },
  };
};

const tht = (pages: Record<string, string>) => {
  const fetcher = fakeFetcher(pages);
  return { adapter: new EasyStoreAdapter(THT, { fetcher, today: () => TODAY }), fetcher };
};

const collect = async (entries: AsyncIterable<ParsedCatalogEntry[]>) => {
  const batches: ParsedCatalogEntry[][] = [];
  for await (const batch of entries) batches.push(batch);
  return batches;
};

describe('EasyStore adapter (e2e)', () => {
  describe('a product page', () => {
    it('in stock, counted', async () => {
      const { adapter } = tht({ [THT_IN_STOCK]: fixture('easystore-tht-in-stock.html') });

      expect(await adapter.fetchOffer(THT_IN_STOCK)).toEqual({
        externalId: '山本剛-daahoud-lp',
        url: new URL(THT_IN_STOCK).href,
        sourceTitle: '山本剛 - Daahoud LP',
        priceCents: 118_000,
        currency: 'TWD',
        availability: 'in_stock',
        stockQty: 1,
        expectedAt: null,
        expectedNote: null,
        barcode: null,
        imageUrl: 'https://cdn.store-assets.com/s/270153/i/113461475.jpeg',
        title: 'Daahoud',
        artistNames: ['山本剛'],
        format: 'LP',
        edition: null,
        isVinyl: true,
        isUsed: false,
      });
    });

    it('a pre-order: from its title, with no count and its release day', async () => {
      const { adapter } = tht({ [THT_PRE_ORDER]: fixture('easystore-tht-pre-order.html') });

      expect(await adapter.fetchOffer(THT_PRE_ORDER)).toMatchObject({
        priceCents: 98_000,
        // The page says InStock; the title says 發行預訂.
        availability: 'pre_order',
        // "infinite_stock": the shop doesn't count it.
        stockQty: null,
        expectedAt: '2027-02-17',
        expectedNote: '2027/2/17發行預訂',
        format: '2LP',
      });
    });

    it("Cosmic: the same platform, a pre-order by its option's name", async () => {
      const fetcher = fakeFetcher({ [COSMIC_PAGE]: fixture('easystore-cosmic.html') });
      const adapter = new EasyStoreAdapter(COSMIC, { fetcher, today: () => TODAY });

      expect(await adapter.fetchOffer(COSMIC_PAGE)).toMatchObject({
        externalId: '-wham-last-christmas-代購-黑膠唱片-lp',
        sourceTitle: 'WHAM! - Last Christmas 【雪花片膠｜代購】（黑膠唱片 LP）',
        priceCents: 299_000,
        // Option "預購, LP".
        availability: 'pre_order',
        stockQty: 5,
        title: 'Last Christmas',
        artistNames: ['WHAM!'],
        edition: '雪花片膠',
        format: 'LP',
      });
    });

    it('sold out when no option can be bought', async () => {
      const html = fixture('easystore-tht-in-stock.html').replace(
        '"available":true',
        '"available":false',
      );
      const { adapter } = tht({ [THT_IN_STOCK]: html });

      expect((await adapter.fetchOffer(THT_IN_STOCK)).availability).toBe('sold_out');
    });

    it('a barcode when the shop fills one', async () => {
      const html = fixture('easystore-tht-in-stock.html').replace(
        '"barcode":null',
        '"barcode":"852428007792"',
      );
      const { adapter } = tht({ [THT_IN_STOCK]: html });

      expect((await adapter.fetchOffer(THT_IN_STOCK)).barcode).toBe('852428007792');
    });

    it('fetches the page at its canonical address, whatever was pasted', async () => {
      const { adapter, fetcher } = tht({ [THT_IN_STOCK]: fixture('easystore-tht-in-stock.html') });

      await adapter.fetchOffer('https://thtrecords.com/products/山本剛-daahoud-lp/?ref=x#top');

      expect(fetcher.asked).toEqual([new URL(THT_IN_STOCK).href]);
    });

    it.each([
      ['another shop', 'https://www.cosmicmusicrecord.com/products/x'],
      ['not a product page', 'https://www.thtrecords.com/collections/all'],
      ['below a product page', 'https://www.thtrecords.com/products/x/reviews'],
      ['not a URL', 'thtrecords.com/products/x'],
    ])('refuses %s without fetching', async (_case, url) => {
      const { adapter, fetcher } = tht({});

      await expect(adapter.fetchOffer(url)).rejects.toThrow(
        new ShopPageUnreadable('not a product page of this shop'),
      );
      expect(fetcher.asked).toHaveLength(0);
    });

    describe('a page it cannot read is refused, not read with gaps', () => {
      it.each([
        [
          'no JSON-LD',
          (html: string) => html.replace('application/ld+json', 'text/plain'),
          'no product data on the page',
        ],
        [
          'no price',
          (html: string) => html.replace('"price":1180,', ''),
          'no product data on the page',
        ],
        [
          'an unknown availability',
          (html: string) => html.replace('https://schema.org/InStock', 'InStock'),
          'no product data on the page',
        ],
        [
          'no variants',
          (html: string) => html.replace('variants = [', 'options = ['),
          'no variants on the page',
        ],
        [
          'variants without stock',
          (html: string) => html.replace('"infinite_stock":false,', ''),
          'variants not as expected',
        ],
      ])('%s', async (_case, change, message) => {
        const { adapter } = tht({ [THT_IN_STOCK]: change(fixture('easystore-tht-in-stock.html')) });

        await expect(adapter.fetchOffer(THT_IN_STOCK)).rejects.toThrow(
          new ShopPageUnreadable(message),
        );
      });
    });
  });

  describe('the catalog', () => {
    const index = fixture('easystore-sitemap-index.xml');
    const SITEMAP_1 = 'https://www.thtrecords.com/sitemap_products_1.xml';
    const SITEMAP_2 = 'https://www.thtrecords.com/sitemap_products_2.xml';

    it('walks the sitemap index, a file at a time', async () => {
      const { adapter, fetcher } = tht({
        'https://www.thtrecords.com/sitemap_products.xml': index,
        [SITEMAP_1]: fixture('easystore-sitemap-tht.xml'),
        [SITEMAP_2]: fixture('easystore-sitemap-tht.xml'),
      });

      const batches = await collect(adapter.syncCatalog());

      expect(fetcher.asked).toEqual([
        'https://www.thtrecords.com/sitemap_products.xml',
        SITEMAP_1,
        SITEMAP_2,
      ]);
      expect(batches).toHaveLength(2);
      expect(batches[0]).toEqual([
        {
          externalId: '山本剛-daahoud-lp',
          url: 'https://www.thtrecords.com/products/山本剛-daahoud-lp',
          title: '山本剛 - Daahoud LP',
          imageUrl: 'https://cdn.store-assets.com/s/270153/i/113461475.jpeg?width=480',
          priceCents: null,
          isVinyl: true,
          isUsed: false,
          sourceUpdatedAt: new Date('2026-11-18T08:05:17Z'),
        },
        expect.objectContaining({
          externalId: 'grey-october-sound-late-night-lo-fi-2-lp-2027-2-17發行預訂-',
          isVinyl: true,
        }),
      ]);
    });

    it("an entry's id is its offer's, so the two can be matched", async () => {
      const { adapter } = tht({
        'https://www.thtrecords.com/sitemap_products.xml': index.replace(
          /<sitemap>\s*<loc>[^<]*_2\.xml[\s\S]*?<\/sitemap>/,
          '',
        ),
        [SITEMAP_1]: fixture('easystore-sitemap-tht.xml'),
        [THT_IN_STOCK]: fixture('easystore-tht-in-stock.html'),
      });

      const [[entry]] = await collect(adapter.syncCatalog());
      const offer = await adapter.fetchOffer(entry.url);

      expect(offer.externalId).toBe(entry.externalId);
    });

    it('Cosmic: decodes the names, and flags a CD and a calendar as not vinyl', async () => {
      const fetcher = fakeFetcher({
        'https://www.cosmicmusicrecord.com/sitemap_products.xml': index.replaceAll(
          'www.thtrecords.com',
          'www.cosmicmusicrecord.com',
        ),
        'https://www.cosmicmusicrecord.com/sitemap_products_1.xml': fixture(
          'easystore-sitemap-cosmic.xml',
        ),
        'https://www.cosmicmusicrecord.com/sitemap_products_2.xml': fixture(
          'easystore-sitemap-cosmic.xml',
        ),
      });
      const adapter = new EasyStoreAdapter(COSMIC, { fetcher, today: () => TODAY });

      const [batch] = await collect(adapter.syncCatalog());

      expect(batch.map(({ title, isVinyl }) => ({ title, isVinyl }))).toEqual([
        { title: "Barbara Acklin - Someone Else's Arms【日盤】（CD）", isVinyl: false },
        {
          title: "鄭彩娟 JUNG CHAE YEON - 2027 SEASON'S GREETINGS【TIMELESS】（年曆）",
          isVinyl: false,
        },
      ]);
    });

    it('stops at a sitemap that lists nothing, rather than look empty', async () => {
      const { adapter } = tht({
        'https://www.thtrecords.com/sitemap_products.xml': index,
        [SITEMAP_1]: '<urlset></urlset>',
      });

      await expect(collect(adapter.syncCatalog())).rejects.toThrow(
        new ShopPageUnreadable('a product sitemap lists nothing'),
      );
    });

    it('stops at an index that lists no sitemaps', async () => {
      const { adapter } = tht({
        'https://www.thtrecords.com/sitemap_products.xml': '<sitemapindex/>',
      });

      await expect(collect(adapter.syncCatalog())).rejects.toThrow(
        new ShopPageUnreadable('no product sitemaps listed'),
      );
    });
  });

  it("gives the fetcher the shop's hosts, product pages and sitemaps — nothing else", async () => {
    const { rules } = new EasyStoreAdapter(THT);
    const fetch = jest.fn();

    expect(rules).toEqual({
      hosts: ['www.thtrecords.com', 'thtrecords.com'],
      paths: ['/products/', '/sitemap_products'],
    });
    // robots.txt forbids search; the fetcher refuses it before sending.
    await expect(
      new ShopFetcher(rules, { fetch }).fetchText('https://www.thtrecords.com/search?q=x'),
    ).rejects.toMatchObject({ kind: 'refused' });
    expect(fetch).not.toHaveBeenCalled();
  });
});
