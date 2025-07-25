import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthorizationService } from '../../modules/auth/services/authorization.service';
import { Permission } from '../constants/permissions';
import { PERMISSIONS_KEY, RESOURCE_KEY } from '../decorators/permissions.decorator';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private authorizationService: AuthorizationService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredPermissions = this.reflector.getAllAndOverride<string[]>(
      PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredPermissions) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user) {
      throw new UnauthorizedException('User not authenticated');
    }

    // Get resource context if specified
    const resourceContext = this.reflector.getAllAndOverride<{
      resourceType: string;
      resourceIdParam?: string;
    }>(RESOURCE_KEY, [context.getHandler(), context.getClass()]);

    // Build permission context
    const permissionContext: any = {
      organizationId: user.organizationId,
    };

    if (resourceContext) {
      permissionContext.resourceType = resourceContext.resourceType;
      
      if (resourceContext.resourceIdParam) {
        const resourceId = request.params[resourceContext.resourceIdParam] || 
                          request.body[resourceContext.resourceIdParam] ||
                          request.query[resourceContext.resourceIdParam];
        
        if (resourceId) {
          permissionContext.resourceId = resourceId;
        }
      }
    }

    // Check each required permission
    for (const permission of requiredPermissions) {
      const hasPermission = await this.authorizationService.checkPermission(
        user.id,
        permission,
        permissionContext,
      );

      if (!hasPermission) {
        throw new ForbiddenException(
          `Insufficient permissions. Required: ${permission}`,
        );
      }
    }

    return true;
  }
}