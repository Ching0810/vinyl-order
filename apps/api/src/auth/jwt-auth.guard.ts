import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/**
 * Protects routes with the 'jwt' strategy (JwtStrategy).
 * Apply with `@UseGuards(JwtAuthGuard)`; on success the validated PublicUser
 * is available as `req.user`.
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {}
