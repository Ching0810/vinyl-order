'use client';

import { useMutation } from '@tanstack/react-query';

import { searchDiscogs } from '@/services/api/admin/discogs';

/**
 * Discogs search as a mutation (not a query): it's user-triggered on submit, not
 * keyed reactive state. `mutate(q)` runs the search; `data` holds the results.
 */
export const useDiscogsSearch = () =>
  useMutation({
    mutationFn: (q: string) => searchDiscogs(q),
  });
