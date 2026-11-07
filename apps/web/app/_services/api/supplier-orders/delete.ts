import { http } from '@/lib/core/http';

/**
 * DELETE /supplier-orders/:id — remove an order and its lines; how a
 * mistyped one is corrected. 204; 404 for one that's gone or isn't theirs.
 */
export const deleteSupplierOrder = (id: string): Promise<void> =>
  http.delete<void>(`/supplier-orders/${id}`);
