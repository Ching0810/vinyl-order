/**
 * The records a shop features on its home page, read from the page's HTML
 * (tracker.md §7.2): its slideshow, or the rows of products it picks. What
 * the shop itself puts first — the home page's popular section is made of
 * these. Each reader gives handles in the page's order, once each.
 *
 * Themes change; a reader that finds nothing makes the page unreadable, and
 * the sync keeps the last picks.
 */

/** A product link, absolute or not, perhaps under a collection. */
const PRODUCT_LINK =
  /href="(?:https:\/\/([^/"]+))?(?:\/collections\/[^/"]+)?\/products\/([^"?#/]+)/g;

/**
 * The products a stretch of HTML links to, in order, once each; a link to
 * another host — or one not percent-decodable — skipped.
 *
 * @param hosts - the shop's hosts, for absolute links
 */
export const productHandlesIn = (html: string, hosts: readonly string[]): string[] => {
  const handles: string[] = [];
  for (const [, host, handle] of html.matchAll(PRODUCT_LINK)) {
    if (host !== undefined && !hosts.includes(host)) continue;
    let decoded: string;
    try {
      decoded = decodeURIComponent(handle);
    } catch {
      continue;
    }
    if (!handles.includes(decoded)) handles.push(decoded);
  }
  return handles;
};

/**
 * A slideshow's slides, each its first link, if that is a product — a
 * slide may link to a collection or a search. EasyStore's slider: a
 * `splide__list` of `splide__slide`s.
 */
export const slideshowHandles = (html: string, hosts: readonly string[]): string[] => {
  const start = html.indexOf('<ul class="splide__list">');
  if (start === -1) return [];
  const list = html.slice(start, html.indexOf('</ul>', start));
  return list
    .split(/<li[^>]*class="splide__slide"[^>]*>/)
    .slice(1)
    .flatMap((slide) => {
      const first = /href="([^"]+)"/.exec(slide)?.[0] ?? '';
      return productHandlesIn(first, hosts);
    });
};

/** The products between a heading reading `heading` and the next heading. */
export const handlesUnderHeading = (
  html: string,
  heading: string,
  hosts: readonly string[],
): string[] => {
  const at = new RegExp(`<h2[^>]*>\\s*${escapeRegExp(heading)}\\s*<`).exec(html);
  if (!at) return [];
  const rest = html.slice(at.index + at[0].length);
  const next = rest.search(/<h2[\s>]/);
  return productHandlesIn(next === -1 ? rest : rest.slice(0, next), hosts);
};

/**
 * The products of a Shopify home page's first `count` featured-collection
 * sections, in order: the rows the shop picks. A section runs to the next
 * section's start.
 */
export const featuredSectionHandles = (
  html: string,
  count: number,
  hosts: readonly string[],
): string[] => {
  const starts = [...html.matchAll(/<\w+[^>]*id="shopify-section-[^"]+__([^"]+)"/g)].map(
    (match) => ({ at: match.index, name: match[1] }),
  );
  return starts
    .flatMap((section, index) =>
      section.name.startsWith('featured_collection')
        ? [html.slice(section.at, starts[index + 1]?.at ?? html.length)]
        : [],
    )
    .slice(0, count)
    .flatMap((section) => productHandlesIn(section, hosts))
    .filter((handle, index, all) => all.indexOf(handle) === index);
};

const escapeRegExp = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
