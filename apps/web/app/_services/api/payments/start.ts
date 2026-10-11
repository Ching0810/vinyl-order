import type { StartPaymentResponse } from '@vinyl-order/shared';

import { http } from '@/lib/core/http';

/**
 * POST /orders/:id/payment — open a payment for one of the signed-in user's
 * pending orders, and answer with the provider's page to send the browser to.
 * Safe to repeat: while the order has a pending payment, its page comes back
 * instead of a new one.
 *
 * 409 ORDER_NOT_PENDING or ORDER_EXPIRED once the order can no longer be paid.
 * 404 for an order that isn't theirs. 502 when the provider can't be reached.
 */
export const startPayment = (orderId: string): Promise<StartPaymentResponse> =>
  http.post<StartPaymentResponse>(`/orders/${orderId}/payment`);
