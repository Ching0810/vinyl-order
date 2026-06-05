import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { PublicUser } from '@vinyl-order/shared';
import type { Request } from 'express';

/**
 * Injects the authenticated user into a handler param: `@CurrentUser() user`.
 * The value is whatever JwtStrategy.validate() returned (a PublicUser), which
 * Passport attached to req.user. Only use on routes guarded by JwtAuthGuard —
 * elsewhere req.user is undefined.
 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): PublicUser => {
    const request = ctx.switchToHttp().getRequest<Request>();
    return request.user as PublicUser;
  },
);
