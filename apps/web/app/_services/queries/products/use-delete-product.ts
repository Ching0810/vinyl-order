'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';

import { deleteProduct } from '@/services/api/products/remove';
import { productsQueryKey } from '@/services/queries/products/use-products';

/** Delete-product mutation. Invalidates the list so the row disappears. */
export const useDeleteProduct = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: deleteProduct,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: productsQueryKey });
    },
  });
};
