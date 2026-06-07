import { http } from '@/lib/core/http';

/** DELETE /products/:id — admin-only; 204 No Content on success. */
export const deleteProduct = (id: string): Promise<void> => http.delete<void>(`/products/${id}`);
