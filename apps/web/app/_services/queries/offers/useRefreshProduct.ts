'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';

import { refreshProduct } from '@/services/api/offers/refresh';
import { productOffersQueryKey } from '@/services/queries/offers/useProductOffers';
import { watchesQueryKey } from '@/services/queries/watches/useTrackListing';

/**
 * A record read again from the shops. On success its comparison is the
 * answer, and the user's list is refetched — its prices may have moved. A
 * 429 is the caller's to say (retryAfterSecondsOf).
 */
export const useRefreshProduct = (productId: string) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => refreshProduct(productId),
    onSuccess: async (product) => {
      queryClient.setQueryData(productOffersQueryKey(productId), product);
      await queryClient.invalidateQueries({ queryKey: watchesQueryKey });
    },
  });
};
