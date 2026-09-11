'use client';

import { useQuery } from '@tanstack/react-query';

import { getCategories } from '@/services/api/categories/list';

/** Cache key for the tab list — shared so admin edits can invalidate it. */
export const categoriesQueryKey = ['categories'] as const;

/**
 * Storefront navigation tabs. Rendered in the header on every page, and the
 * list changes rarely, so it is left to React Query's cache rather than
 * refetched per route.
 */
export const useCategories = () =>
  useQuery({
    queryKey: categoriesQueryKey,
    queryFn: getCategories,
    staleTime: 5 * 60 * 1000,
  });
