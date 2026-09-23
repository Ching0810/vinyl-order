import { IDEMPOTENCY_KEY_HEADER, type Order } from '@vinyl-order/shared';

import { http } from '@/lib/core/http';

/**
 * POST /orders — places the signed-in user's cart as an order.
 *
 * No body: the server reads the cart itself, so the order can't disagree with
 * it. Refusals come back as HttpError 409 with a `code` (see OrderErrorCode).
 *
 * @param idempotencyKey - this checkout attempt's id. Repeating it answers
 *   with the order the first request placed instead of placing a second one,
 *   which is what makes retrying a lost response safe.
 */
export const createOrder = (idempotencyKey: string): Promise<Order> =>
  http.post<Order>('/orders', undefined, { [IDEMPOTENCY_KEY_HEADER]: idempotencyKey });
