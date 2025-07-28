import { applyDecorators, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiUnauthorizedResponse, ApiForbiddenResponse } from '@nestjs/swagger';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { RolesGuard } from '../guards/roles.guard';
import { SessionGuard } from '../guards/session.guard';
import { ResourceAccessGuard } from '../guards/resource-access.guard';
import { Roles } from './roles.decorator';
import { Permissions } from './permissions.decorator';
import { ResourceAccess, ResourceAccessConfig } from './resource-access.decorator';
import { UserRole } from '@prisma/client';

export interface AuthOptions {
  roles?: UserRole[];
  permissions?: string[];
  resourceAccess?: ResourceAccessConfig;
  requireSession?: boolean;
}

/**
 * Combined authentication decorator that applies JWT auth and optional authorization
 * 
 * @param options - Authentication and authorization options
 * 
 * @example
 * // Basic authentication only
 * @Auth()
 * @Get('profile')
 * getProfile() { ... }
 * 
 * @example
 * // Role-based access
 * @Auth({ roles: [UserRole.ADMIN, UserRole.TEAM_LEADER] })
 * @Get('admin-data')
 * getAdminData() { ... }
 * 
 * @example
 * // Permission-based access
 * @Auth({ permissions: ['orders:read', 'orders:write'] })
 * @Post('orders')
 * createOrder() { ... }
 * 
 * @example
 * // Resource-level access with session validation
 * @Auth({
 *   resourceAccess: {
 *     resource: 'order',
 *     action: 'read',
 *     resourceIdParam: 'orderId',
 *     allowOwner: true
 *   },
 *   requireSession: true
 * })
 * @Get('orders/:orderId')
 * getOrder() { ... }
 */
export function Auth(options: AuthOptions = {}) {
  const decorators = [
    UseGuards(JwtAuthGuard),
    ApiBearerAuth(),
    ApiUnauthorizedResponse({ description: 'Unauthorized - Invalid or missing token' }),
  ];

  // Add role-based authorization if specified
  if (options.roles && options.roles.length > 0) {
    decorators.push(
      UseGuards(RolesGuard),
      Roles(...options.roles),
      ApiForbiddenResponse({ description: 'Forbidden - Insufficient role permissions' }),
    );
  }

  // Add permission-based authorization if specified
  if (options.permissions && options.permissions.length > 0) {
    decorators.push(
      UseGuards(RolesGuard),
      Permissions(...options.permissions),
      ApiForbiddenResponse({ description: 'Forbidden - Insufficient permissions' }),
    );
  }

  // Add resource-level access control if specified
  if (options.resourceAccess) {
    decorators.push(
      UseGuards(ResourceAccessGuard),
      ResourceAccess(options.resourceAccess),
      ApiForbiddenResponse({ description: 'Forbidden - Insufficient resource permissions' }),
    );
  }

  // Add session validation if required
  if (options.requireSession) {
    decorators.push(
      UseGuards(SessionGuard),
      ApiUnauthorizedResponse({ description: 'Unauthorized - Invalid or expired session' }),
    );
  }

  return applyDecorators(...decorators);
}