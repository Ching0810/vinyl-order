import type { Product } from '@vinyl-order/shared';

import { http } from '@/lib/core/http';

/** GET /products/:id — a single product (public). Used to prefill the edit form. */
export const getProduct = (id: string): Promise<Product> => http.get<Product>(`/products/${id}`);
