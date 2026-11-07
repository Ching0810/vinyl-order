'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { SupplierOrder } from '@vinyl-order/shared';

import { HttpError } from '@/lib/core/http';
import { deleteSupplierOrder } from '@/services/api/supplier-orders/delete';
import { supplierOrdersQueryKey } from '@/services/queries/supplier-orders/useSupplierOrders';

/** Drop an order from the cached list, so its card disappears at once. */
const withoutOrder = (id: string) => (orders: SupplierOrder[] | undefined) =>
  orders?.filter((order) => order.id !== id);

/**
 * Delete one of the user's supplier orders.
 *
 * A 404 counts as done: the order is already gone (deleted in another tab),
 * which is what was asked for, so it leaves the list the same way and the
 * list is refetched to be sure.
 */
export const useDeleteSupplierOrder = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: deleteSupplierOrder,
    onSuccess: (_, id) => {
      queryClient.setQueryData<SupplierOrder[]>(supplierOrdersQueryKey, withoutOrder(id));
    },
    onError: async (error, id) => {
      if (error instanceof HttpError && error.status === 404) {
        queryClient.setQueryData<SupplierOrder[]>(supplierOrdersQueryKey, withoutOrder(id));
        await queryClient.invalidateQueries({ queryKey: supplierOrdersQueryKey });
      }
    },
  });
};
