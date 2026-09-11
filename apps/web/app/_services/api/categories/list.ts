import type { Category } from '@vinyl-order/shared';

import { http } from '@/lib/core/http';

/** GET /categories — storefront navigation tabs, in display order. */
export const getCategories = (): Promise<Category[]> => http.get<Category[]>('/categories');
