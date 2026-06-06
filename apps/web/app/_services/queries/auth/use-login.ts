'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';

import { login } from '@/services/api/auth/login';
import { meQueryKey } from '@/services/queries/auth/use-me';

/**
 * Login mutation. On success it primes the `me` query cache with the returned
 * user, so the rest of the app sees the logged-in state without a refetch.
 */
export const useLogin = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: login,
    onSuccess: ({ user }) => {
      queryClient.setQueryData(meQueryKey, user);
    },
  });
};
