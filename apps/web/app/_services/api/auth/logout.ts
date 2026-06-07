import { http } from '@/lib/core/http';

/** POST /auth/logout — the API clears the JWT cookie. */
export const logout = (): Promise<{ success: true }> =>
  http.post<{ success: true }>('/auth/logout');
