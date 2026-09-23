'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { Cart } from '@vinyl-order/shared';

import { cartQueryKey } from '@/services/queries/cart/useCart';

/**
 * The shape every cart write shares.
 *
 * Each one responds with the whole cart, so the result is written straight
 * into the cache rather than invalidating and refetching. That saves a round
 * trip and, more usefully, removes the window where a settled mutation and a
 * not-yet-refetched query disagree — the gap that made rows flash back on the
 * carousel screen.
 *
 * @param mutationFn - the cart call to run
 */
export const useCartWrite = <TArgs>(mutationFn: (args: TArgs) => Promise<Cart>) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn,
    onSuccess: (cart) => queryClient.setQueryData(cartQueryKey, cart),
  });
};
