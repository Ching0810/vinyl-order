'use client';

import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type { PageArgs } from '@vinyl-order/shared';

import { getNotifications } from '@/services/api/notifications/list';
import { sessionQueryKey, useMe } from '@/services/queries/auth/useMe';

/**
 * Root key for the signed-in user's notifications — under the session root,
 * so a change of user clears them along with the cart.
 */
export const notificationsQueryKey = [...sessionQueryKey, 'notifications'] as const;

/** Every page of the list, so a refresh that found a drop can refetch them all. */
export const notificationPagesQueryKey = [...notificationsQueryKey, 'page'] as const;

/**
 * One page of the user's notifications. Gated on being signed in: the route
 * is guarded, so asking while logged out would only 401. `keepPreviousData`
 * holds the current page on screen while the next loads.
 */
export const useNotifications = (args: PageArgs) => {
  const { data: user } = useMe();

  return useQuery({
    queryKey: [...notificationPagesQueryKey, args],
    queryFn: () => getNotifications(args),
    enabled: Boolean(user),
    placeholderData: keepPreviousData,
  });
};
