'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';

import { putBackListing, splitListing } from '@/services/api/catalog/album-splits';
import { catalogSearchRootKey } from '@/services/queries/catalog/useCatalogSearch';
import { watchesQueryKey } from '@/services/queries/watches/useTrackListing';

/**
 * Split a listing out of its album, or put it back — the admin's, for
 * everyone (tracker.md §7.3). Searches are refetched for the new albums;
 * the records' comparisons and the user's list too, as an offer may have
 * moved to a record of its own, or back.
 */
export const useToggleAlbumSplit = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ catalogEntryId, split }: { catalogEntryId: string; split: boolean }) =>
      split ? splitListing(catalogEntryId) : putBackListing(catalogEntryId),
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: catalogSearchRootKey }),
        queryClient.invalidateQueries({ queryKey: ['products'] }),
        queryClient.invalidateQueries({ queryKey: watchesQueryKey }),
      ]),
  });
};
