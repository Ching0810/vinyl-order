'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';

import { markNotificationsRead } from '@/services/api/notifications/mark-read';
import { unreadCountQueryKey } from '@/services/queries/notifications/useUnreadCount';

/**
 * Mark all the user's notifications read. Only the header's count is
 * refetched: the list on screen keeps the marks it was loaded with, so the
 * ones new this visit still show as new.
 */
export const useMarkNotificationsRead = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: markNotificationsRead,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: unreadCountQueryKey }),
  });
};
