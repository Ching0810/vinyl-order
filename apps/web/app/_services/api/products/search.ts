import type { Product } from '@vinyl-order/shared';

import { http } from '@/lib/core/http';

/** GET /products/search?q= — search the catalog by title/artist. */
export const searchProducts = (q: string): Promise<Product[]> =>
  http.get<Product[]>('/products/search', { q });
