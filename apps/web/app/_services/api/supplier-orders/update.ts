import type { SupplierOrder, UpdateSupplierOrderInput } from '@vinyl-order/shared';

import { http } from '@/lib/core/http';

/**
 * PATCH /supplier-orders/:id — change any of an order's fields but its shop;
 * lines are sent as the whole list. Answers with the order as it now is.
 *
 * 409 SUPPLIER_ORDER_BAD_TRANSITION, with the order's current `status`, when
 * the status change isn't allowed from where the order is now;
 * SUPPLIER_ORDER_DUPLICATE for a number another of theirs has at the shop;
 * SUPPLIER_ORDER_STALE when `expectedUpdatedAt` is no longer the order's
 * version. 404 for an order that's gone or isn't theirs.
 */
export const updateSupplierOrder = (
  id: string,
  input: UpdateSupplierOrderInput,
): Promise<SupplierOrder> => http.patch<SupplierOrder>(`/supplier-orders/${id}`, input);
