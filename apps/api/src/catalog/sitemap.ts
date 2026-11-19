/**
 * Reading the shops' sitemaps (tracker.md §7.2). They are machine-written
 * and flat, so each field is read with a pattern that can't backtrack — no
 * nesting to parse.
 */

/** One `<url>` of a product sitemap. */
export interface SitemapProduct {
  loc: string;
  lastmod: string | null;
  imageLoc: string | null;
  imageTitle: string | null;
}

const ENTITIES: Record<string, string> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&apos;': "'",
  '&#039;': "'",
  '&#39;': "'",
};

/** XML text: its entities decoded, and CDATA unwrapped. */
const textOf = (raw: string): string =>
  raw
    .replace(/^<!\[CDATA\[|\]\]>$/g, '')
    .replace(/&(?:amp|lt|gt|quot|apos|#0?39);/g, (entity) => ENTITIES[entity])
    .trim();

const field = (block: string, tag: string): string | null => {
  const match = new RegExp(`<${tag}>([^<]*)</${tag}>`).exec(block);
  return match ? textOf(match[1]) : null;
};

/** The sitemaps a sitemap index lists. */
export const sitemapIndexLocs = (xml: string): string[] =>
  [...xml.matchAll(/<sitemap>([\s\S]*?)<\/sitemap>/g)]
    .map(([, block]) => field(block, 'loc'))
    .filter((loc): loc is string => loc !== null);

/** The products a product sitemap lists, with their first image. */
export const sitemapProducts = (xml: string): SitemapProduct[] =>
  [...xml.matchAll(/<url>([\s\S]*?)<\/url>/g)].flatMap(([, block]) => {
    const loc = field(block, 'loc');
    if (!loc) return [];
    return [
      {
        loc,
        lastmod: field(block, 'lastmod'),
        imageLoc: field(block, 'image:loc'),
        imageTitle: field(block, 'image:title'),
      },
    ];
  });
