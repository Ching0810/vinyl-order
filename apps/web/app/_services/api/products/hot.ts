import type { Product } from '@vinyl-order/shared';

import { http } from '@/lib/core/http';

/**
 * GET /products/hot — featured products for the storefront hot section.
 *
 * @param limit - how many to fetch; pass what the section draws, so it never
 *   loads rows it will throw away
 */
export const getHotProducts = (limit: number): Promise<Product[]> =>
  http.get<Product[]>('/products/hot', { limit });
