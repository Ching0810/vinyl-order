import type { LoginInput, PublicUser } from '@vinyl-order/shared';

import { http } from '@/lib/core/http';

/** POST /auth/login — the API sets the JWT cookie and returns the user. */
export const login = (input: LoginInput): Promise<{ user: PublicUser }> =>
  http.post<{ user: PublicUser }>('/auth/login', input);
