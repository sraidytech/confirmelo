import { Injectable, BadRequestException, NotFoundException, Inject, forwardRef } from '@nestjs/common';
import { PrismaService } from '../../../common/database/prisma.service';
import { AuditLogService } from '../../../common/services/audit-log.service';
import { AuthorizationService } from './authorization.service';
import { UserRole } from '@prisma/client';
import { getPermissionsForRole } from '../../../common/constants/permissions';
import { RealtimeNotificationService } from '../../websocket/services/realtime-notification.service';

export interface RoleAssignmentDto {
    userId: string;
    role: UserRole;
    organizationId?: string;
    assignedBy: string;
    reason?: string;
}

export interface TeamAssignmentDto {
    userId: string;
    teamId: string;
    isLeader?: boolean;
    assignedBy: string;
}

export interface StoreAssignmentDto {
    teamId: string;
    storeId: string;
    assignedBy: string;
}

@Injectable()
export class RoleManagementService {
    constructor(
        private prisma: PrismaService,
        private auditLogService: AuditLogService,
        private authorizationService: AuthorizationService,
        @Inject(forwardRef(() => RealtimeNotificationService))
        private realtimeNotificationService: RealtimeNotificationService,
    ) { }

    /**
     * Assign role to user
     */
    async assignRole(assignment: RoleAssignmentDto): Promise<void> {
        // Validate the assignment
        await this.validateRoleAssignment(assignment);

        // Get current user data
        const user = await this.prisma.user.findUnique({
            where: { id: assignment.userId },
            include: { organization: true },
        });

        if (!user) {
            throw new NotFoundException('User not found');
        }

        const previousRole = user.role;

        // Update user role
        await this.prisma.user.update({
            where: { id: assignment.userId },
            data: {
                role: assignment.role,
                updatedAt: new Date(),
            },
        });

        // Log the role change
        await this.auditLogService.logUserEvent(
            AuditLogService.ACTIONS.ROLE_ASSIGNED,
            assignment.userId,
            assignment.organizationId || user.organizationId,
            assignment.assignedBy,
            { role: previousRole },
            { role: assignment.role, reason: assignment.reason },
        );

        // Update user permissions cache
        await this.authorizationService.updateUserPermissions(assignment.userId);

        // Broadcast permission update in real-time
        await this.realtimeNotificationService.broadcastPermissionUpdate({
            userId: assignment.userId,
            oldRole: previousRole,
            newRole: assignment.role,
            updatedBy: assignment.assignedBy,
            timestamp: new Date(),
            organizationId: assignment.organizationId || user.organizationId,
        });
    }

    /**
     * Remove role from user (set to default)
     */
    async removeRole(userId: string, removedBy: string, reason?: string): Promise<void> {
        const user = await this.prisma.user.findUnique({
            where: { id: userId },
            include: { organization: true },
        });

        if (!user) {
            throw new NotFoundException('User not found');
        }

        const previousRole = user.role;
        const defaultRole = UserRole.CLIENT_USER;

        await this.prisma.user.update({
            where: { id: userId },
            data: {
                role: defaultRole,
                updatedAt: new Date(),
            },
        });

        // Log the role removal
        await this.prisma.auditLog.create({
            data: {
                action: 'ROLE_REMOVED',
                entityType: 'USER',
                entityId: userId,
                userId: removedBy,
                organizationId: user.organizationId,
                previousValue: { role: previousRole },
                newValue: { role: defaultRole, reason },
                ipAddress: null,
                userAgent: null,
            },
        });

        // Update user permissions cache
        await this.authorizationService.updateUserPermissions(userId);
    }

    /**
     * Assign user to team
     */
    async assignToTeam(assignment: TeamAssignmentDto): Promise<void> {
        // Validate team exists and user has access
        const team = await this.prisma.team.findUnique({
            where: { id: assignment.teamId },
            include: { organization: true },
        });

        if (!team) {
            throw new NotFoundException('Team not found');
        }

        const user = await this.prisma.user.findUnique({
            where: { id: assignment.userId },
        });

        if (!user) {
            throw new NotFoundException('User not found');
        }

        // Check if user belongs to the same organization
        if (user.organizationId !== team.organizationId) {
            throw new BadRequestException('User and team must belong to the same organization');
        }

        // Check if assignment already exists
        const existingAssignment = await this.prisma.teamMember.findFirst({
            where: {
                teamId: assignment.teamId,
                userId: assignment.userId,
            },
        });

        if (existingAssignment) {
            throw new BadRequestException('User is already assigned to this team');
        }

        // Create team assignment
        await this.prisma.teamMember.create({
            data: {
                userId: assignment.userId,
                teamId: assignment.teamId,
                joinedAt: new Date(),
            },
        });

        // If user should be team leader, update team
        if (assignment.isLeader) {
            await this.prisma.team.update({
                where: { id: assignment.teamId },
                data: { leaderId: assignment.userId },
            });
        }

        // Log the assignment
        await this.prisma.auditLog.create({
            data: {
                action: 'TEAM_ASSIGNED',
                entityType: 'TEAM_MEMBER',
                entityId: `${assignment.userId}-${assignment.teamId}`,
                userId: assignment.assignedBy,
                organizationId: team.organizationId,
                newValue: {
                    userId: assignment.userId,
                    teamId: assignment.teamId,
                    isLeader: assignment.isLeader,
                },
                ipAddress: null,
                userAgent: null,
            },
        });

        // Update user permissions cache
        await this.authorizationService.updateUserPermissions(assignment.userId);
    }

