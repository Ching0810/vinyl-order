import type { SupplierOrder } from '@vinyl-order/shared';

import { http } from '@/lib/core/http';

/**
 * GET /supplier-orders/:id — one of the signed-in user's orders with its
 * lines, as the edit form loads it. 404 for one that's gone or isn't theirs.
 */
export const getSupplierOrder = (id: string): Promise<SupplierOrder> =>
  http.get<SupplierOrder>(`/supplier-orders/${id}`);
