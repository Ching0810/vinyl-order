'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';

import { login } from '@/services/api/auth/login';
import { meQueryKey, sessionQueryKey } from '@/services/queries/auth/use-me';

/**
 * Login mutation. On success it primes the `me` query cache with the returned
 * user, so the rest of the app sees the logged-in state without a refetch.
 *
 * Anything cached for the previous user is dropped first. Logout already clears
 * the cache, but a session that simply expired never ran it — without this, the
 * previous user's cart would show until the new user's cart finished loading.
 * Clearing by the shared session prefix keeps auth from having to know which
 * features hold per-user data.
 */
export const useLogin = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: login,
    onSuccess: ({ user }) => {
      queryClient.removeQueries({ queryKey: sessionQueryKey });
      queryClient.setQueryData(meQueryKey, user);
    },
  });
};
