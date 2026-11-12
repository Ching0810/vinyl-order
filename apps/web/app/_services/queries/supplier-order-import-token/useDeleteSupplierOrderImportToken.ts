'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { SupplierOrderImportTokenStatus } from '@vinyl-order/shared';

import { deleteSupplierOrderImportToken } from '@/services/api/supplier-order-import-token/delete';
import { supplierOrderImportTokenQueryKey } from '@/services/queries/supplier-order-import-token/useSupplierOrderImportToken';

/** Revoke the import token; the page then shows there is none. */
export const useDeleteSupplierOrderImportToken = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: deleteSupplierOrderImportToken,
    onSuccess: () => {
      queryClient.setQueryData<SupplierOrderImportTokenStatus>(supplierOrderImportTokenQueryKey, {
        importToken: null,
      });
    },
  });
};
