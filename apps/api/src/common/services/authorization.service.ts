import { Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { RedisService } from '../redis/redis.service';
import { UserRole } from '@prisma/client';

export interface Permission {
  resource: string;
  actions: string[];
  scope?: {
    organizationId?: string;
    storeIds?: string[];
    teamIds?: string[];
    clientIds?: string[];
  };
}

@Injectable()
export class AuthorizationService {
  constructor(
    private prismaService: PrismaService,
    private redisService: RedisService,
  ) {}

  /**
   * Check if user has specific permissions
   */
  async checkUserPermissions(userId: string, requiredPermissions: string[]): Promise<boolean> {
    const userPermissions = await this.getUserPermissions(userId);
    
    return requiredPermissions.every(required => {
      const [resource, action] = required.split(':');
      return userPermissions.some(permission => 
        permission.resource === resource && permission.actions.includes(action)
      );
    });
  }

  /**
   * Check if user has permission for a specific resource and action
   */
  async checkResourcePermission(
    userId: string,
    resource: string,
    action: string,
    resourceId?: string,
  ): Promise<boolean> {
    const user = await this.getUserWithContext(userId);
    if (!user) return false;

    // Get role-based permissions
    const rolePermissions = this.getRolePermissions(user.role);
    
    // Check if role has the required permission
    const hasRolePermission = rolePermissions.some(permission =>
      permission.resource === resource && permission.actions.includes(action)
    );

    if (!hasRolePermission) return false;

    // If no specific resource ID, role permission is sufficient
    if (!resourceId) return true;

    // Check resource-level access based on user's assignments
    return this.checkResourceAccess(user, resource, resourceId);
  }

  /**
   * Check if user owns a specific resource
   */
  async checkResourceOwnership(userId: string, resource: string, resourceId: string): Promise<boolean> {
    switch (resource) {
      case 'order':
        const order = await this.prismaService.order.findUnique({
          where: { id: resourceId },
          select: { assignedAgentId: true },
        });
        return order?.assignedAgentId === userId;

      case 'user':
        return resourceId === userId;

      case 'team':
        const team = await this.prismaService.team.findUnique({
          where: { id: resourceId },
          select: { leaderId: true },
        });
        return team?.leaderId === userId;

      default:
        return false;
    }
  }

  /**
   * Get user permissions based on role and assignments
   */
  async getUserPermissions(userId: string): Promise<Permission[]> {
    // Try to get from cache first
    const cacheKey = `user_permissions:${userId}`;
    const cached = await this.redisService.get(cacheKey);
    if (cached) return cached;

    const user = await this.getUserWithContext(userId);
    if (!user) return [];

    const permissions = this.getRolePermissions(user.role);
    
    // Add scope based on user's assignments
    const scopedPermissions = permissions.map(permission => ({
      ...permission,
      scope: this.getUserScope(user),
    }));

    // Cache for 5 minutes
    await this.redisService.set(cacheKey, scopedPermissions, 300);

    return scopedPermissions;
  }

  /**
   * Invalidate user permissions cache
   */
  async invalidateUserPermissions(userId: string): Promise<void> {
    await this.redisService.del(`user_permissions:${userId}`);
  }

  /**
   * Get role-based permissions
   */
  private getRolePermissions(role: UserRole): Permission[] {
    const permissions: Record<UserRole, Permission[]> = {
      SUPER_ADMIN: [
        { resource: '*', actions: ['*'] }, // Full system access
      ],
      ADMIN: [
        { resource: 'organization', actions: ['read', 'write', 'delete'] },
        { resource: 'user', actions: ['read', 'write', 'delete'] },
        { resource: 'team', actions: ['read', 'write', 'delete'] },
        { resource: 'store', actions: ['read', 'write', 'delete'] },
        { resource: 'order', actions: ['read', 'write', 'assign'] },
        { resource: 'analytics', actions: ['read'] },
        { resource: 'settings', actions: ['read', 'write'] },
      ],
      TEAM_LEADER: [
        { resource: 'team', actions: ['read', 'write'] },
        { resource: 'user', actions: ['read'] },
        { resource: 'store', actions: ['read'] },
        { resource: 'order', actions: ['read', 'write', 'assign'] },
        { resource: 'analytics', actions: ['read'] },
      ],
      CALL_CENTER_AGENT: [
        { resource: 'order', actions: ['read', 'write'] },
        { resource: 'customer', actions: ['read', 'write'] },
        { resource: 'call', actions: ['read', 'write'] },
      ],
      FOLLOWUP_AGENT: [
        { resource: 'order', actions: ['read', 'write'] },
        { resource: 'customer', actions: ['read'] },
        { resource: 'reminder', actions: ['read', 'write'] },
      ],
      CLIENT_ADMIN: [
        { resource: 'organization', actions: ['read', 'write'] },
        { resource: 'user', actions: ['read', 'write'] },
        { resource: 'order', actions: ['read'] },
        { resource: 'analytics', actions: ['read'] },
      ],
      CLIENT_USER: [
        { resource: 'order', actions: ['read'] },
        { resource: 'analytics', actions: ['read'] },
      ],
    };

    return permissions[role] || [];
  }

  /**
   * Get user with context (teams, organization, etc.)
   */
  private async getUserWithContext(userId: string) {
    return this.prismaService.user.findUnique({
      where: { id: userId },
      include: {
        organization: true,
        leadingTeams: {
          include: {
            storeAssignments: {
              select: { storeId: true },
            },
          },
        },
        teamMemberships: {
          include: {
            team: {
              include: {
                storeAssignments: {
                  select: { storeId: true },
                },
              },
            },
          },
        },
      },
    });
  }

  /**
   * Get user's access scope based on assignments
   */
  private getUserScope(user: any): Permission['scope'] {
    const scope: Permission['scope'] = {};

    if (user.organizationId) {
      scope.organizationId = user.organizationId;
    }

    // Collect store IDs from team leadership and membership
    const storeIds = new Set<string>();
    
    user.leadingTeams?.forEach((team: any) => {
      team.storeAssignments?.forEach((assignment: any) => {
        storeIds.add(assignment.storeId);
      });
    });

    user.teamMemberships?.forEach((membership: any) => {
      membership.team.storeAssignments?.forEach((assignment: any) => {
        storeIds.add(assignment.storeId);
      });
    });

    if (storeIds.size > 0) {
      scope.storeIds = Array.from(storeIds);
    }

    // Collect team IDs
    const teamIds = new Set<string>();
    user.leadingTeams?.forEach((team: any) => teamIds.add(team.id));
    user.teamMemberships?.forEach((membership: any) => teamIds.add(membership.team.id));

    if (teamIds.size > 0) {
      scope.teamIds = Array.from(teamIds);
    }

    return scope;
  }

  /**
   * Check resource-level access based on user's scope
   */
  private async checkResourceAccess(user: any, resource: string, resourceId: string): Promise<boolean> {
    const scope = this.getUserScope(user);

    switch (resource) {
      case 'order':
        // Check if order belongs to user's assigned stores or teams
        const order = await this.prismaService.order.findUnique({
          where: { id: resourceId },
          select: { storeId: true, assignedAgentId: true },
        });

        if (!order) return false;

        // User can access their own assigned orders
        if (order.assignedAgentId === user.id) return true;

        // Check store access
        if (scope.storeIds?.includes(order.storeId)) return true;

        return false;

      case 'store':
        return scope.storeIds?.includes(resourceId) || false;

      case 'team':
        return scope.teamIds?.includes(resourceId) || false;

      case 'user':
        // Users in the same organization can access each other (with proper role permissions)
        const targetUser = await this.prismaService.user.findUnique({
          where: { id: resourceId },
          select: { organizationId: true },
        });

        return targetUser?.organizationId === scope.organizationId;

      default:
        return true; // Allow access for unknown resources (will be handled by role permissions)
    }
  }
}