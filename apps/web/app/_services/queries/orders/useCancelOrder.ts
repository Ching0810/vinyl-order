'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';

import { HttpError } from '@/lib/core/http';
import { cancelOrder } from '@/services/api/orders/cancel';
import { orderQueryKey } from '@/services/queries/orders/useOrder';
import { orderPagesQueryKey } from '@/services/queries/orders/useOrders';
import { productsQueryKey } from '@/services/queries/products/useProducts';

/**
 * Cancel one of the customer's pending orders.
 *
 * On success the cache is brought in line with what the server did:
 * - the order's detail is replaced with the response, so the page shows it
 *   cancelled at once;
 * - history pages are invalidated, since the row's status changed;
 * - product queries are invalidated, since the records' stock came back.
 *
 * On a 409 the order already left `pending` somewhere else — another tab, or
 * the expiry sweep got there first — so it is refetched to show what it is now.
 *
 * @param id - the order to cancel
 */
export const useCancelOrder = (id: string) => {
  const queryClient = useQueryClient();

  return useMutation({
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
