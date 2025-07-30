import { Injectable, ConflictException, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../common/database/prisma.service';
import { AuthorizationService } from '../../common/services/authorization.service';
import { UserRole, UserStatus } from '@prisma/client';
import { 
  CreateUserDto, 
  UpdateUserDto, 
  UserSuspensionDto, 
  UserActivationDto,
  CreateTeamDto,
  UpdateTeamDto,
  AddTeamMembersDto,
  RemoveTeamMembersDto,
  AssignStoresToTeamDto,
  UnassignStoresFromTeamDto,
  BulkUserOperationDto,
} from './dto';
import * as bcrypt from 'bcrypt';

interface GetUsersOptions {
  page: number;
  limit: number;
  search?: string;
  role?: string;
  status?: string;
}

@Injectable()
export class AdminService {
  constructor(
    private prismaService: PrismaService,
    private authorizationService: AuthorizationService,
  ) {}

  async getUsers(organizationId: string, options: GetUsersOptions) {
    const { page, limit, search, role, status } = options;
    const skip = (page - 1) * limit;

    // Build where clause
    const where: any = {
      organizationId,
      deletedAt: null,
    };

    if (search) {
      where.OR = [
        { firstName: { contains: search, mode: 'insensitive' } },
        { lastName: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
        { username: { contains: search, mode: 'insensitive' } },
      ];
    }

    if (role && Object.values(UserRole).includes(role as UserRole)) {
      where.role = role as UserRole;
    }

    if (status && Object.values(UserStatus).includes(status as UserStatus)) {
      where.status = status as UserStatus;
    }

    // Get users with pagination
    const [users, total] = await Promise.all([
      this.prismaService.user.findMany({
        where,
        skip,
        take: Number(limit),
        orderBy: [
          { createdAt: 'desc' },
        ],
        select: {
          id: true,
          email: true,
          username: true,
          firstName: true,
          lastName: true,
          phone: true,
          avatar: true,
          role: true,
          status: true,
          isOnline: true,
          lastActiveAt: true,
          organizationId: true,
          createdAt: true,
          updatedAt: true,
          organization: {
            select: {
              id: true,
              name: true,
              code: true,
            },
          },
        },
      }),
      this.prismaService.user.count({ where }),
    ]);

    return {
      users,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Create a new user (Admin only)
   */
  async createUser(organizationId: string, createUserData: CreateUserDto, createdBy: string) {
    // Check if email or username already exists
    const existingUser = await this.prismaService.user.findFirst({
      where: {
        OR: [
          { email: createUserData.email },
          { username: createUserData.username },
        ],
      },
    });

    if (existingUser) {
      if (existingUser.email === createUserData.email) {
        throw new ConflictException('Email already exists');
      }
      if (existingUser.username === createUserData.username) {
        throw new ConflictException('Username already exists');
      }
    }

    // Validate password strength
    const passwordValidation = this.validatePasswordStrength(createUserData.password);
    if (!passwordValidation.isValid) {
      throw new BadRequestException({
        message: 'Password does not meet security requirements',
        errors: passwordValidation.errors,
      });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(createUserData.password, 12);

    // Create user
    const newUser = await this.prismaService.user.create({
      data: {
        email: createUserData.email,
        username: createUserData.username,
        password: hashedPassword,
        firstName: createUserData.firstName,
        lastName: createUserData.lastName,
        phone: createUserData.phone,
        avatar: createUserData.avatar,
        role: createUserData.role,
        status: UserStatus.ACTIVE,
        organizationId,
      },
      include: {
        organization: {
          select: {
            id: true,
            name: true,
            code: true,
          },
        },
      },
    });

    // Log user creation in audit log
    await this.prismaService.auditLog.create({
      data: {
        userId: createdBy,
        organizationId,
        action: 'USER_CREATED',
        entityType: 'User',
        entityId: newUser.id,
        newValue: {
          email: newUser.email,
          username: newUser.username,
          role: newUser.role,
          status: newUser.status,
        } as any,
      },
    });

    // Remove password from response
    const { password, ...userResponse } = newUser;
    return userResponse;
  }

  /**
   * Update user details and role (Admin only)
   */
  async updateUser(userId: string, organizationId: string, updateData: UpdateUserDto, updatedBy: string) {
    // Get current user
    const currentUser = await this.prismaService.user.findFirst({
      where: {
        id: userId,
        organizationId,
        deletedAt: null,
      },
    });

    if (!currentUser) {
      throw new NotFoundException('User not found');
    }

    // Prevent admins from updating their own role
    if (userId === updatedBy && updateData.role) {
      throw new ForbiddenException('Cannot change your own role');
    }

    // Check if email or username already exists (if being updated)
    if (updateData.email || updateData.username) {
      const existingUser = await this.prismaService.user.findFirst({
        where: {
          AND: [
            { id: { not: userId } },
            {
              OR: [
                updateData.email ? { email: updateData.email } : {},
                updateData.username ? { username: updateData.username } : {},
              ].filter(condition => Object.keys(condition).length > 0),
            },
          ],
        },
      });

      if (existingUser) {
        if (existingUser.email === updateData.email) {
          throw new ConflictException('Email already exists');
        }
        if (existingUser.username === updateData.username) {
          throw new ConflictException('Username already exists');
        }
      }
    }

    // Store previous values for audit log
    const previousValues = {
      email: currentUser.email,
      username: currentUser.username,
      firstName: currentUser.firstName,
      lastName: currentUser.lastName,
      phone: currentUser.phone,
      role: currentUser.role,
      avatar: currentUser.avatar,
    };

    // Update user
    const updatedUser = await this.prismaService.user.update({
      where: { id: userId },
      data: {
        ...updateData,
        updatedAt: new Date(),
      },
      include: {
        organization: {
          select: {
            id: true,
            name: true,
            code: true,
          },
        },
      },
    });

    // Log user update in audit log
    await this.prismaService.auditLog.create({
      data: {
        userId: updatedBy,
        organizationId,
        action: 'USER_UPDATED',
        entityType: 'User',
        entityId: userId,
        previousValue: previousValues as any,
        newValue: updateData as any,
      },
    });

    // Invalidate user permissions cache if role was changed
    if (updateData.role) {
      await this.authorizationService.invalidateUserPermissions(userId);
    }

    // Remove password from response
    const { password, ...userResponse } = updatedUser;
    return userResponse;
  }

  /**
   * Suspend a user (Admin only)
   */
  async suspendUser(userId: string, organizationId: string, suspensionData: UserSuspensionDto, suspendedBy: string) {
    // Get current user
    const user = await this.prismaService.user.findFirst({
      where: {
        id: userId,
        organizationId,
        deletedAt: null,
      },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Prevent admins from suspending themselves
    if (userId === suspendedBy) {
      throw new ForbiddenException('Cannot suspend your own account');
    }

    // Check if user is already suspended
    if (user.status === UserStatus.SUSPENDED) {
      throw new BadRequestException('User is already suspended');
    }

    const previousStatus = user.status;

    // Update user status to suspended
    const updatedUser = await this.prismaService.user.update({
      where: { id: userId },
      data: {
        status: UserStatus.SUSPENDED,
        isOnline: false, // Set user offline when suspended
        updatedAt: new Date(),
      },
      include: {
        organization: {
          select: {
            id: true,
            name: true,
            code: true,
          },
        },
      },
    });

    // Log suspension in audit log
    await this.prismaService.auditLog.create({
      data: {
        userId: suspendedBy,
        organizationId,
        action: 'USER_SUSPENDED',
        entityType: 'User',
        entityId: userId,
        previousValue: { status: previousStatus } as any,
        newValue: { status: UserStatus.SUSPENDED, reason: suspensionData.reason } as any,
      },
    });

    // Invalidate user permissions cache
    await this.authorizationService.invalidateUserPermissions(userId);

    // Remove password from response
    const { password, ...userResponse } = updatedUser;

    return {
      user: userResponse,
      previousStatus,
      newStatus: UserStatus.SUSPENDED,
      changedBy: suspendedBy,
      changedAt: new Date(),
      reason: suspensionData.reason,
    };
  }

  /**
   * Activate a user (Admin only)
   */
  async activateUser(userId: string, organizationId: string, activationData: UserActivationDto, activatedBy: string) {
    // Get current user
    const user = await this.prismaService.user.findFirst({
      where: {
        id: userId,
        organizationId,
        deletedAt: null,
      },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Check if user is already active
    if (user.status === UserStatus.ACTIVE) {
      throw new BadRequestException('User is already active');
    }

    const previousStatus = user.status;

    // Update user status to active
    const updatedUser = await this.prismaService.user.update({
      where: { id: userId },
      data: {
        status: UserStatus.ACTIVE,
        updatedAt: new Date(),
      },
      include: {
        organization: {
          select: {
            id: true,
            name: true,
            code: true,
          },
        },
      },
    });

    // Log activation in audit log
    await this.prismaService.auditLog.create({
      data: {
        userId: activatedBy,
        organizationId,
        action: 'USER_ACTIVATED',
        entityType: 'User',
        entityId: userId,
        previousValue: { status: previousStatus } as any,
        newValue: { status: UserStatus.ACTIVE, reason: activationData.reason } as any,
      },
    });

    // Invalidate user permissions cache
    await this.authorizationService.invalidateUserPermissions(userId);

    // Remove password from response
    const { password, ...userResponse } = updatedUser;

    return {
      user: userResponse,
      previousStatus,
      newStatus: UserStatus.ACTIVE,
      changedBy: activatedBy,
      changedAt: new Date(),
      reason: activationData.reason,
    };
  }

  // ==================== TEAM MANAGEMENT METHODS ====================

  /**
   * Get all teams in organization
   */
  async getTeams(organizationId: string, options: { page: number; limit: number; search?: string }) {
    const { page, limit, search } = options;
    const skip = (page - 1) * limit;

    const where: any = {
      organizationId,
      deletedAt: null,
    };

    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [teams, total] = await Promise.all([
      this.prismaService.team.findMany({
        where,
        skip,
        take: Number(limit),
        orderBy: [{ createdAt: 'desc' }],
        include: {
          leader: {
            select: {
              id: true,
              email: true,
              firstName: true,
              lastName: true,
              role: true,
            },
          },
          members: {
            include: {
              user: {
                select: {
                  id: true,
                  email: true,
                  firstName: true,
                  lastName: true,
                  role: true,
                  isOnline: true,
                },
              },
            },
          },
          storeAssignments: {
            include: {
              store: {
                select: {
                  id: true,
                  name: true,
                  code: true,
                  isActive: true,
                },
              },
            },
          },
        },
      }),
      this.prismaService.team.count({ where }),
    ]);

    const formattedTeams = teams.map(team => ({
      id: team.id,
      name: team.name,
      description: team.description,
      leaderId: team.leaderId,
      leader: team.leader,
      members: team.members.map(member => ({
        id: member.user.id,
        email: member.user.email,
        fullName: `${member.user.firstName} ${member.user.lastName}`,
        role: member.user.role,
        joinedAt: member.joinedAt,
        isOnline: member.user.isOnline,
      })),
      stores: team.storeAssignments.map(assignment => ({
        id: assignment.store.id,
        name: assignment.store.name,
        code: assignment.store.code,
        assignedAt: assignment.assignedAt,
        isActive: assignment.store.isActive,
      })),
      memberCount: team.members.length,
      storeCount: team.storeAssignments.length,
      createdAt: team.createdAt,
      updatedAt: team.updatedAt,
    }));

    return {
      teams: formattedTeams,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Get team by ID
   */
  async getTeamById(teamId: string, organizationId: string) {
    const team = await this.prismaService.team.findFirst({
      where: {
        id: teamId,
        organizationId,
        deletedAt: null,
      },
      include: {
        leader: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            role: true,
          },
        },
        members: {
          include: {
            user: {
              select: {
                id: true,
                email: true,
                firstName: true,
                lastName: true,
                role: true,
                isOnline: true,
              },
            },
          },
        },
        storeAssignments: {
          include: {
            store: {
              select: {
                id: true,
                name: true,
                code: true,
                isActive: true,
              },
            },
          },
        },
      },
    });

    if (!team) {
      throw new NotFoundException('Team not found');
    }

    return {
      id: team.id,
      name: team.name,
      description: team.description,
      leaderId: team.leaderId,
      leader: team.leader,
      members: team.members.map(member => ({
        id: member.user.id,
        email: member.user.email,
        fullName: `${member.user.firstName} ${member.user.lastName}`,
        role: member.user.role,
        joinedAt: member.joinedAt,
        isOnline: member.user.isOnline,
      })),
      stores: team.storeAssignments.map(assignment => ({
        id: assignment.store.id,
        name: assignment.store.name,
        code: assignment.store.code,
        assignedAt: assignment.assignedAt,
        isActive: assignment.store.isActive,
      })),
      memberCount: team.members.length,
      storeCount: team.storeAssignments.length,
      createdAt: team.createdAt,
      updatedAt: team.updatedAt,
    };
  }

  /**
   * Create a new team
   */
  async createTeam(organizationId: string, createTeamData: CreateTeamDto, createdBy: string) {
    // Verify leader exists and belongs to organization
    const leader = await this.prismaService.user.findFirst({
      where: {
        id: createTeamData.leaderId,
        organizationId,
        deletedAt: null,
        role: { in: ['ADMIN', 'TEAM_LEADER', 'SUPER_ADMIN'] },
      },
    });

    if (!leader) {
      throw new NotFoundException('Team leader not found or invalid role');
    }

    // Check if team name already exists in organization
    const existingTeam = await this.prismaService.team.findFirst({
      where: {
        name: createTeamData.name,
        organizationId,
        deletedAt: null,
      },
    });

    if (existingTeam) {
      throw new ConflictException('Team name already exists');
    }

    // Verify members exist if provided
    if (createTeamData.memberIds && createTeamData.memberIds.length > 0) {
      const members = await this.prismaService.user.findMany({
        where: {
          id: { in: createTeamData.memberIds },
          organizationId,
          deletedAt: null,
        },
      });

      if (members.length !== createTeamData.memberIds.length) {
        throw new BadRequestException('One or more team members not found');
      }
    }

    // Verify stores exist if provided
    if (createTeamData.storeIds && createTeamData.storeIds.length > 0) {
      const stores = await this.prismaService.store.findMany({
        where: {
          id: { in: createTeamData.storeIds },
          organizationId,
          deletedAt: null,
        },
      });

      if (stores.length !== createTeamData.storeIds.length) {
        throw new BadRequestException('One or more stores not found');
      }
    }

    // Create team with transaction
    const team = await this.prismaService.$transaction(async (prisma) => {
      // Create team
      const newTeam = await prisma.team.create({
        data: {
          name: createTeamData.name,
          description: createTeamData.description,
          organizationId,
          leaderId: createTeamData.leaderId,
        },
      });

      // Add team members if provided
      if (createTeamData.memberIds && createTeamData.memberIds.length > 0) {
        await prisma.teamMember.createMany({
          data: createTeamData.memberIds.map(userId => ({
            teamId: newTeam.id,
            userId,
          })),
        });
      }

      // Assign stores if provided
      if (createTeamData.storeIds && createTeamData.storeIds.length > 0) {
        await prisma.teamStore.createMany({
          data: createTeamData.storeIds.map(storeId => ({
            teamId: newTeam.id,
            storeId,
          })),
        });
      }

      return newTeam;
    });

    // Log team creation
    await this.prismaService.auditLog.create({
      data: {
        userId: createdBy,
        organizationId,
        action: 'TEAM_CREATED',
        entityType: 'Team',
        entityId: team.id,
        newValue: {
          name: team.name,
          leaderId: team.leaderId,
          memberCount: createTeamData.memberIds?.length || 0,
          storeCount: createTeamData.storeIds?.length || 0,
        } as any,
      },
    });

    // Return formatted team
    return this.getTeamById(team.id, organizationId);
  }

  /**
   * Update team details
   */
  async updateTeam(teamId: string, organizationId: string, updateData: UpdateTeamDto, updatedBy: string) {
    const team = await this.prismaService.team.findFirst({
      where: {
        id: teamId,
        organizationId,
        deletedAt: null,
      },
    });

    if (!team) {
      throw new NotFoundException('Team not found');
    }

    // Verify new leader if provided
    if (updateData.leaderId) {
      const leader = await this.prismaService.user.findFirst({
        where: {
          id: updateData.leaderId,
          organizationId,
          deletedAt: null,
          role: { in: ['ADMIN', 'TEAM_LEADER', 'SUPER_ADMIN'] },
        },
      });

      if (!leader) {
        throw new NotFoundException('Team leader not found or invalid role');
      }
    }

    // Check name uniqueness if changing name
    if (updateData.name && updateData.name !== team.name) {
      const existingTeam = await this.prismaService.team.findFirst({
        where: {
          name: updateData.name,
          organizationId,
          deletedAt: null,
          id: { not: teamId },
        },
      });

      if (existingTeam) {
        throw new ConflictException('Team name already exists');
      }
    }

    const previousValues = {
      name: team.name,
      description: team.description,
      leaderId: team.leaderId,
    };

    // Update team
    const updatedTeam = await this.prismaService.team.update({
      where: { id: teamId },
      data: {
        ...updateData,
        updatedAt: new Date(),
      },
    });

    // Log team update
    await this.prismaService.auditLog.create({
      data: {
        userId: updatedBy,
        organizationId,
        action: 'TEAM_UPDATED',
        entityType: 'Team',
        entityId: teamId,
        previousValue: previousValues as any,
        newValue: updateData as any,
      },
    });

    return this.getTeamById(teamId, organizationId);
  }

  /**
   * Delete team
   */
  async deleteTeam(teamId: string, organizationId: string, deletedBy: string) {
    const team = await this.prismaService.team.findFirst({
      where: {
        id: teamId,
        organizationId,
        deletedAt: null,
      },
    });

    if (!team) {
      throw new NotFoundException('Team not found');
    }

    // Soft delete team
    await this.prismaService.team.update({
      where: { id: teamId },
      data: {
        deletedAt: new Date(),
        updatedAt: new Date(),
      },
    });

    // Log team deletion
    await this.prismaService.auditLog.create({
      data: {
        userId: deletedBy,
        organizationId,
        action: 'TEAM_DELETED',
        entityType: 'Team',
        entityId: teamId,
        previousValue: { name: team.name, leaderId: team.leaderId } as any,
      },
    });

    return { success: true, message: 'Team deleted successfully' };
  }

  /**
   * Add members to team
   */
  async addTeamMembers(teamId: string, organizationId: string, memberData: AddTeamMembersDto, addedBy: string) {
    const team = await this.prismaService.team.findFirst({
      where: {
        id: teamId,
        organizationId,
        deletedAt: null,
      },
    });

    if (!team) {
      throw new NotFoundException('Team not found');
    }

    // Verify users exist and belong to organization
    const users = await this.prismaService.user.findMany({
      where: {
        id: { in: memberData.userIds },
        organizationId,
        deletedAt: null,
      },
    });

    if (users.length !== memberData.userIds.length) {
      throw new BadRequestException('One or more users not found');
    }

    // Check for existing memberships
    const existingMemberships = await this.prismaService.teamMember.findMany({
      where: {
        teamId,
        userId: { in: memberData.userIds },
        leftAt: null,
      },
    });

    const existingUserIds = existingMemberships.map(m => m.userId);
    const newUserIds = memberData.userIds.filter(id => !existingUserIds.includes(id));

    if (newUserIds.length === 0) {
      throw new BadRequestException('All users are already team members');
    }

    // Add new members
    await this.prismaService.teamMember.createMany({
      data: newUserIds.map(userId => ({
        teamId,
        userId,
      })),
    });

    // Log member addition
    await this.prismaService.auditLog.create({
      data: {
        userId: addedBy,
        organizationId,
        action: 'TEAM_MEMBERS_ADDED',
        entityType: 'Team',
        entityId: teamId,
        newValue: { addedUserIds: newUserIds } as any,
      },
    });

    return {
      success: true,
      message: 'Team members added successfully',
      affectedCount: newUserIds.length,
      team: await this.getTeamById(teamId, organizationId),
    };
  }

  /**
   * Remove members from team
   */
  async removeTeamMembers(teamId: string, organizationId: string, memberData: RemoveTeamMembersDto, removedBy: string) {
    const team = await this.prismaService.team.findFirst({
      where: {
        id: teamId,
        organizationId,
        deletedAt: null,
      },
    });

    if (!team) {
      throw new NotFoundException('Team not found');
    }

    // Find existing memberships
    const memberships = await this.prismaService.teamMember.findMany({
      where: {
        teamId,
        userId: { in: memberData.userIds },
        leftAt: null,
      },
    });

    if (memberships.length === 0) {
      throw new BadRequestException('No active memberships found for specified users');
    }

    // Update memberships to mark as left
    await this.prismaService.teamMember.updateMany({
      where: {
        teamId,
        userId: { in: memberData.userIds },
        leftAt: null,
      },
      data: {
        leftAt: new Date(),
      },
    });

    // Log member removal
    await this.prismaService.auditLog.create({
      data: {
        userId: removedBy,
        organizationId,
        action: 'TEAM_MEMBERS_REMOVED',
        entityType: 'Team',
        entityId: teamId,
        newValue: { removedUserIds: memberData.userIds } as any,
      },
    });

    return {
      success: true,
      message: 'Team members removed successfully',
      affectedCount: memberships.length,
      team: await this.getTeamById(teamId, organizationId),
    };
  }

  /**
   * Assign stores to team
   */
  async assignStoresToTeam(teamId: string, organizationId: string, storeData: AssignStoresToTeamDto, assignedBy: string) {
    const team = await this.prismaService.team.findFirst({
      where: {
        id: teamId,
        organizationId,
        deletedAt: null,
      },
    });

    if (!team) {
      throw new NotFoundException('Team not found');
    }

    // Verify stores exist and belong to organization
    const stores = await this.prismaService.store.findMany({
      where: {
        id: { in: storeData.storeIds },
        organizationId,
        deletedAt: null,
      },
    });

    if (stores.length !== storeData.storeIds.length) {
      throw new BadRequestException('One or more stores not found');
    }

    // Check for existing assignments
    const existingAssignments = await this.prismaService.teamStore.findMany({
      where: {
        teamId,
        storeId: { in: storeData.storeIds },
      },
    });

    const existingStoreIds = existingAssignments.map(a => a.storeId);
    const newStoreIds = storeData.storeIds.filter(id => !existingStoreIds.includes(id));

    if (newStoreIds.length === 0) {
      throw new BadRequestException('All stores are already assigned to this team');
    }

    // Create new assignments
    await this.prismaService.teamStore.createMany({
      data: newStoreIds.map(storeId => ({
        teamId,
        storeId,
      })),
    });

    // Log store assignment
    await this.prismaService.auditLog.create({
      data: {
        userId: assignedBy,
        organizationId,
        action: 'STORES_ASSIGNED_TO_TEAM',
        entityType: 'Team',
        entityId: teamId,
        newValue: { assignedStoreIds: newStoreIds } as any,
      },
    });

    return {
      success: true,
      message: 'Stores assigned to team successfully',
      affectedCount: newStoreIds.length,
      team: await this.getTeamById(teamId, organizationId),
    };
  }

  /**
   * Unassign stores from team
   */
  async unassignStoresFromTeam(teamId: string, organizationId: string, storeData: UnassignStoresFromTeamDto, unassignedBy: string) {
    const team = await this.prismaService.team.findFirst({
      where: {
        id: teamId,
        organizationId,
        deletedAt: null,
      },
    });

    if (!team) {
      throw new NotFoundException('Team not found');
    }

    // Find existing assignments
    const assignments = await this.prismaService.teamStore.findMany({
      where: {
        teamId,
        storeId: { in: storeData.storeIds },
      },
    });

    if (assignments.length === 0) {
      throw new BadRequestException('No store assignments found for specified stores');
    }

    // Delete assignments
    await this.prismaService.teamStore.deleteMany({
      where: {
        teamId,
        storeId: { in: storeData.storeIds },
      },
    });

    // Log store unassignment
    await this.prismaService.auditLog.create({
      data: {
        userId: unassignedBy,
        organizationId,
        action: 'STORES_UNASSIGNED_FROM_TEAM',
        entityType: 'Team',
        entityId: teamId,
        newValue: { unassignedStoreIds: storeData.storeIds } as any,
      },
    });

    return {
      success: true,
      message: 'Stores unassigned from team successfully',
      affectedCount: assignments.length,
      team: await this.getTeamById(teamId, organizationId),
    };
  }

  /**
   * Perform bulk user operations
   */
  async performBulkUserOperation(organizationId: string, operationData: BulkUserOperationDto, performedBy: string) {
    const { userIds, operation, teamId, newRole } = operationData;

    // Validate operation type first
    const validOperations = ['assign_to_team', 'remove_from_team', 'change_role'];
    if (!validOperations.includes(operation)) {
      throw new BadRequestException('Invalid operation type');
    }

    // Verify users exist and belong to organization
    const users = await this.prismaService.user.findMany({
      where: {
        id: { in: userIds },
        organizationId,
        deletedAt: null,
      },
    });

    const foundUserIds = users.map(u => u.id);
    const notFoundUserIds = userIds.filter(id => !foundUserIds.includes(id));
    const errors: string[] = [];

    let successCount = 0;
    let processedCount = userIds.length;

    switch (operation) {
      case 'assign_to_team':
        if (!teamId) {
          throw new BadRequestException('Team ID is required for team assignment operation');
        }

        // Verify team exists
        const team = await this.prismaService.team.findFirst({
          where: {
            id: teamId,
            organizationId,
            deletedAt: null,
          },
        });

        if (!team) {
          throw new NotFoundException('Team not found');
        }

        // Check existing memberships
        const existingMemberships = await this.prismaService.teamMember.findMany({
          where: {
            teamId,
            userId: { in: foundUserIds },
            leftAt: null,
          },
        });

        const existingMemberIds = existingMemberships.map(m => m.userId);
        const newMemberIds = foundUserIds.filter(id => !existingMemberIds.includes(id));

        if (newMemberIds.length > 0) {
          await this.prismaService.teamMember.createMany({
            data: newMemberIds.map(userId => ({
              teamId,
              userId,
            })),
          });
          successCount = newMemberIds.length;
        }

        // Add errors for already existing members
        existingMemberIds.forEach(id => {
          errors.push(`${id}: User is already a team member`);
        });

        break;

      case 'remove_from_team':
        if (!teamId) {
          throw new BadRequestException('Team ID is required for team removal operation');
        }

        // Find and update memberships
        const memberships = await this.prismaService.teamMember.findMany({
          where: {
            teamId,
            userId: { in: foundUserIds },
            leftAt: null,
          },
        });

        if (memberships.length > 0) {
          await this.prismaService.teamMember.updateMany({
            where: {
              teamId,
              userId: { in: foundUserIds },
              leftAt: null,
            },
            data: {
              leftAt: new Date(),
            },
          });
          successCount = memberships.length;
        }

        // Add errors for non-members
        const memberIds = memberships.map(m => m.userId);
        foundUserIds.filter(id => !memberIds.includes(id)).forEach(id => {
          errors.push(`${id}: User is not a team member`);
        });

        break;

      case 'change_role':
        if (!newRole || !Object.values(UserRole).includes(newRole as UserRole)) {
          throw new BadRequestException('Valid role is required for role change operation');
        }

        // Update user roles
        await this.prismaService.user.updateMany({
          where: {
            id: { in: foundUserIds },
            organizationId,
          },
          data: {
            role: newRole as UserRole,
            updatedAt: new Date(),
          },
        });

        // Invalidate permissions for all affected users
        for (const userId of foundUserIds) {
          await this.authorizationService.invalidateUserPermissions(userId);
        }

        successCount = foundUserIds.length;
        break;
    }

    // Add errors for not found users
    notFoundUserIds.forEach(id => {
      errors.push(`${id}: User not found`);
    });

    // Log bulk operation
    await this.prismaService.auditLog.create({
      data: {
        userId: performedBy,
        organizationId,
        action: `BULK_${operation.toUpperCase()}`,
        entityType: 'User',
        entityId: 'bulk_operation',
        newValue: {
          operation,
          userIds: foundUserIds,
          teamId,
          newRole,
          successCount,
          errorCount: errors.length,
        } as any,
      },
    });

    return {
      success: true,
      message: 'Bulk operation completed successfully',
      processedCount,
      successCount,
      failedCount: errors.length,
      errors: errors.length > 0 ? errors : undefined,
    };
  }

  /**
   * Validate password strength
   */
  private validatePasswordStrength(password: string): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (password.length < 8) {
      errors.push('Password must be at least 8 characters long');
    }

    if (password.length > 128) {
      errors.push('Password must not exceed 128 characters');
    }

    if (!/[a-z]/.test(password)) {
      errors.push('Password must contain at least one lowercase letter');
    }

    if (!/[A-Z]/.test(password)) {
      errors.push('Password must contain at least one uppercase letter');
    }

    if (!/\d/.test(password)) {
      errors.push('Password must contain at least one number');
    }

    if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
      errors.push('Password must contain at least one special character');
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }
}