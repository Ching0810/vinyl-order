import type { Category, CreateCategoryInput, UpdateCategoryInput } from '@vinyl-order/shared';

import { http } from '@/lib/core/http';

/** POST /categories — admin only. */
export const createCategory = (input: CreateCategoryInput): Promise<Category> =>
  http.post<Category>('/categories', input);

/** PATCH /categories/:id — admin only; updates only the fields sent. */
export const updateCategory = (id: string, input: UpdateCategoryInput): Promise<Category> =>
  http.patch<Category>(`/categories/${id}`, input);

/** DELETE /categories/:id — admin only. Cascades the product assignments. */
export const deleteCategory = (id: string): Promise<void> => http.delete<void>(`/categories/${id}`);
