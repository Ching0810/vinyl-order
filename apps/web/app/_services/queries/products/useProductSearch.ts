'use client';

import { useQuery } from '@tanstack/react-query';

import { searchProducts } from '@/services/api/products/search';
import { productsQueryKey } from '@/services/queries/products/useProducts';

/**
 * Key for one search term's results — under the catalogue's, so a product
 * change that refreshes the catalogue refreshes searches too, and every
 * caller searching the same term shares one cache entry.
 */
export const productSearchQueryKey = (term: string) =>
  [...productsQueryKey, 'search', term] as const;

/**
 * Catalogue search by title or artist.
 *
 * Whether to search at all is the caller's: the storefront box waits for a
 * term, while a product page's related list always has its artist.
 *
 * @param term - what to search for, already trimmed
 * @param enabled - false to hold the request
 */
export const useProductSearch = (term: string, { enabled = true }: { enabled?: boolean } = {}) =>
  useQuery({
    queryKey: productSearchQueryKey(term),
    queryFn: () => searchProducts(term),
    enabled,
  });
