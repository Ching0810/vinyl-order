'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { CreateCategoryInput, UpdateCategoryInput } from '@vinyl-order/shared';

import {
  createCategory,
  deleteCategory,
  updateCategory,
} from '@/services/api/categories/mutations';
import { categoriesQueryKey } from '@/services/queries/categories/use-categories';
import { productsQueryKey } from '@/services/queries/products/use-products';

/**
 * Category writes all invalidate the same two things: the tab list, and the
 * product queries — a renamed or deleted category changes what the filtered
 * catalogue returns, and a deletion cascades its assignments.
 */
const useInvalidate = () => {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: categoriesQueryKey });
    void queryClient.invalidateQueries({ queryKey: productsQueryKey });
  };
};

export const useCreateCategory = () => {
  const onSuccess = useInvalidate();
  return useMutation({ mutationFn: createCategory, onSuccess });
};

export const useUpdateCategory = () => {
  const onSuccess = useInvalidate();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateCategoryInput }) =>
      updateCategory(id, input),
    onSuccess,
  });
};

export const useDeleteCategory = () => {
  const onSuccess = useInvalidate();
  return useMutation({ mutationFn: deleteCategory, onSuccess });
};

export type { CreateCategoryInput };
