import { Injectable, UnauthorizedException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/**
 * Like JwtAuthGuard, but not being signed in is not an error: a missing,
 * invalid or expired token leaves `req.user` null and the request continues.
 *
 * For routes that serve everyone and only personalise for a session. GET
 * /auth/me answers "who am I?", and "nobody" is an ordinary answer from a
 * visitor browsing the shop — not a failure worth logging as one.
 */
@Injectable()
export class OptionalJwtAuthGuard extends AuthGuard('jwt') {
  handleRequest<TUser>(err: unknown, user: TUser | false): TUser {
    // "Not signed in" arrives as no user, or as the UnauthorizedException
    // JwtStrategy throws for a token whose user is gone. Anything else — the
    // user lookup failing because the database is down — is a real error and
    // must not be passed off as a logged-out visitor.
    if (err && !(err instanceof UnauthorizedException)) {
      // Passport types this as unknown; anything that isn't an Error is
      // reported as one rather than stringified into "[object Object]".
      throw err instanceof Error ? err : new Error('Authentication failed');
    }
    return (user || null) as TUser;
  }
}
