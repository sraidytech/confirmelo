import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../common/database/prisma.service';
import { RedisService } from '../../../common/redis/redis.service';
import { getPermissionsForRole } from '../../../common/constants/permissions';
import { UserRole } from '@prisma/client';

export interface UserPermissions {
  userId: string;
  role: UserRole;
  organizationId?: string;
  permissions: string[];
  assignments: ResourceAssignment[];
}

export interface ResourceAssignment {
  type: 'STORE' | 'TEAM' | 'CLIENT';
  resourceId: string;
  permissions: string[];
}

export interface PermissionContext {
  userId: string;
  organizationId?: string;
  resourceType?: string;
  resourceId?: string;
  action: string;
}

@Injectable()
export class AuthorizationService {
  constructor(
    private prisma: PrismaService,
    private redisService: RedisService,
  ) {}

  /**
   * Check if user has permission for a specific action
   */
  async checkPermission(
    userId: string,
    permission: string,
    context?: {
      organizationId?: string;
      resourceType?: string;
      resourceId?: string;
    },
  ): Promise<boolean> {
    try {
      const userPermissions = await this.getUserPermissions(userId);
      
      // Check if user has the base permission
      if (!userPermissions.permissions.includes(permission)) {
        return false;
      }

      // If no context is provided, base permission is sufficient
      if (!context) {
        return true;
      }

      // Check organization scope
      if (context.organizationId && userPermissions.organizationId !== context.organizationId) {
        // Super admins can access any organization
        if (userPermissions.role !== UserRole.SUPER_ADMIN) {
          return false;
        }
      }

      // Check resource-level permissions
      if (context.resourceType && context.resourceId) {
        return this.checkResourcePermission(userPermissions, permission, context.resourceType, context.resourceId);
      }

      return true;
    } catch (error) {
      console.error('Error checking permission:', error);
      return false;
    }
  }

