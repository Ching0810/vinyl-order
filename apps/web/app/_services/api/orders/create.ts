import type { Order } from '@vinyl-order/shared';

import { http } from '@/lib/core/http';

/**
 * POST /orders — places the signed-in user's cart as an order.
 *
 * No body: the server reads the cart itself, so the order can't disagree with
 * it. Refusals come back as HttpError 409 with a `code` (see OrderErrorCode).
 */
export const createOrder = (): Promise<Order> => http.post<Order>('/orders');
