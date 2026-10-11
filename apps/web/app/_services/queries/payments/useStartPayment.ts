'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';

import { HttpError } from '@/lib/core/http';
import { startPayment } from '@/services/api/payments/start';
import { orderQueryKey } from '@/services/queries/orders/useOrder';

/**
 * Start paying for one of the customer's pending orders, then leave for the
 * provider's payment page.
 *
 * A full page load rather than router.push: the page belongs to the provider,
 * on another site, so the browser has to leave this app to reach it.
 *
 * On a 409 the order can no longer be paid — it expired, or left `pending`
 * elsewhere — so it is refetched and the page redraws in its new state, as
 * cancelling does.
 *
 * @param orderId - the order to pay for
 */
export const useStartPayment = (orderId: string) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => startPayment(orderId),
    onSuccess: ({ redirectUrl }) => {
      window.location.assign(redirectUrl);
    },
    onError: async (error) => {
      if (error instanceof HttpError && error.status === 409) {
        await queryClient.invalidateQueries({ queryKey: orderQueryKey(orderId) });
      }
    },
  });
};
