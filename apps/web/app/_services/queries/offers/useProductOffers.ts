'use client';

import { useQuery } from '@tanstack/react-query';

import { HttpError } from '@/lib/core/http';
import { getProductOffers } from '@/services/api/offers/product-offers';

/** Key for one record's comparison. */
export const productOffersQueryKey = (productId: string) =>
  ['products', productId, 'offers'] as const;

/**
 * A record's comparison. A 404 — a record that isn't tracked, the demo
 * store's own — isn't retried: the page shows it as before, at once.
 */
export const useProductOffers = (productId: string) =>
  useQuery({
    queryKey: productOffersQueryKey(productId),
    queryFn: () => getProductOffers(productId),
    retry: (failures, error) =>
      !(error instanceof HttpError && error.status === 404) && failures < 3,
  });
