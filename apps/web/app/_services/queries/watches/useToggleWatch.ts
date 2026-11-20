'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';

import { unwatchOffer, watchOffer } from '@/services/api/watches/watch-offer';
import { catalogSearchRootKey } from '@/services/queries/catalog/useCatalogSearch';
import { watchesQueryKey } from '@/services/queries/watches/useTrackListing';

/**
 * Track or stop tracking a version from its record's comparison. The user's
 * list and searches are refetched after: they say which versions are theirs.
 */
export const useToggleWatch = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ offerId, watch }: { offerId: string; watch: boolean }) =>
      watch ? watchOffer(offerId) : unwatchOffer(offerId),
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: watchesQueryKey }),
        queryClient.invalidateQueries({ queryKey: catalogSearchRootKey }),
      ]),
  });
};
