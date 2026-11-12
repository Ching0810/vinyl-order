import type { SupplierOrderImportTokenStatus } from '@vinyl-order/shared';

import { http } from '@/lib/core/http';

/**
 * GET /supplier-orders/import-token — whether the signed-in user has an
 * import token, and when it was made and last used. Never the token itself.
 */
export const getSupplierOrderImportToken = (): Promise<SupplierOrderImportTokenStatus> =>
  http.get<SupplierOrderImportTokenStatus>('/supplier-orders/import-token');
