import { SetMetadata } from '@nestjs/common';
import { UserRole } from '@prisma/client';

export const ROLES_KEY = 'roles';

/**
 * Decorator to specify required roles for accessing an endpoint
 * 
 * @param roles - Array of required user roles
 * 
 * @example
 * @Roles(UserRole.ADMIN, UserRole.TEAM_LEADER)
 * @Get('admin-only')
 * adminOnlyEndpoint() {
 *   return { message: 'Admin access granted' };
 * }
 */
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);