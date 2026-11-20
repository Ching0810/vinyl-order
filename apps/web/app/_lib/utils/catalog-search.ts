import type { ListingAvailability, Supplier } from '@vinyl-order/shared';

/** The shops with a copied catalog to search; Candlelight's comes with step 11. */
export const CATALOG_SHOPS: Supplier[] = ['tht', 'cosmic', 'rotten_blues'];

/** Fewer characters match almost everything; the API refuses them too. */
export const MIN_SEARCH_LENGTH = 2;

/** A catalog search as the page's URL holds it, so going back keeps it. */
export interface CatalogSearchState {
  q: string;
  /** One shop, or every shop when undefined. */
  supplier: Supplier | undefined;
  used: boolean;
  nonVinyl: boolean;
}

/**
 * The search a `/search` URL describes. An unknown `?shop=` searches
 * every shop rather than nothing.
 *
 * @param params - the page's search params
 */
export const toCatalogSearchState = (params: URLSearchParams): CatalogSearchState => {
  return {
    q: params.get('q') ?? '',
    supplier: CATALOG_SHOPS.find((shop) => shop === params.get('shop')),
    used: params.get('used') === '1',
    nonVinyl: params.get('nonVinyl') === '1',
  };
};

/** The `/search` URL for a search; empty and off values are left out. */
export const catalogSearchHref = ({ q, supplier, used, nonVinyl }: CatalogSearchState): string => {
  const params = new URLSearchParams();
  if (q) params.set('q', q);
  if (supplier) params.set('shop', supplier);
  if (used) params.set('used', '1');
  if (nonVinyl) params.set('nonVinyl', '1');
  const query = params.toString();
  return query ? `/search?${query}` : '/search';
};

/**
 * A listing's availability as its badge says it. "Unknown" is said, not
 * hidden: a listing no list page or product page has read yet — one added
 * since the last stock walk — isn't guessed in stock.
 */
export const AVAILABILITY_BADGE: Record<ListingAvailability, { label: string; palette: string }> = {
  in_stock: { label: 'In stock', palette: 'green' },
  pre_order: { label: 'Pre-order', palette: 'blue' },
  sold_out: { label: 'Sold out', palette: 'gray' },
  unknown: { label: 'Unknown', palette: 'gray' },
};
