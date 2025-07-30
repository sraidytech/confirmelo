import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, NotFoundException, BadRequestException } from '@nestjs/common';
import { AdminService } from './admin.service';
import { PrismaService } from '../../common/database/prisma.service';
import { AuthorizationService } from '../../common/services/authorization.service';
import { UserRole, UserStatus } from '@prisma/client';
import {
  CreateTeamDto,
  UpdateTeamDto,
  AddTeamMembersDto,
  RemoveTeamMembersDto,
  AssignStoresToTeamDto,
  UnassignStoresFromTeamDto,
  BulkUserOperationDto,
} from './dto/team-management.dto';

describe('AdminService - Team Management', () => {
  let service: AdminService;
  let prismaService: PrismaService;
  let authorizationService: AuthorizationService;

  const mockOrganizationId = 'org-123';
  const mockUserId = 'user-123';
  const mockTeamId = 'team-123';
  const mockStoreId = 'store-123';

  const mockTeam = {
    id: mockTeamId,
    name: 'Test Team',
    description: 'Test team description',
    organizationId: mockOrganizationId,
    leaderId: mockUserId,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
  };

  const mockUser = {
    id: mockUserId,
    email: 'test@example.com',
    username: 'testuser',
    password: 'hashedpassword',
    firstName: 'Test',
    lastName: 'User',
    phone: '+1234567890',
    avatar: null,
    role: UserRole.TEAM_LEADER,
    status: UserStatus.ACTIVE,
    isOnline: false,
    lastActiveAt: null,
    organizationId: mockOrganizationId,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
  };

  const mockStore = {
    id: mockStoreId,
    name: 'Test Store',
    code: 'TEST',
    description: null,
    email: null,
    phone: null,
    address: null,
    city: null,
    organizationId: mockOrganizationId,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminService,
        {
          provide: PrismaService,
          useValue: {
            team: {
              findFirst: jest.fn(),
              findMany: jest.fn(),
              count: jest.fn(),
              create: jest.fn(),
              update: jest.fn(),
            },
            user: {
              findFirst: jest.fn(),
              findMany: jest.fn(),
              updateMany: jest.fn(),
            },
            store: {
              findMany: jest.fn(),
            },
            teamMember: {
              findMany: jest.fn(),
              createMany: jest.fn(),
              updateMany: jest.fn(),
            },
            teamStore: {
              findMany: jest.fn(),
              createMany: jest.fn(),
              deleteMany: jest.fn(),
            },
            auditLog: {
              create: jest.fn(),
            },
            $transaction: jest.fn(),
          },
        },
        {
          provide: AuthorizationService,
          useValue: {
            invalidateUserPermissions: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<AdminService>(AdminService);
    prismaService = module.get<PrismaService>(PrismaService);
    authorizationService = module.get<AuthorizationService>(AuthorizationService);
  });

  describe('getTeams', () => {
    it('should return paginated teams with members and stores', async () => {
      const mockTeamWithRelations = {
        ...mockTeam,
        leader: {
          id: mockUserId,
          email: 'leader@example.com',
          firstName: 'Team',
          lastName: 'Leader',
          role: UserRole.TEAM_LEADER,
        },
        members: [
          {
            user: {
              id: 'member-1',
              email: 'member1@example.com',
              firstName: 'Member',
              lastName: 'One',
              role: UserRole.CALL_CENTER_AGENT,
              isOnline: true,
            },
            joinedAt: new Date(),
          },
        ],
        storeAssignments: [
          {
            store: {
              id: mockStoreId,
              name: 'Test Store',
              code: 'TEST',
              isActive: true,
            },
            assignedAt: new Date(),
          },
        ],
      };

      jest.spyOn(prismaService.team, 'findMany').mockResolvedValue([mockTeamWithRelations]);
      jest.spyOn(prismaService.team, 'count').mockResolvedValue(1);

      const result = await service.getTeams(mockOrganizationId, {
        page: 1,
        limit: 20,
        search: 'Test',
      });

      expect(result.teams).toHaveLength(1);
      expect(result.teams[0]).toMatchObject({
        id: mockTeamId,
        name: 'Test Team',
        memberCount: 1,
        storeCount: 1,
      });
      expect(result.pagination).toEqual({
        page: 1,
        limit: 20,
        total: 1,
        pages: 1,
      });
    });
  });

  describe('createTeam', () => {
    const createTeamDto: CreateTeamDto = {
      name: 'New Team',
      description: 'New team description',
      leaderId: mockUserId,
      memberIds: ['member-1', 'member-2'],
      storeIds: [mockStoreId],
    };

    it('should create a team successfully', async () => {
      jest.spyOn(prismaService.user, 'findFirst').mockResolvedValue(mockUser);
      jest.spyOn(prismaService.team, 'findFirst').mockResolvedValue(null);
      jest.spyOn(prismaService.user, 'findMany').mockResolvedValue([
        { ...mockUser, id: 'member-1' },
        { ...mockUser, id: 'member-2' },
      ]);
      jest.spyOn(prismaService.store, 'findMany').mockResolvedValue([mockStore]);
      
      const mockTransaction = jest.fn().mockImplementation(async (callback) => {
        return callback({
          team: {
            create: jest.fn().mockResolvedValue(mockTeam),
          },
          teamMember: {
            createMany: jest.fn(),
          },
          teamStore: {
            createMany: jest.fn(),
          },
        });
      });
      jest.spyOn(prismaService, '$transaction').mockImplementation(mockTransaction);
      jest.spyOn(service, 'getTeamById').mockResolvedValue({
        ...mockTeam,
        leader: mockUser,
        members: [],
        stores: [],
        memberCount: 0,
        storeCount: 0,
      } as any);

      const result = await service.createTeam(mockOrganizationId, createTeamDto, mockUserId);

      expect(result).toBeDefined();
      expect(mockTransaction).toHaveBeenCalled();
      expect(prismaService.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          action: 'TEAM_CREATED',
          entityType: 'Team',
        }),
      });
    });

    it('should throw ConflictException if team name already exists', async () => {
      jest.spyOn(prismaService.user, 'findFirst').mockResolvedValue(mockUser);
      jest.spyOn(prismaService.team, 'findFirst').mockResolvedValue(mockTeam);

      await expect(
        service.createTeam(mockOrganizationId, createTeamDto, mockUserId)
      ).rejects.toThrow(ConflictException);
    });

    it('should throw NotFoundException if leader not found', async () => {
      jest.spyOn(prismaService.user, 'findFirst').mockResolvedValue(null);

      await expect(
        service.createTeam(mockOrganizationId, createTeamDto, mockUserId)
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException if members not found', async () => {
      jest.spyOn(prismaService.user, 'findFirst').mockResolvedValue(mockUser);
      jest.spyOn(prismaService.team, 'findFirst').mockResolvedValue(null);
      jest.spyOn(prismaService.user, 'findMany').mockResolvedValue([mockUser]); // Only 1 user found, but 2 requested

      await expect(
        service.createTeam(mockOrganizationId, createTeamDto, mockUserId)
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('updateTeam', () => {
    const updateTeamDto: UpdateTeamDto = {
      name: 'Updated Team',
      description: 'Updated description',
      leaderId: 'new-leader-id',
    };

    it('should update team successfully', async () => {
      jest.spyOn(prismaService.team, 'findFirst')
        .mockResolvedValueOnce(mockTeam) // First call to find the team
        .mockResolvedValueOnce(null); // Second call to check name uniqueness
      jest.spyOn(prismaService.user, 'findFirst').mockResolvedValue({
        ...mockUser,
        id: 'new-leader-id',
      });
      jest.spyOn(prismaService.team, 'update').mockResolvedValue({
        ...mockTeam,
        ...updateTeamDto,
      });
      jest.spyOn(service, 'getTeamById').mockResolvedValue({
        ...mockTeam,
        ...updateTeamDto,
        leader: mockUser,
        members: [],
        stores: [],
        memberCount: 0,
        storeCount: 0,
      } as any);

      const result = await service.updateTeam(mockTeamId, mockOrganizationId, updateTeamDto, mockUserId);

      expect(result).toBeDefined();
      expect(prismaService.team.update).toHaveBeenCalledWith({
        where: { id: mockTeamId },
        data: expect.objectContaining(updateTeamDto),
      });
      expect(prismaService.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          action: 'TEAM_UPDATED',
          entityType: 'Team',
        }),
      });
    });

    it('should throw NotFoundException if team not found', async () => {
      jest.spyOn(prismaService.team, 'findFirst').mockResolvedValue(null);

      await expect(
        service.updateTeam(mockTeamId, mockOrganizationId, updateTeamDto, mockUserId)
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('addTeamMembers', () => {
    const addMembersDto: AddTeamMembersDto = {
      userIds: ['member-1', 'member-2'],
    };

    it('should add team members successfully', async () => {
      jest.spyOn(prismaService.team, 'findFirst').mockResolvedValue(mockTeam);
      jest.spyOn(prismaService.user, 'findMany').mockResolvedValue([
        { ...mockUser, id: 'member-1' },
        { ...mockUser, id: 'member-2' },
      ]);
      jest.spyOn(prismaService.teamMember, 'findMany').mockResolvedValue([]);
      jest.spyOn(prismaService.teamMember, 'createMany').mockResolvedValue({ count: 2 });
      jest.spyOn(service, 'getTeamById').mockResolvedValue({
        ...mockTeam,
        leader: mockUser,
        members: [],
        stores: [],
        memberCount: 2,
        storeCount: 0,
      } as any);

      const result = await service.addTeamMembers(mockTeamId, mockOrganizationId, addMembersDto, mockUserId);

      expect(result.success).toBe(true);
      expect(result.affectedCount).toBe(2);
      expect(prismaService.teamMember.createMany).toHaveBeenCalled();
      expect(prismaService.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          action: 'TEAM_MEMBERS_ADDED',
          entityType: 'Team',
        }),
      });
    });

    it('should throw BadRequestException if all users are already members', async () => {
      jest.spyOn(prismaService.team, 'findFirst').mockResolvedValue(mockTeam);
      jest.spyOn(prismaService.user, 'findMany').mockResolvedValue([
        { ...mockUser, id: 'member-1' },
        { ...mockUser, id: 'member-2' },
      ]);
      jest.spyOn(prismaService.teamMember, 'findMany').mockResolvedValue([
        { userId: 'member-1', teamId: mockTeamId, leftAt: null },
        { userId: 'member-2', teamId: mockTeamId, leftAt: null },
      ] as any);

      await expect(
        service.addTeamMembers(mockTeamId, mockOrganizationId, addMembersDto, mockUserId)
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('removeTeamMembers', () => {
    const removeMembersDto: RemoveTeamMembersDto = {
      userIds: ['member-1', 'member-2'],
    };

    it('should remove team members successfully', async () => {
      jest.spyOn(prismaService.team, 'findFirst').mockResolvedValue(mockTeam);
      jest.spyOn(prismaService.teamMember, 'findMany').mockResolvedValue([
        { userId: 'member-1', teamId: mockTeamId, leftAt: null },
        { userId: 'member-2', teamId: mockTeamId, leftAt: null },
      ] as any);
      jest.spyOn(prismaService.teamMember, 'updateMany').mockResolvedValue({ count: 2 });
      jest.spyOn(service, 'getTeamById').mockResolvedValue({
        ...mockTeam,
        leader: mockUser,
        members: [],
        stores: [],
        memberCount: 0,
        storeCount: 0,
      } as any);

      const result = await service.removeTeamMembers(mockTeamId, mockOrganizationId, removeMembersDto, mockUserId);

      expect(result.success).toBe(true);
      expect(result.affectedCount).toBe(2);
      expect(prismaService.teamMember.updateMany).toHaveBeenCalledWith({
        where: {
          teamId: mockTeamId,
          userId: { in: ['member-1', 'member-2'] },
          leftAt: null,
        },
        data: {
          leftAt: expect.any(Date),
        },
      });
    });

    it('should throw BadRequestException if no active memberships found', async () => {
      jest.spyOn(prismaService.team, 'findFirst').mockResolvedValue(mockTeam);
      jest.spyOn(prismaService.teamMember, 'findMany').mockResolvedValue([]);

      await expect(
        service.removeTeamMembers(mockTeamId, mockOrganizationId, removeMembersDto, mockUserId)
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('assignStoresToTeam', () => {
    const assignStoresDto: AssignStoresToTeamDto = {
      storeIds: [mockStoreId, 'store-2'],
    };

    it('should assign stores to team successfully', async () => {
      jest.spyOn(prismaService.team, 'findFirst').mockResolvedValue(mockTeam);
      jest.spyOn(prismaService.store, 'findMany').mockResolvedValue([
        mockStore,
        { ...mockStore, id: 'store-2' },
      ]);
      jest.spyOn(prismaService.teamStore, 'findMany').mockResolvedValue([]);
      jest.spyOn(prismaService.teamStore, 'createMany').mockResolvedValue({ count: 2 });
      jest.spyOn(service, 'getTeamById').mockResolvedValue({
        ...mockTeam,
        leader: mockUser,
        members: [],
        stores: [],
        memberCount: 0,
        storeCount: 2,
      } as any);

      const result = await service.assignStoresToTeam(mockTeamId, mockOrganizationId, assignStoresDto, mockUserId);

      expect(result.success).toBe(true);
      expect(result.affectedCount).toBe(2);
      expect(prismaService.teamStore.createMany).toHaveBeenCalled();
    });

    it('should throw BadRequestException if stores not found', async () => {
      jest.spyOn(prismaService.team, 'findFirst').mockResolvedValue(mockTeam);
      jest.spyOn(prismaService.store, 'findMany').mockResolvedValue([mockStore]); // Only 1 store found, but 2 requested

      await expect(
        service.assignStoresToTeam(mockTeamId, mockOrganizationId, assignStoresDto, mockUserId)
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('performBulkUserOperation', () => {
    const bulkOperationDto: BulkUserOperationDto = {
      userIds: ['user-1', 'user-2'],
      operation: 'assign_to_team',
      teamId: mockTeamId,
    };

    it('should perform bulk team assignment successfully', async () => {
      jest.spyOn(prismaService.user, 'findMany').mockResolvedValue([
        { ...mockUser, id: 'user-1' },
        { ...mockUser, id: 'user-2' },
      ]);
      jest.spyOn(prismaService.team, 'findFirst').mockResolvedValue(mockTeam);
      jest.spyOn(prismaService.teamMember, 'findMany').mockResolvedValue([]);
      jest.spyOn(prismaService.teamMember, 'createMany').mockResolvedValue({ count: 2 });

      const result = await service.performBulkUserOperation(mockOrganizationId, bulkOperationDto, mockUserId);

      expect(result.success).toBe(true);
      expect(result.successCount).toBe(2);
      expect(result.failedCount).toBe(0);
      expect(prismaService.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          action: 'BULK_ASSIGN_TO_TEAM',
          entityType: 'User',
        }),
      });
    });

    it('should perform bulk role change successfully', async () => {
      const roleChangeDto: BulkUserOperationDto = {
        userIds: ['user-1', 'user-2'],
        operation: 'change_role',
        newRole: 'CALL_CENTER_AGENT',
      };

      jest.spyOn(prismaService.user, 'findMany').mockResolvedValue([
        { ...mockUser, id: 'user-1' },
        { ...mockUser, id: 'user-2' },
      ]);
      jest.spyOn(prismaService.user, 'updateMany').mockResolvedValue({ count: 2 });
      jest.spyOn(authorizationService, 'invalidateUserPermissions').mockResolvedValue();

      const result = await service.performBulkUserOperation(mockOrganizationId, roleChangeDto, mockUserId);

      expect(result.success).toBe(true);
      expect(result.successCount).toBe(2);
      expect(prismaService.user.updateMany).toHaveBeenCalledWith({
        where: {
          id: { in: ['user-1', 'user-2'] },
          organizationId: mockOrganizationId,
        },
        data: {
          role: 'CALL_CENTER_AGENT',
          updatedAt: expect.any(Date),
        },
      });
      expect(authorizationService.invalidateUserPermissions).toHaveBeenCalledTimes(2);
    });

    it('should handle partial failures gracefully', async () => {
      jest.spyOn(prismaService.user, 'findMany').mockResolvedValue([
        { ...mockUser, id: 'user-1' },
      ]); // Only 1 user found, but 2 requested
      jest.spyOn(prismaService.team, 'findFirst').mockResolvedValue(mockTeam);
      jest.spyOn(prismaService.teamMember, 'findMany').mockResolvedValue([]);
      jest.spyOn(prismaService.teamMember, 'createMany').mockResolvedValue({ count: 1 });

      const result = await service.performBulkUserOperation(mockOrganizationId, bulkOperationDto, mockUserId);

      expect(result.success).toBe(true);
      expect(result.successCount).toBe(1);
      expect(result.failedCount).toBe(1);
      expect(result.errors).toContain('user-2: User not found');
    });

    it('should throw BadRequestException for invalid operation', async () => {
      const invalidOperationDto: BulkUserOperationDto = {
        userIds: ['user-1'],
        operation: 'invalid_operation' as any,
      };

      await expect(
        service.performBulkUserOperation(mockOrganizationId, invalidOperationDto, mockUserId)
      ).rejects.toThrow(BadRequestException);
    });
  });
});