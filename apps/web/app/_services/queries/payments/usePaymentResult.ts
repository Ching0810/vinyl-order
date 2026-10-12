'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';

import { getPaymentResult } from '@/services/api/payments/result';
import { useMe } from '@/services/queries/auth/useMe';
import { orderQueryKey } from '@/services/queries/orders/useOrder';
import { orderPagesQueryKey } from '@/services/queries/orders/useOrders';

/** How often to ask again while the payment is pending. */
const POLL_MS = 2_000;

/**
 * How long to keep asking. Results usually arrive within seconds; one still
 * missing after this is a longer delay (a provider retrying, say), which more
 * polling would not speed up — so the page stops and offers to look again.
 */
const POLL_FOR_MS = 30_000;

/** Cache key for one payment attempt, under its order's key. */
export const paymentResultQueryKey = (orderId: string, paymentId: string) =>
  [...orderQueryKey(orderId), 'payments', paymentId] as const;

/**
 * One payment attempt's result, polled while it is pending
 * (docs/design/payments.md §9.1).
 *
 * Only the provider's webhook settles a payment, and it travels separately
 * from the customer's redirect, so the customer is usually back first. This
 * asks every two seconds until the payment leaves `pending`, for at most
 * thirty; `timedOut` then says it is still unknown, not that it failed.
 *
 * Once settled, the order's own detail and the history pages are refreshed,
 * so they show the new status straight away. A 404 is final, so not retried.
 *
 * @param orderId - the order, from the URL
 * @param paymentId - the attempt, from the URL the provider returned to
 */
export const usePaymentResult = (orderId: string, paymentId: string) => {
  const { data: user } = useMe();
  const queryClient = useQueryClient();
  const [timedOut, setTimedOut] = useState(false);

  // Polling stops at the deadline, so no new data would redraw the page then;
  // this timer is what does.
  useEffect(() => {
    const timer = setTimeout(() => setTimedOut(true), POLL_FOR_MS);
    return () => clearTimeout(timer);
  }, []);

  const query = useQuery({
    queryKey: paymentResultQueryKey(orderId, paymentId),
    queryFn: () => getPaymentResult(orderId, paymentId),
    enabled: Boolean(user),
    retry: false,
    refetchInterval: (current) =>
      current.state.data?.status === 'pending' && !timedOut ? POLL_MS : false,
  });

  const settledStatus = query.data?.status === 'pending' ? null : query.data?.status;
  useEffect(() => {
    if (!settledStatus) return;
    // exact: this payment's key sits under the order's, and a prefix match
    // would refetch this query too.
    void queryClient.invalidateQueries({ queryKey: orderQueryKey(orderId), exact: true });
    void queryClient.invalidateQueries({ queryKey: orderPagesQueryKey });
  }, [settledStatus, orderId, queryClient]);

  return { ...query, timedOut };
};
