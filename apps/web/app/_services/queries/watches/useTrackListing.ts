'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';

import { trackListing } from '@/services/api/watches/track';
import { catalogSearchRootKey } from '@/services/queries/catalog/useCatalogSearch';

/** Key for the signed-in user's tracked listings (the home page's list). */
export const watchesQueryKey = ['watches'] as const;

/**
 * Track a listing — one version of an album at one shop. On success the
 * user's list is refetched, and so are searches: the listing now says
 * "Tracking". On failure the caller reads the refusal's code
 * (offerErrorCode) to say what's next.
 */
export const useTrackListing = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: trackListing,
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: watchesQueryKey }),
        queryClient.invalidateQueries({ queryKey: catalogSearchRootKey }),
      ]),
  });
};
