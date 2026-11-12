import {
  type CanActivate,
  createParamDecorator,
  type ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';

import { SupplierOrderImportTokensService } from './import-token.service';

/** A request the guard let through, carrying whose token it was. */
type ImportRequest = Request & { importingUserId?: string };

/**
 * Lets a request through only with a current import token as its bearer
 * (tracker.md §9.4), and notes whose it is for @ImportingUserId.
 *
 * Not a session: a login JWT here finds no token and is refused, as an import
 * token is refused where a session is needed. Every failure is the same 401,
 * so a caller learns nothing about which part was wrong.
 */
@Injectable()
export class SupplierOrderImportTokenGuard implements CanActivate {
  constructor(private readonly tokens: SupplierOrderImportTokensService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<ImportRequest>();
    const bearer = /^Bearer (\S+)$/.exec(request.headers.authorization ?? '')?.[1];
    const userId = bearer ? await this.tokens.userIdFor(bearer) : null;
    if (!userId) throw new UnauthorizedException('A valid import token is required');

    request.importingUserId = userId;
    return true;
  }
}

/** The user whose import token let the request in. Only behind the guard above. */
export const ImportingUserId = createParamDecorator(
  (_data: unknown, context: ExecutionContext): string => {
    const { importingUserId } = context.switchToHttp().getRequest<ImportRequest>();
    if (!importingUserId) throw new UnauthorizedException('A valid import token is required');
    return importingUserId;
  },
);
