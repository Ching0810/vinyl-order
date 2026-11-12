import { http } from '@/lib/core/http';

/** DELETE /supplier-orders/import-token — revoke the user's import token. 204 either way. */
export const deleteSupplierOrderImportToken = (): Promise<void> =>
  http.delete<void>('/supplier-orders/import-token');
