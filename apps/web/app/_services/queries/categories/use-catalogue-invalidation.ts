'use client';

import { useQueryClient } from '@tanstack/react-query';

import { categoriesQueryKey } from '@/services/queries/categories/use-categories';
import { productsQueryKey } from '@/services/queries/products/use-products';

/**
 * Category writes all invalidate the same two things: the tab list, and the
 * product queries — a renamed or deleted category changes what the filtered
 * catalogue returns, and a deletion cascades its assignments.
 */
export const useCatalogueInvalidation = () => {
  const queryClient = useQueryClient();

  return () => {
    void queryClient.invalidateQueries({ queryKey: categoriesQueryKey });
    void queryClient.invalidateQueries({ queryKey: productsQueryKey });
  };
};
