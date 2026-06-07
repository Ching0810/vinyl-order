'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { UpdateProductInput } from '@vinyl-order/shared';

import { updateProduct } from '@/services/api/products/update';
import { productsQueryKey } from '@/services/queries/products/use-products';

/**
 * Update-product mutation. Takes `{ id, input }`; on success invalidates the
 * product list (and any nested detail key) so views refetch the saved row.
 */
export const useUpdateProduct = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateProductInput }) =>
      updateProduct(id, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: productsQueryKey });
    },
  });
};
