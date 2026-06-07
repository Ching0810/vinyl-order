import type { Product } from '@vinyl-order/shared';

import { http } from '@/lib/core/http';

/** GET /products/hot — featured products for the storefront hot section. */
export const getHotProducts = (): Promise<Product[]> => http.get<Product[]>('/products/hot');
