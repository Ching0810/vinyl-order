import type { CreateProductInput, Product } from '@vinyl-order/shared';

import { http } from '@/lib/core/http';

/** POST /products — admin-only; creates a catalog product. Returns the saved row. */
export const createProduct = (input: CreateProductInput): Promise<Product> =>
  http.post<Product>('/products', input);
