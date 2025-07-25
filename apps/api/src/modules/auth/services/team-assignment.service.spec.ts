import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { TeamAssignmentService } from './team-assignment.service';
import { PrismaService } from '../../../common/database/prisma.service';
import { RedisService } from '../../../common/redis/redis.service';
import { UserRole } from '@prisma/client';

describe('TeamAssignmentService', () => {
  let service: TeamAssignmentService;
  let prismaService: PrismaService;
  let redisService: RedisService;

  const mockUser = {
    id: 'user-1',
    email: 'user@example.com',
    firstName: 'John',
    lastName: 'Doe',
    role: UserRole.CALL_CENTER_AGENT,
    organizationId: 'org-1',
  };

  const mockTeam = {
    id: 'team-1',
    name: 'Sales Team',
    organizationId: 'org-1',
    leaderId: 'leader-1',
    organization: { id: 'org-1', name: 'Test Org' },
    leader: { id: 'leader-1', firstName: 'Jane', lastName: 'Leader' },
  };

  const mockStore = {
    id: 'store-1',
    name: 'Main Store',
    code: 'MAIN',
    organizationId: 'org-1',
    isActive: true,
  };

  beforeEach(async () => {
    const mockPrismaService = {
      team: {
        findUnique: jest.fn(),
      },
      user: {
        findUnique: jest.fn(),
      },
      store: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
      },
      teamMember: {
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        findMany: jest.fn(),
      },
      teamStore: {
        findUnique: jest.fn(),
        create: jest.fn(),
        delete: jest.fn(),
      },
      auditLog: {
        create: jest.fn(),
      },
    };

    const mockRedisService = {
      get: jest.fn(),
      set: jest.fn(),
      del: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TeamAssignmentService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
        {
          provide: RedisService,
          useValue: mockRedisService,
        },
      ],
    }).compile();

    service = module.get<TeamAssignmentService>(TeamAssignmentService);
    prismaService = module.get<PrismaService>(PrismaService);
    redisService = module.get<RedisService>(RedisService);
  });

  describe('assignUserToTeam', () => {
    it('should successfully assign a user to a team', async () => {
      (prismaService.team.findUnique as jest.Mock).mockResolvedValue(mockTeam);
      (prismaService.user.findUnique as jest.Mock).mockResolvedValue(mockUser);
      (prismaService.teamMember.findUnique as jest.Mock).mockResolvedValue(null);
      (prismaService.teamMember.create as jest.Mock).mockResolvedValue({
        id: 'member-1',
        teamId: 'team-1',
        userId: 'user-1',
        joinedAt: new Date(),
        leftAt: null,
      });
      (redisService.del as jest.Mock).mockResolvedValue(undefined);

      await service.assignUserToTeam({
        teamId: 'team-1',
        userId: 'user-1',
        assignedBy: 'admin-1',
      });

      expect(prismaService.teamMember.create).toHaveBeenCalledWith({
        data: {
          teamId: 'team-1',
          userId: 'user-1',
          joinedAt: expect.any(Date),
        },
      });
      expect(prismaService.auditLog.create).toHaveBeenCalled();
    });

    it('should throw NotFoundException when team does not exist', async () => {
      (prismaService.team.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(
        service.assignUserToTeam({
          teamId: 'team-1',
          userId: 'user-1',
          assignedBy: 'admin-1',
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException when user and team belong to different organizations', async () => {
      const differentOrgUser = { ...mockUser, organizationId: 'org-2' };
      
      (prismaService.team.findUnique as jest.Mock).mockResolvedValue(mockTeam);
      (prismaService.user.findUnique as jest.Mock).mockResolvedValue(differentOrgUser);

      await expect(
        service.assignUserToTeam({
          teamId: 'team-1',
          userId: 'user-1',
          assignedBy: 'admin-1',
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('validateUserStoreAccess', () => {
    it('should return true for admin users in same organization', async () => {
      const adminUser = { ...mockUser, role: UserRole.ADMIN };
      
      (redisService.get as jest.Mock).mockResolvedValue(null);
      (prismaService.user.findUnique as jest.Mock).mockResolvedValue(adminUser);
      (prismaService.store.findUnique as jest.Mock).mockResolvedValue(mockStore);
      (redisService.set as jest.Mock).mockResolvedValue(undefined);

      const result = await service.validateUserStoreAccess('user-1', 'store-1');

      expect(result.hasAccess).toBe(true);
      expect(result.reason).toBe('Admin access');
    });

    it('should return cached result when available', async () => {
      const cachedResult = {
        hasAccess: true,
        reason: 'Cached result',
      };

      (redisService.get as jest.Mock).mockResolvedValue(cachedResult);

      const result = await service.validateUserStoreAccess('user-1', 'store-1');

      expect(result).toEqual(cachedResult);
      expect(prismaService.user.findUnique).not.toHaveBeenCalled();
    });
  });

  describe('getUserAccessibleStores', () => {
    it('should return all stores for admin users', async () => {
      const adminUser = { ...mockUser, role: UserRole.ADMIN };
      const stores = [
        { id: 'store-1' },
        { id: 'store-2' },
      ];

      (redisService.get as jest.Mock).mockResolvedValue(null);
      (prismaService.user.findUnique as jest.Mock).mockResolvedValue(adminUser);
      (prismaService.store.findMany as jest.Mock).mockResolvedValue(stores);
      (redisService.set as jest.Mock).mockResolvedValue(undefined);

      const result = await service.getUserAccessibleStores('user-1');

      expect(result).toEqual(['store-1', 'store-2']);
      expect(prismaService.store.findMany).toHaveBeenCalledWith({
        where: {
          organizationId: 'org-1',
          isActive: true,
        },
        select: { id: true },
      });
    });

    it('should return empty array for non-existent user', async () => {
      (redisService.get as jest.Mock).mockResolvedValue(null);
      (prismaService.user.findUnique as jest.Mock).mockResolvedValue(null);

      const result = await service.getUserAccessibleStores('user-1');

      expect(result).toEqual([]);
    });
  });
});