'use client';

import { useMutation } from '@tanstack/react-query';
import type { UpdateCategoryInput } from '@vinyl-order/shared';

import { updateCategory } from '@/services/api/categories/mutations';
import { useCatalogueInvalidation } from '@/services/queries/categories/useCatalogueInvalidation';

/** Rename a category, or move it in the tab bar. */
export const useUpdateCategory = () => {
  const onSuccess = useCatalogueInvalidation();

  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateCategoryInput }) =>
      updateCategory(id, input),
    onSuccess,
  });
};
