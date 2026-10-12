import type { PaymentResult } from '@vinyl-order/shared';

import { http } from '@/lib/core/http';

/**
 * GET /orders/:id/payments/:paymentId — one payment attempt's status, and its
 * order's. 404 unless the payment belongs to that order and the order to the
 * signed-in user.
 */
export const getPaymentResult = (orderId: string, paymentId: string): Promise<PaymentResult> =>
  http.get<PaymentResult>(`/orders/${orderId}/payments/${paymentId}`);
