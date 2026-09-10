import type { Product } from '@vinyl-order/shared';

import { http } from '@/lib/core/http';

/** GET /products/slides — products featured in the hero carousel, in order. */
export const getSlideProducts = (): Promise<Product[]> => http.get<Product[]>('/products/slides');
