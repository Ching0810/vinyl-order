import type { NestExpressApplication } from '@nestjs/platform-express';

/**
 * Makes `req.ip` the client's address instead of the nearest proxy's, by
 * trusting the last `hops` entries of X-Forwarded-For — the ones our own
 * proxies appended. Anything to their left came from the client and is never
 * read, so a client can't choose the address the rate limit counts it by.
 *
 * With 0, nothing in front is trusted and `req.ip` is the connection's own
 * address. Shared by main.ts and the e2e tests, so the tests check the setting
 * production runs.
 */
export const applyTrustProxy = (app: NestExpressApplication, hops: number): void => {
  if (hops > 0) app.set('trust proxy', hops);
};
