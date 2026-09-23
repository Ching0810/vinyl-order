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
export const useProducts = (args: PageArgs, category?: string) =>
  useQuery({
    // category is part of the key, so switching tabs is a different cache
    // entry rather than the same one being overwritten.
    queryKey: [...productsQueryKey, 'page', category ?? null, args],
    queryFn: () => getProducts(args, category),
    placeholderData: keepPreviousData,
  });
