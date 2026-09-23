'use client';

import { useQuery } from '@tanstack/react-query';

import { getMe } from '@/services/api/auth/me';

/** Cache key for the current-user query — shared so mutations can prime/invalidate it. */
export const meQueryKey = ['auth', 'me'] as const;

/**
 * Root for every query that holds the signed-in user's own data (cart, and
 * later orders, wishlist…). Build those keys from it, and a change of user
 * clears them all by this one prefix — without auth having to know which
 * features exist.
 *
 * `me` deliberately sits outside it: login replaces `me` rather than clearing it.
 */
export const sessionQueryKey = ['session'] as const;

/**
 * Current auth state: `data` is the user when signed in, and null when not —
 * not an error, so every page can ask. `error` is left for real failures (the
 * API being unreachable), and retry stays off so a failing call isn't repeated
 * on every page.
 */
export const useMe = () =>
  useQuery({
    queryKey: meQueryKey,
    queryFn: getMe,
    retry: false,
  });
