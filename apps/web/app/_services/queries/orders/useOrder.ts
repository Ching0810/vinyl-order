'use client';

import { useQuery } from '@tanstack/react-query';
import type { Order } from '@vinyl-order/shared';

import { getOrder } from '@/services/api/orders/detail';
import { useMe } from '@/services/queries/auth/useMe';
import { ordersQueryKey } from '@/services/queries/orders/useOrders';

/** Cache key for one order — under the orders root, beside the history pages. */
export const orderQueryKey = (id: string) => [...ordersQueryKey, id] as const;

/**
 * How often to look again once the deadline has passed. The expiry sweep runs
 * every minute, so this sees the order cancelled soon after it happens.
 */
const SETTLE_POLL_MS = 10_000;

/**
 * When to fetch a pending order again: once, just after its payment deadline,
 * and then every few seconds until the server settles it. The page never
 * decides on its own that an order expired — it waits for the server to say so.
 * Any other status is final as far as this page is concerned.
 */
const refetchInterval = (order: Order | undefined): number | false => {
  if (order?.status !== 'pending') return false;
  const untilDeadline = Date.parse(order.expiresAt) - Date.now();
  return untilDeadline > 0 ? untilDeadline + 1_000 : SETTLE_POLL_MS;
};

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
    refetchInterval: (query) => refetchInterval(query.state.data),
  });
};