    /**
     * Remove user from team
     */
    async removeFromTeam(userId: string, teamId: string, removedBy: string): Promise<void> {
        const teamMember = await this.prisma.teamMember.findFirst({
            where: {
                teamId,
                userId,
            },
            include: {
                team: true,
            },
        });

        if (!teamMember) {
            throw new NotFoundException('Team assignment not found');
        }

        // Remove team membership
        await this.prisma.teamMember.delete({
            where: {
                id: teamMember.id,
            },
        });

        // If user was team leader, remove leadership
        if (teamMember.team.leaderId === userId) {
            await this.prisma.team.update({
                where: { id: teamId },
                data: { leaderId: null },
            });
        }

        // Log the removal
        await this.prisma.auditLog.create({
            data: {
                action: 'TEAM_REMOVED',
                entityType: 'TEAM_MEMBER',
                entityId: `${userId}-${teamId}`,
                userId: removedBy,
                organizationId: teamMember.team.organizationId,
                previousValue: {
                    userId,
                    teamId,
                    wasLeader: teamMember.team.leaderId === userId,
                },
                ipAddress: null,
                userAgent: null,
            },
        });

        // Update user permissions cache
        await this.authorizationService.updateUserPermissions(userId);
    }

    /**
     * Assign team to store
     */
    async assignTeamToStore(assignment: StoreAssignmentDto): Promise<void> {
        // Validate team and store exist
        const team = await this.prisma.team.findUnique({
            where: { id: assignment.teamId },
        });

        const store = await this.prisma.store.findUnique({
            where: { id: assignment.storeId },
        });

        if (!team) {
            throw new NotFoundException('Team not found');
        }

        if (!store) {
            throw new NotFoundException('Store not found');
        }

        // Check if assignment already exists
        const existingAssignment = await this.prisma.teamStore.findFirst({
            where: {
                teamId: assignment.teamId,
                storeId: assignment.storeId,
            },
        });

        if (existingAssignment) {
            throw new BadRequestException('Team is already assigned to this store');
        }

        // Create store assignment
        await this.prisma.teamStore.create({
            data: {
                teamId: assignment.teamId,
                storeId: assignment.storeId,
                assignedAt: new Date(),
            },
        });

        // Log the assignment
        await this.prisma.auditLog.create({
            data: {
                action: 'STORE_ASSIGNED',
                entityType: 'TEAM_STORE_ASSIGNMENT',
                entityId: `${assignment.teamId}-${assignment.storeId}`,
                userId: assignment.assignedBy,
                organizationId: team.organizationId,
                newValue: {
                    teamId: assignment.teamId,
                    storeId: assignment.storeId,
                },
                ipAddress: null,
                userAgent: null,
            },
        });

        // Update permissions cache for all team members
        const teamMembers = await this.prisma.teamMember.findMany({
            where: { teamId: assignment.teamId },
            select: { userId: true },
        });

        await Promise.all(
            teamMembers.map(member =>
                this.authorizationService.updateUserPermissions(member.userId)
            )
        );
    }

    /**
     * Remove team from store
     */
    async removeTeamFromStore(teamId: string, storeId: string, removedBy: string): Promise<void> {
        const assignment = await this.prisma.teamStore.findFirst({
            where: {
                teamId,
                storeId,
            },
            include: {
                team: true,
            },
        });

        if (!assignment) {
            throw new NotFoundException('Store assignment not found');
        }

        // Remove store assignment
        await this.prisma.teamStore.delete({
            where: {
                id: assignment.id,
            },
        });

        // Log the removal
        await this.prisma.auditLog.create({
            data: {
                action: 'STORE_REMOVED',
                entityType: 'TEAM_STORE_ASSIGNMENT',
                entityId: `${teamId}-${storeId}`,
                userId: removedBy,
                organizationId: assignment.team.organizationId,
                previousValue: {
                    teamId,
                    storeId,
                },
                ipAddress: null,
                userAgent: null,
            },
        });

        // Update permissions cache for all team members
        const teamMembers = await this.prisma.teamMember.findMany({
            where: { teamId },
            select: { userId: true },
        });

        await Promise.all(
            teamMembers.map(member =>
                this.authorizationService.updateUserPermissions(member.userId)
            )
        );
    }

