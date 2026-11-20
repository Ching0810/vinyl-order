import type { ProductWithOffers } from '@vinyl-order/shared';

import { http } from '@/lib/core/http';

/**
 * POST /products/:id/refresh — each offer read again from its shop's page,
 * live: seconds. Signed in. 429 REFRESH_TOO_SOON within ten minutes of the
 * record's last read, with `retryAfterSeconds` (see retryAfterSecondsOf).
 */
export const refreshProduct = (productId: string): Promise<ProductWithOffers> =>
  http.post<ProductWithOffers>(`/products/${productId}/refresh`);
