import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RESOURCE_ACCESS_KEY, ResourceAccessConfig } from '../decorators/resource-access.decorator';
import { AuthorizationService } from '../services/authorization.service';

@Injectable()
export class ResourceAccessGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private authorizationService: AuthorizationService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const resourceConfig = this.reflector.getAllAndOverride<ResourceAccessConfig>(
      RESOURCE_ACCESS_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!resourceConfig) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user) {
      throw new ForbiddenException('User not authenticated');
    }

    const { resource, action, resourceIdParam, allowOwner } = resourceConfig;

    // Extract resource ID from request parameters if specified
    let resourceId: string | undefined;
    if (resourceIdParam) {
      resourceId = request.params[resourceIdParam] || request.body[resourceIdParam];
    }

    // Check if user has permission for this resource and action
    const hasPermission = await this.authorizationService.checkResourcePermission(
      user.id,
      resource,
      action,
      resourceId,
    );

    if (hasPermission) {
      return true;
    }

    // If permission check failed but allowOwner is true, check ownership
    if (allowOwner && resourceId) {
      const isOwner = await this.authorizationService.checkResourceOwnership(
        user.id,
        resource,
        resourceId,
      );

      if (isOwner) {
        return true;
      }
    }

    throw new ForbiddenException(
      `Access denied. Insufficient permissions for ${action} on ${resource}`,
    );
  }
}