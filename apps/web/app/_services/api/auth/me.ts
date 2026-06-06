import type { PublicUser } from '@vinyl-order/shared';

import { http } from '@/lib/core/http';

/** GET /auth/me — resolves to the current user, or throws HttpError(401) if not logged in. */
export const getMe = (): Promise<PublicUser> => http.get<PublicUser>('/auth/me');
