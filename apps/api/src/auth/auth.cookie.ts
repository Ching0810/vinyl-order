import type { CookieOptions } from 'express';

/** Name of the httpOnly cookie that carries the JWT. */
export const ACCESS_TOKEN_COOKIE = 'access_token';

/** Cookie lifetime — keep roughly in sync with JWT_EXPIRES_IN. */
export const ACCESS_TOKEN_MAX_AGE_MS = 24 * 60 * 60 * 1000; // 1 day

/**
 * Base options for the auth cookie, shared by set (login/register) and clear
 * (logout) — they must match for the browser to overwrite/remove the cookie.
 *
 * - httpOnly: JS can't read it (XSS-safe)
 * - sameSite 'lax': sent on same-site requests; in dev localhost:3000 -> :3001
 *   is same-site (port doesn't affect same-site). For cross-DOMAIN production
 *   (app.x.com -> api.y.com) revisit sameSite 'none' + secure + CSRF defense.
 * - secure: HTTPS-only in production (so plain-http localhost works in dev)
 */
export const accessTokenCookieOptions = (isProd: boolean): CookieOptions => ({
  httpOnly: true,
  sameSite: 'lax',
  secure: isProd,
  path: '/',
});
