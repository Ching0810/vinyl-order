import type { SupplierOrder, UpdateSupplierOrderInput } from '@vinyl-order/shared';

import { http } from '@/lib/core/http';

/**
 * PATCH /supplier-orders/:id — change an order's status, tracking number or
 * note. Answers with the order as it now is.
 *
 * 409 SUPPLIER_ORDER_BAD_TRANSITION, with the order's current `status`, when
 * the change isn't allowed from where the order is now; 404 for an order
 * that's gone or isn't theirs.
 */
export const updateSupplierOrder = (
  id: string,
  input: UpdateSupplierOrderInput,
): Promise<SupplierOrder> => http.patch<SupplierOrder>(`/supplier-orders/${id}`, input);
