import type { CreatedSupplierOrderImportToken } from '@vinyl-order/shared';

import { http } from '@/lib/core/http';

/**
 * POST /supplier-orders/import-token — a new import token, replacing any the
 * user had, which stops working at once. The only answer carrying the token.
 */
export const createSupplierOrderImportToken = (): Promise<CreatedSupplierOrderImportToken> =>
  http.post<CreatedSupplierOrderImportToken>('/supplier-orders/import-token');
