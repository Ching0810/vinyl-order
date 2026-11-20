import type { ProductWithOffers } from '@vinyl-order/shared';

import { http } from '@/lib/core/http';

/**
 * GET /products/:id/offers — a tracked record and every offer of it: each
 * version at each shop. Public. 404 for a record that isn't tracked — the
 * demo store's own — which the page then shows as before.
 */
export const getProductOffers = (productId: string): Promise<ProductWithOffers> =>
  http.get<ProductWithOffers>(`/products/${productId}/offers`);
