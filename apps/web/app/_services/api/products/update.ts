import type { Product, UpdateProductInput } from '@vinyl-order/shared';

import { http } from '@/lib/core/http';

/** PATCH /products/:id — admin-only; updates only the fields sent. */
export const updateProduct = (id: string, input: UpdateProductInput): Promise<Product> =>
  http.patch<Product>(`/products/${id}`, input);