    /**
     * Get user's role history
     */
    async getUserRoleHistory(userId: string): Promise<any[]> {
        return this.prisma.auditLog.findMany({
            where: {
                entityType: 'USER',
                entityId: userId,
                action: {
                    in: ['ROLE_ASSIGNED', 'ROLE_REMOVED'],
                },
            },
            orderBy: { createdAt: 'desc' },
        });
    }

    /**
     * Get available roles for assignment
     */
    getAvailableRoles(assignerRole: UserRole): UserRole[] {
        switch (assignerRole) {
            case UserRole.SUPER_ADMIN:
                return Object.values(UserRole);
            case UserRole.ADMIN:
                return [
                    UserRole.TEAM_LEADER,
                    UserRole.CALL_CENTER_AGENT,
                    UserRole.FOLLOWUP_AGENT,
                    UserRole.CLIENT_ADMIN,
                    UserRole.CLIENT_USER,
                ];
            case UserRole.CLIENT_ADMIN:
                return [
                    UserRole.TEAM_LEADER,
                    UserRole.CALL_CENTER_AGENT,
                    UserRole.FOLLOWUP_AGENT,
                    UserRole.CLIENT_USER,
                ];
            default:
                return [];
        }
    }

    /**
     * Get user permissions summary
     */
    async getUserPermissionsSummary(userId: string): Promise<{
        role: UserRole;
        permissions: string[];
        teams: string[];
        stores: string[];
    }> {
        const user = await this.prisma.user.findUnique({
            where: { id: userId },
            include: {
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
                leadingTeams: {
                    include: {
                        storeAssignments: {
                            select: { storeId: true },
                        },
                    },
                },
            },
        });

        if (!user) {
            throw new NotFoundException('User not found');
        }

        const permissions = getPermissionsForRole(user.role);
        const teams = [
            ...user.teamMemberships.map(tm => tm.teamId),
            ...user.leadingTeams.map(lt => lt.id),
        ];
        const stores = [
            ...user.teamMemberships.flatMap(tm => tm.team.storeAssignments.map(sa => sa.storeId)),
            ...user.leadingTeams.flatMap(lt => lt.storeAssignments.map(sa => sa.storeId)),
        ];

        return {
            role: user.role,
            permissions,
            teams: [...new Set(teams)], // Remove duplicates
            stores: [...new Set(stores)], // Remove duplicates
        };
    }

    /**
     * Check if user can manage another user
     */
    async canManageUser(managerId: string, targetUserId: string): Promise<boolean> {
        const manager = await this.prisma.user.findUnique({
            where: { id: managerId },
        });

        const targetUser = await this.prisma.user.findUnique({
            where: { id: targetUserId },
        });

        if (!manager || !targetUser) {
            return false;
        }

        // Super admin can manage anyone
        if (manager.role === UserRole.SUPER_ADMIN) {
            return true;
        }

        // Admin can manage users in their organization
        if (manager.role === UserRole.ADMIN && manager.organizationId === targetUser.organizationId) {
            return true;
        }

        // Client admin can manage users in their organization (except other admins)
        if (
            manager.role === UserRole.CLIENT_ADMIN &&
            manager.organizationId === targetUser.organizationId &&
            targetUser.role !== UserRole.ADMIN &&
            targetUser.role !== UserRole.SUPER_ADMIN
        ) {
            return true;
        }

        // Team leaders can manage their team members
        if (manager.role === UserRole.TEAM_LEADER) {
            const teamMembership = await this.prisma.teamMember.findFirst({
                where: {
                    userId: targetUserId,
                    team: {
                        leaderId: managerId,
                    },
                },
            });
            return !!teamMembership;
        }

        return false;
    }

    /**
     * Validate role assignment
     */
    private async validateRoleAssignment(assignment: RoleAssignmentDto): Promise<void> {
        // Check if assigner has permission to assign this role
        const assigner = await this.prisma.user.findUnique({
            where: { id: assignment.assignedBy },
        });

        if (!assigner) {
            throw new NotFoundException('Assigner not found');
        }

        const availableRoles = this.getAvailableRoles(assigner.role);
        if (!availableRoles.includes(assignment.role)) {
            throw new BadRequestException(
                `You don't have permission to assign the role: ${assignment.role}`,
            );
        }

        // Validate organization scope
        if (assignment.organizationId && assigner.role !== UserRole.SUPER_ADMIN) {
            if (assigner.organizationId !== assignment.organizationId) {
                throw new BadRequestException(
                    'You can only assign roles within your organization',
                );
            }
        }

        // Check if assigner can manage the target user
        const canManage = await this.canManageUser(assignment.assignedBy, assignment.userId);
        if (!canManage) {
            throw new BadRequestException('You do not have permission to manage this user');
        }
    }
}