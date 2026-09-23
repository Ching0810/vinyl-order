'use client';

import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type { PageArgs } from '@vinyl-order/shared';

import { getOrders } from '@/services/api/orders/list';
import { sessionQueryKey, useMe } from '@/services/queries/auth/useMe';

/**
 * Root key for the signed-in user's orders — under the session root, so a
 * change of user clears them along with the cart.
 */
export const ordersQueryKey = [...sessionQueryKey, 'orders'] as const;

/** Every page of the history, so a new order can refresh all of them at once. */
export const orderPagesQueryKey = [...ordersQueryKey, 'page'] as const;

/**
 * One page of the order history. Gated on being signed in, like the cart —
 * the route is guarded, so asking while logged out would only 401.
 * `keepPreviousData` holds the current page on screen while the next loads.
 */
export const useOrders = (args: PageArgs) => {
  const { data: user } = useMe();

  return useQuery({
    queryKey: [...orderPagesQueryKey, args],
    queryFn: () => getOrders(args),
    enabled: Boolean(user),
    placeholderData: keepPreviousData,
  });
};
