'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';

import { HttpError } from '@/lib/core/http';
import { cancelOrder } from '@/services/api/orders/cancel';
import { orderQueryKey } from '@/services/queries/orders/useOrder';
import { orderPagesQueryKey } from '@/services/queries/orders/useOrders';
import { productsQueryKey } from '@/services/queries/products/useProducts';

/**
 * Lets the order page read how a cancellation ended after its button has gone:
 * when a payment got there first, the order redraws as paid and the button
 * unmounts with the message it would have shown.
 */
export const cancelOrderMutationKey = (id: string) => ['cancelOrder', id] as const;

/** The status a 409's body carries, if it says which. */
const conflictStatus = (body: unknown): unknown =>
  typeof body === 'object' && body !== null && 'status' in body ? body.status : undefined;

/**
 * Whether a cancellation lost to a payment: the server found the customer had
 * already paid, settled it, and refused to cancel an order that is now paid.
 */
export const paidBeforeCancel = (error: unknown): boolean =>
  error instanceof HttpError && error.status === 409 && conflictStatus(error.body) === 'paid';

/**
 * Cancel one of the customer's pending orders.
 *
 * On success the cache is brought in line with what the server did:
 * - the order's detail is replaced with the response, so the page shows it
 *   cancelled at once;
 * - history pages are invalidated, since the row's status changed;
 * - product queries are invalidated, since the records' stock came back.
 *
 * On a 409 the order already left `pending` somewhere else — another tab, the
 * expiry sweep, or a payment the server found completed when it voided the
 * session — so it is refetched to show what it is now.
 *
 * @param id - the order to cancel
 */
export const useCancelOrder = (id: string) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: cancelOrderMutationKey(id),
    mutationFn: () => cancelOrder(id),
    onSuccess: async (order) => {
      queryClient.setQueryData(orderQueryKey(id), order);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: orderPagesQueryKey }),
        queryClient.invalidateQueries({ queryKey: productsQueryKey }),
      ]);
    },
    onError: async (error) => {
      if (error instanceof HttpError && error.status === 409) {
        await queryClient.invalidateQueries({ queryKey: orderQueryKey(id) });
      }
    },
  });
};
