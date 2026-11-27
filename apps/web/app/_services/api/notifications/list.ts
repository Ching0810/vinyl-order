import type { Connection, Notification, PageArgs } from '@vinyl-order/shared';

import { http } from '@/lib/core/http';

/**
 * GET /notifications — the signed-in user's price drops, newest first
 * (tracker.md §5.10), cursor-paginated like the order history.
 *
 * @param args - page window: `{ first, after }` forward, `{ last, before }` back
 */
export const getNotifications = (args: PageArgs = {}): Promise<Connection<Notification>> =>
  http.get<Connection<Notification>>('/notifications', args);
