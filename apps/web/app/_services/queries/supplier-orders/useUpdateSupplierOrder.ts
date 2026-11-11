'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { SupplierOrder, UpdateSupplierOrderInput } from '@vinyl-order/shared';

import { HttpError } from '@/lib/core/http';
import { updateSupplierOrder } from '@/services/api/supplier-orders/update';
import { supplierOrderQueryKey } from '@/services/queries/supplier-orders/useSupplierOrder';
import { supplierOrdersQueryKey } from '@/services/queries/supplier-orders/useSupplierOrders';

/**
 * Change one of the user's supplier orders: its status from the list's menu,
 * or anything but the shop from the edit form.
 *
 * On success the answer replaces that order in the cached list and in its
 * own cache, so the card redraws at once — and if its status changed,
 * groupByStatus moves it to its new group on the same render.
 *
 * A 409 or 404 means what's on screen is out of date (another tab moved,
 * edited or deleted the order), so the list — and with it the order's own
 * cache, which sits under it — is refetched; the caller says what happened.
 *
 * The refetch is started, not awaited: React Query runs the caller's own
 * onError only after this one settles, and once the refetch lands the card
 * may have moved group and remounted — dropping the caller's callback, and
 * with it the message.
 */
export const useUpdateSupplierOrder = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateSupplierOrderInput }) =>
      updateSupplierOrder(id, input),
    onSuccess: (updated) => {
      queryClient.setQueryData<SupplierOrder[]>(supplierOrdersQueryKey, (orders) =>
        orders?.map((order) => (order.id === updated.id ? updated : order)),
      );
      queryClient.setQueryData<SupplierOrder>(supplierOrderQueryKey(updated.id), updated);
    },
    onError: (error) => {
      if (error instanceof HttpError && (error.status === 409 || error.status === 404)) {
        void queryClient.invalidateQueries({ queryKey: supplierOrdersQueryKey });
      }
    },
  });
};
