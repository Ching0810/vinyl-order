'use client';

import { useQuery } from '@tanstack/react-query';

import { getHotProducts } from '@/services/api/products/hot';

import { productsQueryKey } from './use-products';

/** Cache key for the hot list — shared so admin mutations can invalidate it. */
export const hotProductsQueryKey = [...productsQueryKey, 'hot'] as const;

/** Products featured in the storefront "hot" section. */
export const useHotProducts = () =>
  useQuery({
    queryKey: hotProductsQueryKey,
    queryFn: getHotProducts,
  });
