import type { Order } from '@vinyl-order/shared';

import { http } from '@/lib/core/http';

/**
 * GET /orders/:id — one of the signed-in user's orders with every line.
 * 404 for an order that isn't theirs, the same as for one that doesn't exist.
 */
export const getOrder = (id: string): Promise<Order> => http.get<Order>(`/orders/${id}`);
