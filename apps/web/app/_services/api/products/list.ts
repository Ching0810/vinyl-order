import type { Product } from '@vinyl-order/shared';

import { http } from '@/lib/core/http';

/** Catalog filters (all optional) — map to the GET /products query params. */
export type ProductListParams = {
  q?: string;
  genre?: string;
  page?: number;
};

/**
 * GET /products — the public vinyl catalog.
 * Called from the root page's Server Component, so it runs on the Next.js
 * server. The `http` client's BASE_URL is absolute, so the same helper works
 * server-side; auth cookies aren't needed (this endpoint is public).
 */
export const getProducts = (params: ProductListParams = {}): Promise<Product[]> =>
  http.get<Product[]>('/products', params);
