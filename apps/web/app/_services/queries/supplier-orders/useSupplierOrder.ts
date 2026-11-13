'use client';

import { useQuery } from '@tanstack/react-query';

import { getSupplierOrder } from '@/services/api/supplier-orders/get';
import { useMe } from '@/services/queries/auth/useMe';
import { supplierOrdersQueryKey } from '@/services/queries/supplier-orders/useSupplierOrders';

/**
 * Key for one supplier order — under the list's, so whatever refreshes the
 * list (a save, a refused change) refreshes an open order too.
 */
export const supplierOrderQueryKey = (id: string) => [...supplierOrdersQueryKey, id] as const;

/**
 * One of the user's supplier orders, for its page and the edit form. A 404
 * is final (gone, or not theirs), so it isn't retried.
 */
export const useSupplierOrder = (id: string) => {
  const { data: user } = useMe();

  return useQuery({
    queryKey: supplierOrderQueryKey(id),
    queryFn: () => getSupplierOrder(id),
    enabled: Boolean(user),
    retry: false,
  });
};
