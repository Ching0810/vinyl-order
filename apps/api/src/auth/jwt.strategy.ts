import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import type { PublicUser, Role } from '@vinyl-order/shared';
import type { Request } from 'express';
import { ExtractJwt, Strategy } from 'passport-jwt';

import { UsersService } from '../users/users.service';
import { ACCESS_TOKEN_COOKIE } from './auth.cookie';

/** Shape of the signed JWT payload. `sub` is the user id (JWT convention). */
export interface JwtPayload {
  sub: string;
  email: string;
  role: Role;
}

/** Pull the JWT from the httpOnly cookie (set by AuthController on login). */
const cookieExtractor = (req: Request): string | null => {
  const cookies = req.cookies as Record<string, string> | undefined;
  return cookies?.[ACCESS_TOKEN_COOKIE] ?? null;
};

/**
 * Validates incoming `Authorization: Bearer <token>` requests.
 *
 * Passport first verifies the token's signature and expiry using JWT_SECRET;
 * only then is `validate()` called with the decoded payload. We re-load the
 * user from the DB (so a token can't outlive a deleted user) and return the
 * passwordHash-free shape, which Passport attaches to `req.user`.
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService,
    private readonly users: UsersService,
  ) {
    super({
      // Cookie first (browser clients); Bearer header as a fallback (API tools).
      jwtFromRequest: ExtractJwt.fromExtractors([
        cookieExtractor,
        ExtractJwt.fromAuthHeaderAsBearerToken(),
      ]),
      ignoreExpiration: false,
      secretOrKey: config.getOrThrow<string>('JWT_SECRET'),
    });
  }

  async validate(payload: JwtPayload): Promise<PublicUser> {
    const user = await this.users.findById(payload.sub);
    if (!user) {
      throw new UnauthorizedException();
    }
    // Whitelist fields explicitly — never let passwordHash reach req.user.
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }
}
