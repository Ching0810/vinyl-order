'use client';

import { useQuery } from '@tanstack/react-query';

import { getSlideProducts } from '@/services/api/products/slides';

import { productsQueryKey } from './use-products';

/** Cache key for the carousel list — shared so admin mutations can invalidate it. */
export const slideProductsQueryKey = [...productsQueryKey, 'slides'] as const;

/** Products featured in the hero carousel, in display order. */
export const useSlideProducts = () =>
  useQuery({
    queryKey: slideProductsQueryKey,
    queryFn: getSlideProducts,
  });
