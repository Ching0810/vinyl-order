'use client';

import { useQuery } from '@tanstack/react-query';

import { getUnreadCount } from '@/services/api/notifications/unread-count';
import { useMe } from '@/services/queries/auth/useMe';
import { notificationsQueryKey } from '@/services/queries/notifications/useNotifications';

/** The header's count, under the notifications root so one invalidation covers both. */
export const unreadCountQueryKey = [...notificationsQueryKey, 'unread-count'] as const;

/**
 * How many notifications the signed-in user hasn't read, for the header's
 * bell. Not polled: a drop is only found by a read of the shops, so the count
 * is fetched again on focus, on a record's refresh and once the page is read.
 */
export const useUnreadCount = () => {
  const { data: user } = useMe();

  return useQuery({
    queryKey: unreadCountQueryKey,
    queryFn: getUnreadCount,
    enabled: Boolean(user),
  });
};
