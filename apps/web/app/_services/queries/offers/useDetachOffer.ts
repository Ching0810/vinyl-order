'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';

import { detachOffer } from '@/services/api/offers/detach';
import { productOffersQueryKey } from '@/services/queries/offers/useProductOffers';
import { watchesQueryKey } from '@/services/queries/watches/useTrackListing';

/** A wrong match taken off a record (admin); its comparison and lists refetched. */
export const useDetachOffer = (productId: string) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: detachOffer,
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: productOffersQueryKey(productId) }),
        queryClient.invalidateQueries({ queryKey: watchesQueryKey }),
      ]),
  });
};
