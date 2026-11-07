'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { SupplierOrder } from '@vinyl-order/shared';

import { createSupplierOrder } from '@/services/api/supplier-orders/create';
import { supplierOrdersQueryKey } from '@/services/queries/supplier-orders/useSupplierOrders';

/**
 * Record a supplier order.
 *
 * On success the new order is added to the cached list at once, so the list
 * page shows it the moment the form navigates back, then the list is
 * refetched to be sure it matches the server (grouping and order are worked
 * out from the list on render, so where it's inserted doesn't matter).
 *
 * Nothing on failure: the form shows the error, and the list hasn't changed.
 */
export const useCreateSupplierOrder = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: createSupplierOrder,
    onSuccess: async (order) => {
      queryClient.setQueryData<SupplierOrder[]>(supplierOrdersQueryKey, (orders) =>
        orders ? [order, ...orders] : orders,
      );
      await queryClient.invalidateQueries({ queryKey: supplierOrdersQueryKey });
    },
  });
};
