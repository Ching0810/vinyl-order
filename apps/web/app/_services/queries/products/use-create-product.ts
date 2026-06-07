'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';

import { createProduct } from '@/services/api/products/create';
import { productsQueryKey } from '@/services/queries/products/use-products';

/** Create-product mutation. Invalidates the list so it refetches with the new row. */
export const useCreateProduct = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: createProduct,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: productsQueryKey });
    },
  });
};
