'use client';

import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type { PageArgs } from '@vinyl-order/shared';

import { getProducts } from '@/services/api/products/list';

/** Base cache key for product lists — shared so mutations can invalidate every page. */
export const productsQueryKey = ['products'] as const;

/**
 * One page of the catalog (cursor-based). `keepPreviousData` keeps the current
 * page on screen while the next/prev page loads, so the table doesn't flash empty.
 */
export const useProducts = (args: PageArgs) =>
  useQuery({
    queryKey: [...productsQueryKey, 'page', args],
    queryFn: () => getProducts(args),
    placeholderData: keepPreviousData,
  });
