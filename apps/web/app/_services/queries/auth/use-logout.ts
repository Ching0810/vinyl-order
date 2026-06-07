'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';

import { logout } from '@/services/api/auth/logout';
import { meQueryKey } from '@/services/queries/auth/use-me';

/**
 * Logout mutation. On success it clears the cached user (so the header flips to
 * logged-out immediately) and drops any other cached queries — admin data, etc.
 * shouldn't linger for the next visitor on a shared machine.
 */
export const useLogout = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: logout,
    onSuccess: () => {
      // Drop all cached queries first (admin data, products…), then seed `me`
      // as null so the header shows logged-out without an immediate refetch.
      queryClient.removeQueries();
      queryClient.setQueryData(meQueryKey, null);
    },
  });
};
