import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../../common/database/prisma.service';
import { RedisService } from '../../../common/redis/redis.service';
import { UserRole } from '@prisma/client';

export interface TeamAssignmentData {
  teamId: string;
  userId: string;
  assignedBy: string;
}

export interface StoreAssignmentData {
  teamId: string;
  storeId: string;
  assignedBy: string;
}

export interface UserAccessValidation {
  hasAccess: boolean;
  reason?: string;
  teamIds?: string[];
  storeIds?: string[];
}

@Injectable()
export class TeamAssignmentService {
  private readonly CACHE_TTL = 300; // 5 minutes
  private readonly CACHE_PREFIX = 'team_access:';

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) { }

  /**
   * Assign a user to a team
   */
  async assignUserToTeam(data: TeamAssignmentData): Promise<void> {
    const { teamId, userId, assignedBy } = data;

    // Validate team exists and get organization
    const team = await this.prisma.team.findUnique({
      where: { id: teamId },
      include: { organization: true, leader: true },
    });

    if (!team) {
      throw new NotFoundException('Team not found');
    }

    // Validate user exists and belongs to same organization
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (user.organizationId !== team.organizationId) {
      throw new BadRequestException('User and team must belong to the same organization');
    }

    // Check if user is already a team member
    const existingMembership = await this.prisma.teamMember.findUnique({
      where: {
        teamId_userId: {
          teamId,
          userId,
        },
      },
    });

    if (existingMembership && !existingMembership.leftAt) {
      throw new BadRequestException('User is already a member of this team');
    }

    // If user was previously a member but left, reactivate membership
    if (existingMembership && existingMembership.leftAt) {
      await this.prisma.teamMember.update({
        where: { id: existingMembership.id },
        data: {
          leftAt: null,
          joinedAt: new Date(),
        },
      });
    } else {
      // Create new team membership
      await this.prisma.teamMember.create({
        data: {
          teamId,
          userId,
          joinedAt: new Date(),
        },
      });
    }

    // Clear cache for user access
    await this.clearUserAccessCache(userId);

    // Log the assignment
    await this.logTeamAssignment(teamId, userId, assignedBy, 'ASSIGNED');
  }

  /**
   * Remove a user from a team
   */
  async removeUserFromTeam(teamId: string, userId: string, removedBy: string): Promise<void> {
    // Validate team membership exists
    const membership = await this.prisma.teamMember.findUnique({
      where: {
        teamId_userId: {
          teamId,
          userId,
        },
      },
      include: {
        team: { include: { leader: true } },
        user: true,
      },
    });

    if (!membership || membership.leftAt) {
      throw new NotFoundException('User is not a member of this team');
    }

    // Prevent removing team leader from their own team
    if (membership.team.leaderId === userId) {
      throw new BadRequestException('Cannot remove team leader from their own team');
    }

    // Update membership to mark as left
    await this.prisma.teamMember.update({
      where: { id: membership.id },
      data: {
        leftAt: new Date(),
      },
    });

    // Clear cache for user access
    await this.clearUserAccessCache(userId);

    // Log the removal
    await this.logTeamAssignment(teamId, userId, removedBy, 'REMOVED');
  }

  /**
   * Assign a store to a team
   */
  async assignStoreToTeam(data: StoreAssignmentData): Promise<void> {
    const { teamId, storeId, assignedBy } = data;

    // Validate team exists
    const team = await this.prisma.team.findUnique({
      where: { id: teamId },
      include: { organization: true },
    });

    if (!team) {
      throw new NotFoundException('Team not found');
    }

    // Validate store exists and belongs to same organization
    const store = await this.prisma.store.findUnique({
      where: { id: storeId },
    });

    if (!store) {
      throw new NotFoundException('Store not found');
    }

    if (store.organizationId !== team.organizationId) {
      throw new BadRequestException('Store and team must belong to the same organization');
    }

    // Check if store is already assigned to team
    const existingAssignment = await this.prisma.teamStore.findUnique({
      where: {
        teamId_storeId: {
          teamId,
          storeId,
        },
      },
    });

    if (existingAssignment) {
      throw new BadRequestException('Store is already assigned to this team');
    }

    // Create store assignment
    await this.prisma.teamStore.create({
      data: {
        teamId,
        storeId,
        assignedAt: new Date(),
      },
    });

    // Clear cache for all team members
    await this.clearTeamAccessCache(teamId);

    // Log the assignment
    await this.logStoreAssignment(teamId, storeId, assignedBy, 'ASSIGNED');
  }

  /**
   * Remove a store from a team
   */
  async removeStoreFromTeam(teamId: string, storeId: string, removedBy: string): Promise<void> {
    // Validate assignment exists
    const assignment = await this.prisma.teamStore.findUnique({
      where: {
        teamId_storeId: {
          teamId,
          storeId,
        },
      },
    });

    if (!assignment) {
      throw new NotFoundException('Store is not assigned to this team');
    }

    // Remove store assignment
    await this.prisma.teamStore.delete({
      where: { id: assignment.id },
    });

    // Clear cache for all team members
    await this.clearTeamAccessCache(teamId);

    // Log the removal
    await this.logStoreAssignment(teamId, storeId, removedBy, 'REMOVED');
  }

  /**
   * Validate if a user has access to a specific store
   */
  async validateUserStoreAccess(userId: string, storeId: string): Promise<UserAccessValidation> {
    // Check cache first
    const cacheKey = `${this.CACHE_PREFIX}store:${userId}:${storeId}`;
    const cached = await this.redis.get(cacheKey);

    if (cached) {
      return cached;
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        teamMemberships: {
          where: { leftAt: null },
          include: {
            team: {
              include: {
                storeAssignments: {
                  where: { storeId },
                },
              },
            },
          },
        },
        leadingTeams: {
          include: {
            storeAssignments: {
              where: { storeId },
            },
          },
        },
      },
    });

    if (!user) {
      const result: UserAccessValidation = {
        hasAccess: false,
        reason: 'User not found',
      };
      await this.redis.set(cacheKey, result, this.CACHE_TTL);
      return result;
    }

    // Super admins and admins have access to all stores in their organization
    if (user.role === UserRole.SUPER_ADMIN || user.role === UserRole.ADMIN) {
      const store = await this.prisma.store.findUnique({
        where: { id: storeId },
      });

      if (store && store.organizationId === user.organizationId) {
        const result: UserAccessValidation = {
          hasAccess: true,
          reason: 'Admin access',
        };
        await this.redis.set(cacheKey, result, this.CACHE_TTL);
        return result;
      }
    }

    // Check team-based access
    const hasTeamAccess = user.teamMemberships.some(membership =>
      membership.team.storeAssignments.length > 0
    ) || user.leadingTeams.some(team =>
      team.storeAssignments.length > 0
    );

    const result: UserAccessValidation = {
      hasAccess: hasTeamAccess,
      reason: hasTeamAccess ? 'Team-based access' : 'No team access to store',
    };

    await this.redis.set(cacheKey, result, this.CACHE_TTL);
    return result;
  }

  /**
   * Validate if a user has access to a specific team
   */
  async validateUserTeamAccess(userId: string, teamId: string): Promise<UserAccessValidation> {
    // Check cache first
    const cacheKey = `${this.CACHE_PREFIX}team:${userId}:${teamId}`;
    const cached = await this.redis.get(cacheKey);

    if (cached) {
      return cached;
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        teamMemberships: {
          where: {
            teamId,
            leftAt: null,
          },
        },
        leadingTeams: {
          where: { id: teamId },
        },
      },
    });

    if (!user) {
      const result: UserAccessValidation = {
        hasAccess: false,
        reason: 'User not found',
      };
      await this.redis.set(cacheKey, result, this.CACHE_TTL);
      return result;
    }

    // Super admins and admins have access to all teams in their organization
    if (user.role === UserRole.SUPER_ADMIN || user.role === UserRole.ADMIN) {
      const team = await this.prisma.team.findUnique({
        where: { id: teamId },
      });

      if (team && team.organizationId === user.organizationId) {
        const result: UserAccessValidation = {
          hasAccess: true,
          reason: 'Admin access',
        };
        await this.redis.set(cacheKey, result, this.CACHE_TTL);
        return result;
      }
    }

    // Check if user is team leader or member
    const isLeader = user.leadingTeams.length > 0;
    const isMember = user.teamMemberships.length > 0;

    const result: UserAccessValidation = {
      hasAccess: isLeader || isMember,
      reason: isLeader ? 'Team leader' : isMember ? 'Team member' : 'No team access',
    };

    await this.redis.set(cacheKey, result, this.CACHE_TTL);
    return result;
  }

  /**
   * Get all stores accessible by a user
   */
  async getUserAccessibleStores(userId: string): Promise<string[]> {
    const cacheKey = `${this.CACHE_PREFIX}user_stores:${userId}`;
    const cached = await this.redis.get(cacheKey);

    if (cached) {
      return cached;
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        teamMemberships: {
          where: { leftAt: null },
          include: {
            team: {
              include: {
                storeAssignments: {
                  include: { store: true },
                },
              },
            },
          },
        },
        leadingTeams: {
          include: {
            storeAssignments: {
              include: { store: true },
            },
          },
        },
      },
    });

    if (!user) {
      return [];
    }

    let storeIds: string[] = [];

    // Super admins and admins have access to all stores in their organization
    if (user.role === UserRole.SUPER_ADMIN || user.role === UserRole.ADMIN) {
      const stores = await this.prisma.store.findMany({
        where: {
          organizationId: user.organizationId,
          isActive: true,
        },
        select: { id: true },
      });
      storeIds = stores.map(store => store.id);
    } else {
      // Get stores from team memberships
      const memberStores = user.teamMemberships.flatMap(membership =>
        membership.team.storeAssignments.map(assignment => assignment.storeId)
      );

      // Get stores from leading teams
      const leaderStores = user.leadingTeams.flatMap(team =>
        team.storeAssignments.map(assignment => assignment.storeId)
      );

      // Combine and deduplicate
      storeIds = [...new Set([...memberStores, ...leaderStores])];
    }

    await this.redis.set(cacheKey, storeIds, this.CACHE_TTL);
    return storeIds;
  }

  /**
   * Get all teams accessible by a user
   */
  async getUserAccessibleTeams(userId: string): Promise<string[]> {
    const cacheKey = `${this.CACHE_PREFIX}user_teams:${userId}`;
    const cached = await this.redis.get(cacheKey);

    if (cached) {
      return cached;
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        teamMemberships: {
          where: { leftAt: null },
          select: { teamId: true },
        },
        leadingTeams: {
          select: { id: true },
        },
      },
    });

    if (!user) {
      return [];
    }

    let teamIds: string[] = [];

    // Super admins and admins have access to all teams in their organization
    if (user.role === UserRole.SUPER_ADMIN || user.role === UserRole.ADMIN) {
      const teams = await this.prisma.team.findMany({
        where: {
          organizationId: user.organizationId,
          deletedAt: null,
        },
        select: { id: true },
      });
      teamIds = teams.map(team => team.id);
    } else {
      // Get teams from memberships
      const memberTeams = user.teamMemberships.map(membership => membership.teamId);

      // Get teams from leadership
      const leaderTeams = user.leadingTeams.map(team => team.id);

      // Combine and deduplicate
      teamIds = [...new Set([...memberTeams, ...leaderTeams])];
    }

    await this.redis.set(cacheKey, teamIds, this.CACHE_TTL);
    return teamIds;
  }

  /**
   * Clear user access cache
   */
  private async clearUserAccessCache(userId: string): Promise<void> {
    // Clear user-specific caches
    await this.redis.del(`${this.CACHE_PREFIX}user_stores:${userId}`);
    await this.redis.del(`${this.CACHE_PREFIX}user_teams:${userId}`);

    // Clear store and team access caches
    await this.redis.del(`${this.CACHE_PREFIX}store:${userId}:*`);
    await this.redis.del(`${this.CACHE_PREFIX}team:${userId}:*`);
  }

  /**
   * Clear team access cache for all team members
   */
  private async clearTeamAccessCache(teamId: string): Promise<void> {
    const teamMembers = await this.prisma.teamMember.findMany({
      where: {
        teamId,
        leftAt: null,
      },
      select: { userId: true },
    });

    const team = await this.prisma.team.findUnique({
      where: { id: teamId },
      select: { leaderId: true },
    });

    const userIds = [
      ...teamMembers.map(member => member.userId),
      ...(team ? [team.leaderId] : []),
    ];

    // Clear cache for all team members and leader
    for (const userId of [...new Set(userIds)]) {
      await this.clearUserAccessCache(userId);
    }
  }

  /**
   * Log team assignment activity
   */
  private async logTeamAssignment(
    teamId: string,
    userId: string,
    performedBy: string,
    action: 'ASSIGNED' | 'REMOVED',
  ): Promise<void> {
    const team = await this.prisma.team.findUnique({
      where: { id: teamId },
      select: { name: true, organizationId: true },
    });

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { firstName: true, lastName: true },
    });

    if (team && user) {
      await this.prisma.auditLog.create({
        data: {
          userId: performedBy,
          organizationId: team.organizationId,
          action: `TEAM_MEMBER_${action}`,
          entityType: 'TeamMember',
          entityId: `${teamId}:${userId}`,
          newValue: {
            teamId,
            teamName: team.name,
            userId,
            userName: `${user.firstName} ${user.lastName}`,
            action,
          },
        },
      });
    }
  }

  /**
   * Log store assignment activity
   */
  private async logStoreAssignment(
    teamId: string,
    storeId: string,
    performedBy: string,
    action: 'ASSIGNED' | 'REMOVED',
  ): Promise<void> {
    const team = await this.prisma.team.findUnique({
      where: { id: teamId },
      select: { name: true, organizationId: true },
    });

    const store = await this.prisma.store.findUnique({
      where: { id: storeId },
      select: { name: true },
    });

    if (team && store) {
      await this.prisma.auditLog.create({
        data: {
          userId: performedBy,
          organizationId: team.organizationId,
          action: `STORE_ASSIGNMENT_${action}`,
          entityType: 'TeamStore',
          entityId: `${teamId}:${storeId}`,
          newValue: {
            teamId,
            teamName: team.name,
            storeId,
            storeName: store.name,
            action,
          },
        },
      });
    }
  }
}