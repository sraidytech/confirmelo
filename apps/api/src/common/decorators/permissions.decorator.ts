import { SetMetadata } from '@nestjs/common';
import { Permission } from '../constants/permissions';

export const PERMISSIONS_KEY = 'permissions';
export const RESOURCE_KEY = 'resource';

/**
 * Decorator to require specific permissions for a route
 */
export const RequirePermissions = (...permissions: string[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);

/**
 * Decorator to specify resource context for permission checking
 */
export const ResourceContext = (resourceType: string, resourceIdParam?: string) =>
  SetMetadata(RESOURCE_KEY, { resourceType, resourceIdParam });

/**
 * Combined decorator for permissions with resource context
 */
export const RequirePermissionsWithResource = (
  permissions: string[],
  resourceType: string,
  resourceIdParam?: string,
) => {
  return (target: any, propertyKey: string, descriptor: PropertyDescriptor) => {
    RequirePermissions(...permissions)(target, propertyKey, descriptor);
    ResourceContext(resourceType, resourceIdParam)(target, propertyKey, descriptor);
  };
};

/**
 * Decorator for organization-scoped permissions
 */
export const RequireOrganizationPermissions = (...permissions: string[]) => {
  return (target: any, propertyKey: string, descriptor: PropertyDescriptor) => {
    RequirePermissions(...permissions)(target, propertyKey, descriptor);
    ResourceContext('ORGANIZATION', 'organizationId')(target, propertyKey, descriptor);
  };
};

/**
 * Decorator for store-scoped permissions
 */
export const RequireStorePermissions = (...permissions: string[]) => {
  return (target: any, propertyKey: string, descriptor: PropertyDescriptor) => {
    RequirePermissions(...permissions)(target, propertyKey, descriptor);
    ResourceContext('STORE', 'storeId')(target, propertyKey, descriptor);
  };
};

/**
 * Decorator for team-scoped permissions
 */
export const RequireTeamPermissions = (...permissions: string[]) => {
  return (target: any, propertyKey: string, descriptor: PropertyDescriptor) => {
    RequirePermissions(...permissions)(target, propertyKey, descriptor);
    ResourceContext('TEAM', 'teamId')(target, propertyKey, descriptor);
  };
};

/**
 * Decorator for order-scoped permissions
 */
export const RequireOrderPermissions = (...permissions: string[]) => {
  return (target: any, propertyKey: string, descriptor: PropertyDescriptor) => {
    RequirePermissions(...permissions)(target, propertyKey, descriptor);
    ResourceContext('ORDER', 'orderId')(target, propertyKey, descriptor);
  };
};