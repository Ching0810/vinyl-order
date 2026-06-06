import { SetMetadata } from '@nestjs/common';
import type { Role } from '@vinyl-order/shared';

/** Metadata key holding the roles allowed on a route (read by RolesGuard). */
export const ROLES_KEY = 'roles';

/**
 * Restrict a route/controller to the given role(s): `@Roles('admin')`.
 * Must be combined with JwtAuthGuard + RolesGuard so req.user is populated.
 */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);
