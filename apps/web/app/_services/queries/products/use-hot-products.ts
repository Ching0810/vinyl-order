'use client';

import { useQuery } from '@tanstack/react-query';

import { getHotProducts } from '@/services/api/products/hot';

import { productsQueryKey } from './use-products';

/** Cache key for the hot list — shared so admin mutations can invalidate it. */
export const hotProductsQueryKey = [...productsQueryKey, 'hot'] as const;

/**
 * Products featured in the storefront "hot" section.
 *
 * @param limit - how many the section shows; part of the cache key, so two
 *   sizes are two entries rather than one overwriting the other
 */
export const useHotProducts = (limit: number) =>
  useQuery({
    queryKey: [...hotProductsQueryKey, limit],
    queryFn: () => getHotProducts(limit),
  });
