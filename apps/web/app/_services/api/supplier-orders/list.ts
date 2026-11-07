import type { SupplierOrder } from '@vinyl-order/shared';

import { http } from '@/lib/core/http';

/**
 * GET /supplier-orders — every order the signed-in user recorded at the
 * shops, with its lines, newest first. Not paginated: one person's orders are
 * a page's worth, and the page groups them by status.
 */
export const getSupplierOrders = (): Promise<SupplierOrder[]> =>
  http.get<SupplierOrder[]>('/supplier-orders');
