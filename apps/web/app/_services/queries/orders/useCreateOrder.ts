'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { Cart } from '@vinyl-order/shared';

import { currentAttemptKey, endAttempt } from '@/lib/core/checkout-attempt';
import { HttpError } from '@/lib/core/http';
import { createOrder } from '@/services/api/orders/create';
import { cartQueryKey } from '@/services/queries/cart/useCart';
import { orderQueryKey } from '@/services/queries/orders/useOrder';
import { orderPagesQueryKey } from '@/services/queries/orders/useOrders';
import { productsQueryKey } from '@/services/queries/products/useProducts';

/** Lets the cart lock its controls while an order is being placed. */
export const createOrderMutationKey = ['createOrder'] as const;

/**
 * Place the cart as an order.
 *
 * On success the server has emptied the cart, taken stock and created the
 * order, and the cache is brought in line with all three:
 * - the cart is emptied at once, so the header badge drops to 0 without
 *   waiting, then refetched — a record added in another tab mid-checkout is
 *   still in it;
 * - product queries are invalidated, since their stock just changed;
 * - the new order seeds its own detail query, so the confirmation page renders
 *   from the response instead of fetching it again;
 * - history pages are invalidated, so the new order heads the list.
 *
 * On a 409 the cart the page shows is out of date — stock moved, or another tab
 * changed it — so it is refetched to show the current lines and their stock.
 */
export const useCreateOrder = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: createOrderMutationKey,
    mutationFn: () => createOrder(currentAttemptKey()),
    onSuccess: async (order) => {
      // Placed — or already placed, and this was a retry answered with it.
      // Either way the attempt is over and the next press starts a new one.
      endAttempt();
      queryClient.setQueryData<Cart>(cartQueryKey, (cart) =>
        cart ? { ...cart, items: [], itemCount: 0, subtotalCents: 0 } : cart,
      );
      queryClient.setQueryData(orderQueryKey(order.id), order);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: cartQueryKey }),
        queryClient.invalidateQueries({ queryKey: productsQueryKey }),
        queryClient.invalidateQueries({ queryKey: orderPagesQueryKey }),
      ]);
    },
    onError: async (error) => {
      // A definite answer ends the attempt: the customer will change something
      // and press again, which deserves its own key. No response at all (a
      // timeout, a dropped connection) is *not* definite — the key stays, so
      // pressing again asks whether the earlier request landed.
      if (error instanceof HttpError) {
        endAttempt();
        if (error.status === 409) {
          await queryClient.invalidateQueries({ queryKey: cartQueryKey });
        }
      }
    },
  });
};
