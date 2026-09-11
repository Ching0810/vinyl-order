'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { Cart } from '@vinyl-order/shared';

import {
  addCartItem,
  clearCart,
  removeCartItem,
  updateCartItem,
} from '@/services/api/cart/mutations';
import { cartQueryKey } from '@/services/queries/cart/use-cart';

/**
 * Every cart write responds with the whole cart, so the result is written
 * straight into the cache rather than invalidating and refetching. That saves
 * a round trip and, more usefully, removes the window where a settled mutation
 * and a not-yet-refetched query disagree — the gap that made rows flash back
 * on the carousel screen.
 */
const useCartWrite = <TArgs>(mutationFn: (args: TArgs) => Promise<Cart>) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn,
    onSuccess: (cart) => queryClient.setQueryData(cartQueryKey, cart),
  });
};

export const useAddCartItem = () => useCartWrite(addCartItem);

export const useUpdateCartItem = () =>
  useCartWrite(({ productId, quantity }: { productId: string; quantity: number }) =>
    updateCartItem(productId, quantity),
  );

export const useRemoveCartItem = () => useCartWrite(removeCartItem);

export const useClearCart = () => useCartWrite(() => clearCart());
