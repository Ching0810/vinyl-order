'use client';

import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type { CatalogSearchQuery } from '@vinyl-order/shared';

import { searchCatalog } from '@/services/api/catalog/search';

/** Every catalog search's key starts here, to refetch them all at once. */
export const catalogSearchRootKey = ['catalog', 'search'] as const;

/** Key for one search's albums: its words and filters, each its own entry. */
export const catalogSearchQueryKey = (query: CatalogSearchQuery) =>
  [...catalogSearchRootKey, query] as const;

/**
 * The shops' catalogs searched, as albums. The last albums stay shown while
 * the next search loads, so the list doesn't blank between keystrokes.
 *
 * @param query - words and filters; the words already trimmed
 * @param enabled - false to hold the request, as for words too short to search
 */
export const useCatalogSearch = (query: CatalogSearchQuery, { enabled }: { enabled: boolean }) =>
  useQuery({
    queryKey: catalogSearchQueryKey(query),
    queryFn: () => searchCatalog(query),
    enabled,
    placeholderData: keepPreviousData,
  });
