import type { CreateSupplierOrderInput, SupplierOrder } from '@vinyl-order/shared';

import { http } from '@/lib/core/http';

/**
 * POST /supplier-orders — record an order the signed-in user placed at a shop,
 * with its lines. Answers with the order as stored.
 *
 * 409 SUPPLIER_ORDER_DUPLICATE if they already recorded this order number at
 * this shop (see supplierOrderErrorCode); 400 if the body fails the shared
 * schema.
 */
export const createSupplierOrder = (input: CreateSupplierOrderInput): Promise<SupplierOrder> =>
  http.post<SupplierOrder>('/supplier-orders', input);
