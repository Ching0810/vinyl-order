'use client';

import { useQuery } from '@tanstack/react-query';

import { getCart } from '@/services/api/cart/get';
import { sessionQueryKey, useMe } from '@/services/queries/auth/useMe';

/** Cache key for the signed-in user's cart — under the session root, so a change of user clears it. */
export const cartQueryKey = [...sessionQueryKey, 'cart'] as const;

/**
 * The current user's cart.
 *
 * Gated on being signed in: the cart routes are all guarded, so firing this
 * while logged out would 401 on every page for no reason. An absent session
 * simply means no cart, which the header and cart page render as empty.
 */
export const useCart = () => {
  const { data: user } = useMe();

  return useQuery({
    queryKey: cartQueryKey,
    queryFn: getCart,
    enabled: Boolean(user),
  });
};
