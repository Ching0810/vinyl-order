'use client';

import { useMutation } from '@tanstack/react-query';

import { createCategory } from '@/services/api/categories/mutations';
import { useCatalogueInvalidation } from '@/services/queries/categories/useCatalogueInvalidation';

/** Add a storefront category. */
export const useCreateCategory = () => {
  const onSuccess = useCatalogueInvalidation();

  return useMutation({ mutationFn: createCategory, onSuccess });
};
