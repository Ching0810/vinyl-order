import type { PublicUser } from '@vinyl-order/shared';

import { http } from '@/lib/core/http';

/**
 * GET /auth/me — the current user, or null when nobody is signed in.
 *
 * Public: a logged-out visitor is an answer, not an error, so browsing the
 * shop doesn't fill the console with 401s.
 */
export const getMe = async (): Promise<PublicUser | null> =>
  (await http.get<{ user: PublicUser | null }>('/auth/me')).user;
