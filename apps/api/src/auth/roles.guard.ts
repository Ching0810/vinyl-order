import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { PublicUser, Role } from '@vinyl-order/shared';
import type { Request } from 'express';

import { ROLES_KEY } from './roles.decorator';

/**
 * Authorizes by role. Reads the @Roles(...) metadata and checks it against
 * req.user.role (set by JwtStrategy.validate). Use AFTER JwtAuthGuard:
 *   @UseGuards(JwtAuthGuard, RolesGuard) @Roles('admin')
 * Routes/controllers without @Roles are allowed — this guard only enforces
 * when the metadata is present.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
    const user = request.user as PublicUser | undefined;
    if (!user || !required.includes(user.role)) {
      throw new ForbiddenException('Insufficient permissions');
    }
    return true;
  }
}
