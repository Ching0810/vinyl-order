'use client';

import { useQuery } from '@tanstack/react-query';

import { getSupplierOrderImportToken } from '@/services/api/supplier-order-import-token/get';
import { sessionQueryKey, useMe } from '@/services/queries/auth/useMe';

/**
 * Key for the user's import token status. Under the session root, so a
 * change of user clears it with everything else that is theirs.
 */
export const supplierOrderImportTokenQueryKey = [
  ...sessionQueryKey,
  'supplier-order-import-token',
] as const;

/**
 * Whether the signed-in user has an import token, and when the Apps Script
 * last used it. Gated on being signed in: the route is guarded.
 */
export const useSupplierOrderImportToken = () => {
  const { data: user } = useMe();

  return useQuery({
    queryKey: supplierOrderImportTokenQueryKey,
    queryFn: getSupplierOrderImportToken,
    enabled: Boolean(user),
  });
};
