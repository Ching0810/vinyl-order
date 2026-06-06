import type { PublicUser, RegisterInput } from '@vinyl-order/shared';

import { http } from '@/lib/core/http';

/** POST /auth/register — creates the account (no session); client then logs in. */
export const register = (input: RegisterInput): Promise<{ user: PublicUser }> =>
  http.post<{ user: PublicUser }>('/auth/register', input);
