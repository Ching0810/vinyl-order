import type { Cart } from '@vinyl-order/shared';

import { http } from '@/lib/core/http';

/** GET /cart — the signed-in user's cart. Requires a session. */
export const getCart = (): Promise<Cart> => http.get<Cart>('/cart');
