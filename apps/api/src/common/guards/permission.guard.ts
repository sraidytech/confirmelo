import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthorizationService } from '../../modules/auth/services/authorization.service';
import { Permission } from '../constants/permissions';
import { PERMISSIONS_KEY, RESOURCE_KEY } from '../decorators/permissions.decorator';

@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private authorizationService: AuthorizationService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredPermissions = this.reflector.getAllAndOverride<Permission[]>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredPermissions) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user) {
      throw new ForbiddenException('User not authenticated');
    }

    // Get resource context from decorator or request params
    const resourceContext = this.reflector.get(RESOURCE_KEY, context.getHandler());
    const context_data = this.buildPermissionContext(request, resourceContext);

    // Check each required permission
    for (const permission of requiredPermissions) {
      const hasPermission = await this.authorizationService.checkPermission(
        user.id,
        permission,
        context_data,
      );

      if (!hasPermission) {
        throw new ForbiddenException(`Insufficient permissions: ${permission}`);
      }
    }

    return true;
  }

  private buildPermissionContext(request: any, resourceContext?: any): any {
    const context: any = {};

    // Extract organization ID from various sources
    if (request.params?.organizationId) {
      context.organizationId = request.params.organizationId;
    } else if (request.body?.organizationId) {
      context.organizationId = request.body.organizationId;
    } else if (request.user?.organizationId) {
      context.organizationId = request.user.organizationId;
    }

    // Extract resource information if specified
    if (resourceContext) {
      if (resourceContext.type) {
        context.resourceType = resourceContext.type;
      }

      if (resourceContext.idParam && request.params[resourceContext.idParam]) {
        context.resourceId = request.params[resourceContext.idParam];
      }
    }

    return context;
  }
}