  /**
   * Get all permissions for a user
   */
  async getUserPermissions(userId: string): Promise<UserPermissions> {
    // Try to get from cache first
    const cacheKey = `user_permissions:${userId}`;
    const cached = await this.redisService.get(cacheKey);
    
    if (cached) {
      return cached;
    }

    // Fetch from database
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        organization: true,
        teamMemberships: {
          include: {
            team: {
              include: {
                storeAssignments: true,
              },
            },
          },
        },
        leadingTeams: {
          include: {
            storeAssignments: true,
          },
        },
      },
    });

    if (!user) {
      throw new Error('User not found');
    }

    // Get base role permissions
    const rolePermissions = getPermissionsForRole(user.role);

    // Build resource assignments
    const assignments: ResourceAssignment[] = [];

    // Team leader assignments
    if (user.leadingTeams.length > 0) {
      for (const team of user.leadingTeams) {
        assignments.push({
          type: 'TEAM',
          resourceId: team.id,
          permissions: this.getTeamLeaderPermissions(),
        });

        // Store assignments through team leadership
        for (const storeAssignment of team.storeAssignments) {
          assignments.push({
            type: 'STORE',
            resourceId: storeAssignment.storeId,
            permissions: this.getStorePermissions(user.role),
          });
        }
      }
    }

    // Team member assignments
    for (const membership of user.teamMemberships) {
      assignments.push({
        type: 'TEAM',
        resourceId: membership.team.id,
        permissions: this.getTeamMemberPermissions(user.role),
      });

      // Store assignments through team membership
      for (const storeAssignment of membership.team.storeAssignments) {
        assignments.push({
          type: 'STORE',
          resourceId: storeAssignment.storeId,
          permissions: this.getStorePermissions(user.role),
        });
      }
    }

    const userPermissions: UserPermissions = {
      userId: user.id,
      role: user.role,
      organizationId: user.organizationId,
      permissions: rolePermissions,
      assignments,
    };

    // Cache for 5 minutes
    await this.redisService.set(cacheKey, userPermissions, 300);

    return userPermissions;
  }

  /**
   * Update user permissions (invalidate cache)
   */
  async updateUserPermissions(userId: string): Promise<void> {
    const cacheKey = `user_permissions:${userId}`;
    await this.redisService.del(cacheKey);

    // Broadcast permission update via WebSocket if needed
    // This would be handled by the WebSocket service
  }

  /**
   * Check if user can access a specific resource
   */
  async validateResourceAccess(
    userId: string,
    resourceId: string,
    resourceType: 'STORE' | 'TEAM' | 'ORDER' | 'CUSTOMER',
  ): Promise<boolean> {
    const userPermissions = await this.getUserPermissions(userId);

    // Super admins have access to everything
    if (userPermissions.role === UserRole.SUPER_ADMIN) {
      return true;
    }

    // Check organization scope first
    if (resourceType === 'ORDER' || resourceType === 'CUSTOMER') {
      const resource = await this.getResourceOrganization(resourceId, resourceType);
      if (resource && resource.organizationId !== userPermissions.organizationId) {
        return false;
      }
    }

    // Check specific resource assignments
    switch (resourceType) {
      case 'STORE':
        return this.hasStoreAccess(userPermissions, resourceId);
      case 'TEAM':
        return this.hasTeamAccess(userPermissions, resourceId);
      case 'ORDER':
        return this.hasOrderAccess(userPermissions, resourceId);
      case 'CUSTOMER':
        return this.hasCustomerAccess(userPermissions, resourceId);
      default:
        return false;
    }
  }

  /**
   * Get permissions for team leaders
   */
  private getTeamLeaderPermissions(): string[] {
    return [
      'teams:view',
      'teams:edit',
      'teams:manage_members',
      'orders:assign',
      'orders:view',
      'orders:edit',
      'analytics:view_basic',
    ];
  }

  /**
   * Get permissions for team members based on role
   */
  private getTeamMemberPermissions(role: UserRole): string[] {
    switch (role) {
      case UserRole.CALL_CENTER_AGENT:
        return [
          'orders:view',
          'orders:edit',
          'orders:confirm',
          'communication:make_calls',
          'communication:view_call_logs',
        ];
      case UserRole.FOLLOWUP_AGENT:
        return [
          'orders:view',
          'orders:edit',
          'communication:make_calls',
          'communication:view_call_logs',
        ];
      default:
        return [];
    }
  }

  /**
   * Get store-specific permissions based on role
   */
  private getStorePermissions(role: UserRole): string[] {
    switch (role) {
      case UserRole.ADMIN:
      case UserRole.TEAM_LEADER:
        return [
          'stores:view',
          'stores:edit',
          'orders:view',
          'orders:edit',
          'orders:create',
        ];
      case UserRole.CALL_CENTER_AGENT:
      case UserRole.FOLLOWUP_AGENT:
        return [
          'stores:view',
          'orders:view',
          'orders:edit',
        ];
      default:
        return ['stores:view'];
    }
  }

  /**
   * Check resource-level permission
   */
  private checkResourcePermission(
    userPermissions: UserPermissions,
    permission: string,
    resourceType: string,
    resourceId: string,
  ): boolean {
    const relevantAssignments = userPermissions.assignments.filter(
      assignment => assignment.type === resourceType.toUpperCase() && assignment.resourceId === resourceId,
    );

    return relevantAssignments.some(assignment => assignment.permissions.includes(permission));
  }

  /**
   * Check if user has access to a specific store
   */
  private hasStoreAccess(userPermissions: UserPermissions, storeId: string): boolean {
    // Admins have access to all stores in their organization
    if (userPermissions.role === UserRole.ADMIN || userPermissions.role === UserRole.CLIENT_ADMIN) {
      return true;
    }

    // Check store assignments
    return userPermissions.assignments.some(
      assignment => assignment.type === 'STORE' && assignment.resourceId === storeId,
    );
  }

  /**
   * Check if user has access to a specific team
   */
  private hasTeamAccess(userPermissions: UserPermissions, teamId: string): boolean {
    // Admins have access to all teams in their organization
    if (userPermissions.role === UserRole.ADMIN || userPermissions.role === UserRole.CLIENT_ADMIN) {
      return true;
    }

    // Check team assignments (as leader or member)
    return userPermissions.assignments.some(
      assignment => assignment.type === 'TEAM' && assignment.resourceId === teamId,
    );
  }

  /**
   * Check if user has access to a specific order
   */
  private async hasOrderAccess(userPermissions: UserPermissions, orderId: string): Promise<boolean> {
    // Admins have access to all orders in their organization
    if (userPermissions.role === UserRole.ADMIN || userPermissions.role === UserRole.CLIENT_ADMIN) {
      return true;
    }

    // Get order details to check store assignment
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: { storeId: true, assignedAgentId: true },
    });

    if (!order) {
      return false;
    }

    // Check if user is assigned to the order
    if (order.assignedAgentId === userPermissions.userId) {
      return true;
    }

    // Check if user has access to the store
    if (order.storeId) {
      return this.hasStoreAccess(userPermissions, order.storeId);
    }

    return false;
  }

  /**
   * Check if user has access to a specific customer
   */
  private async hasCustomerAccess(userPermissions: UserPermissions, customerId: string): Promise<boolean> {
    // Admins have access to all customers in their organization
    if (userPermissions.role === UserRole.ADMIN || userPermissions.role === UserRole.CLIENT_ADMIN) {
      return true;
    }

    // Get customer's orders to check store assignments
    const customerOrders = await this.prisma.order.findMany({
      where: { customerId },
      select: { storeId: true },
      distinct: ['storeId'],
    });

    // Check if user has access to any of the stores where this customer has orders
    for (const order of customerOrders) {
      if (order.storeId && this.hasStoreAccess(userPermissions, order.storeId)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Get resource organization for validation
   */
  private async getResourceOrganization(
    resourceId: string,
    resourceType: 'ORDER' | 'CUSTOMER',
  ): Promise<{ organizationId: string } | null> {
    switch (resourceType) {
      case 'ORDER':
        const order = await this.prisma.order.findUnique({
          where: { id: resourceId },
          select: { 
            store: { 
              select: { organizationId: true } 
            } 
          },
        });
        return order?.store || null;

      case 'CUSTOMER':
        const customer = await this.prisma.customer.findUnique({
          where: { id: resourceId },
          select: { organizationId: true },
        });
        return customer || null;

      default:
        return null;
    }
  }

  /**
   * Get all users with a specific permission
   */
  async getUsersWithPermission(
    permission: string,
    organizationId?: string,
  ): Promise<string[]> {
    const users = await this.prisma.user.findMany({
      where: organizationId ? { organizationId } : {},
      select: { id: true, role: true },
    });

    const usersWithPermission: string[] = [];

    for (const user of users) {
      const rolePermissions = getPermissionsForRole(user.role);
      if (rolePermissions.includes(permission)) {
        usersWithPermission.push(user.id);
      }
    }

    return usersWithPermission;
  }

  /**
   * Bulk permission check for multiple users
   */
  async bulkCheckPermissions(
    userIds: string[],
    permission: string,
    context?: {
      organizationId?: string;
      resourceType?: string;
      resourceId?: string;
    },
  ): Promise<Record<string, boolean>> {
    const results: Record<string, boolean> = {};

    await Promise.all(
      userIds.map(async (userId) => {
        results[userId] = await this.checkPermission(userId, permission, context);
      }),
    );

    return results;
  }

  /**
   * Get permission summary for a user
   */
  async getPermissionSummary(userId: string): Promise<{
    role: UserRole;
    permissions: string[];
    organizationAccess: boolean;
    storeAccess: string[];
    teamAccess: string[];
  }> {
    const userPermissions = await this.getUserPermissions(userId);

    return {
      role: userPermissions.role,
      permissions: userPermissions.permissions,
      organizationAccess: !!userPermissions.organizationId,
      storeAccess: userPermissions.assignments
        .filter(a => a.type === 'STORE')
        .map(a => a.resourceId),
      teamAccess: userPermissions.assignments
        .filter(a => a.type === 'TEAM')
        .map(a => a.resourceId),
    };
  }

  /**
   * Get filtered list of resources user can access
   */
  async getAccessibleResources(
    userId: string,
    resourceType: 'STORE' | 'TEAM' | 'ORDER',
    organizationId?: string,
  ): Promise<string[]> {
    const userPermissions = await this.getUserPermissions(userId);

    // Super admins can access everything
    if (userPermissions.role === UserRole.SUPER_ADMIN) {
      return this.getAllResourceIds(resourceType, organizationId);
    }

    // Organization admins can access all resources in their organization
    if (
      (userPermissions.role === UserRole.ADMIN || userPermissions.role === UserRole.CLIENT_ADMIN) &&
      (!organizationId || organizationId === userPermissions.organizationId)
    ) {
      return this.getAllResourceIds(resourceType, userPermissions.organizationId);
    }

    // Return resources from assignments
    return userPermissions.assignments
      .filter((assignment) => assignment.type === resourceType)
      .map((assignment) => assignment.resourceId);
  }

  /**
   * Get all resource IDs for a given type and organization
   */
  private async getAllResourceIds(
    resourceType: 'STORE' | 'TEAM' | 'ORDER',
    organizationId?: string,
  ): Promise<string[]> {
    const where = organizationId ? { organizationId } : {};

    switch (resourceType) {
      case 'STORE':
        const stores = await this.prisma.store.findMany({
          where,
          select: { id: true },
        });
        return stores.map((store) => store.id);

      case 'TEAM':
        const teams = await this.prisma.team.findMany({
          where,
          select: { id: true },
        });
        return teams.map((team) => team.id);

      case 'ORDER':
        const orders = await this.prisma.order.findMany({
          where,
          select: { id: true },
        });
        return orders.map((order) => order.id);

      default:
        return [];
    }
  }

  /**
   * Get user's effective permissions with context
   */
  async getUserEffectivePermissions(
    userId: string,
    context?: {
      organizationId?: string;
      resourceType?: string;
      resourceId?: string;
    },
  ): Promise<string[]> {
    const userPermissions = await this.getUserPermissions(userId);
    
    if (!context) {
      return userPermissions.permissions;
    }

    // Filter permissions based on context
    const effectivePermissions: string[] = [];
    
    for (const permission of userPermissions.permissions) {
      const hasPermission = await this.checkPermission(userId, permission, context);
      if (hasPermission) {
        effectivePermissions.push(permission);
      }
    }

    return effectivePermissions;
  }
}