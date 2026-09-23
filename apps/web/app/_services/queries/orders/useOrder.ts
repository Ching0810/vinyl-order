'use client';

import { useQuery } from '@tanstack/react-query';

import { getOrder } from '@/services/api/orders/detail';
import { useMe } from '@/services/queries/auth/useMe';
import { ordersQueryKey } from '@/services/queries/orders/useOrders';

/** Cache key for one order — under the orders root, beside the history pages. */
export const orderQueryKey = (id: string) => [...ordersQueryKey, id] as const;

/**
 * One order with every line. A 404 is final (not someone's order, or no such
 * order), so it isn't retried.
 */
export const useOrder = (id: string) => {
  const { data: user } = useMe();

  return useQuery({
    queryKey: orderQueryKey(id),
    queryFn: () => getOrder(id),
    enabled: Boolean(user),
    retry: false,
  });
};
