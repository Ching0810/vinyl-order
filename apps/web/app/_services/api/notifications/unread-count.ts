import type { UnreadCount } from '@vinyl-order/shared';

import { http } from '@/lib/core/http';

/** GET /notifications/unread-count — how many the user hasn't read. */
export const getUnreadCount = (): Promise<UnreadCount> =>
  http.get<UnreadCount>('/notifications/unread-count');
