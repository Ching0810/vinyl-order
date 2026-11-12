'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { SupplierOrderImportTokenStatus } from '@vinyl-order/shared';

import { createSupplierOrderImportToken } from '@/services/api/supplier-order-import-token/create';
import { supplierOrderImportTokenQueryKey } from '@/services/queries/supplier-order-import-token/useSupplierOrderImportToken';

/**
 * Make a new import token, replacing the old one.
 *
 * The cached status is set from the answer, without the token: the token is
 * the caller's to show once, from the mutation's own data, and never goes
 * into the cache where it would outlive the page.
 */
export const useCreateSupplierOrderImportToken = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: createSupplierOrderImportToken,
    onSuccess: ({ createdAt, lastUsedAt }) => {
      queryClient.setQueryData<SupplierOrderImportTokenStatus>(supplierOrderImportTokenQueryKey, {
        importToken: { createdAt, lastUsedAt },
      });
    },
  });
};
