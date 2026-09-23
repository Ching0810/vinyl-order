'use client';

import { useMutation } from '@tanstack/react-query';

import { deleteCategory } from '@/services/api/categories/mutations';
import { useCatalogueInvalidation } from '@/services/queries/categories/useCatalogueInvalidation';

/** Remove a category; its product assignments go with it. */
export const useDeleteCategory = () => {
  const onSuccess = useCatalogueInvalidation();

  return useMutation({ mutationFn: deleteCategory, onSuccess });
};
