'use client';

import { useQuery } from '@tanstack/react-query';

import { getSupplierOrders } from '@/services/api/supplier-orders/list';
import { sessionQueryKey, useMe } from '@/services/queries/auth/useMe';

/**
 * Key for the signed-in user's supplier orders. Under the session root, so a
 * change of user clears them with the cart and the demo orders: on a shared
 * browser, one person's orders must not stay on screen for the next.
 *
 * The root of anything the entry form and status changes (4f, 4g) invalidate.
 */
export const supplierOrdersQueryKey = [...sessionQueryKey, 'supplier-orders'] as const;

/**
 * All of the user's supplier orders. Gated on being signed in: the route is
 * guarded, so asking while logged out would only 401.
 */
export const useSupplierOrders = () => {
  const { data: user } = useMe();

  return useQuery({
    queryKey: supplierOrdersQueryKey,
    queryFn: getSupplierOrders,
    enabled: Boolean(user),
  });
};
