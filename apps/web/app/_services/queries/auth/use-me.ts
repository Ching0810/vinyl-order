'use client';

import { useQuery } from '@tanstack/react-query';

import { getMe } from '@/services/api/auth/me';

/** Cache key for the current-user query — shared so mutations can prime/invalidate it. */
export const meQueryKey = ['auth', 'me'] as const;

/**
 * Current auth state. `data` is the user when logged in; a 401 surfaces as
 * `error` (retry disabled so an unauthenticated visitor isn't retried).
 */
export const useMe = () =>
  useQuery({
    queryKey: meQueryKey,
    queryFn: getMe,
    retry: false,
  });
