import type { Connection, OrderSummary, PageArgs } from '@vinyl-order/shared';

import { http } from '@/lib/core/http';

/**
 * GET /orders — the signed-in user's order history, newest first
 * (cursor-paginated, like the catalogue).
 *
 * @param args - page window: `{ first, after }` forward, `{ last, before }` back
 */
export const getOrders = (args: PageArgs = {}): Promise<Connection<OrderSummary>> =>
  http.get<Connection<OrderSummary>>('/orders', args);
