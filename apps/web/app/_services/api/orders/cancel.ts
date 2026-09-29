import type { Order } from '@vinyl-order/shared';

import { http } from '@/lib/core/http';

/**
 * POST /orders/:id/cancel — cancel one of the signed-in user's pending orders;
 * its records go back on sale. Answers with the cancelled order.
 *
 * 409 ORDER_NOT_PENDING once the order has left `pending` (paid, or already
 * cancelled — by the customer elsewhere, or by the expiry sweep). 404 for an
 * order that isn't theirs.
 */
export const cancelOrder = (id: string): Promise<Order> => http.post<Order>(`/orders/${id}/cancel`);
