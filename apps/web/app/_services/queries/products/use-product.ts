'use client';

import { useQuery } from '@tanstack/react-query';

import { getProduct } from '@/services/api/products/detail';
import { productsQueryKey } from '@/services/queries/products/use-products';

/** Cache key for a single product — nested under the list key so both invalidate together. */
export const productQueryKey = (id: string) => [...productsQueryKey, id] as const;

/** Loads one product by id (e.g. to prefill the edit form). */
export const useProduct = (id: string) =>
  useQuery({
    queryKey: productQueryKey(id),
    queryFn: () => getProduct(id),
  });
