import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { UsersService } from './users.service';
import { PrismaService } from '../../common/database/prisma.service';
import { RedisService } from '../../common/redis/redis.service';
import { AuthorizationService } from '../../common/services/authorization.service';

describe('UsersService', () => {
  let service: UsersService;
  let mockPrismaService: any;
  let mockRedisService: any;
  let mockAuthorizationService: any;

  const mockUser = {
    id: 'user-123',
    email: 'test@example.com',
    username: 'testuser',
    password: 'hashedpassword',
    firstName: 'John',
    lastName: 'Doe',
    phone: '+212600000000',
    avatar: null,
    role: 'ADMIN',
    status: 'ACTIVE',
    isOnline: true,
    lastActiveAt: new Date(),
    organizationId: 'org-123',
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    organization: {
      id: 'org-123',
      name: 'Test Organization',
      code: 'TEST001',
      email: 'org@test.com',
      country: 'MA',
      timezone: 'Africa/Casablanca',
      currency: 'MAD',
    },
  };

  beforeEach(async () => {
    mockPrismaService = {
      user: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
      },
    };

    mockRedisService = {
      get: jest.fn(),
      set: jest.fn(),
      del: jest.fn(),
    };

    mockAuthorizationService = {
      invalidateUserPermissions: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: RedisService, useValue: mockRedisService },
        { provide: AuthorizationService, useValue: mockAuthorizationService },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('updateUserStatus', () => {
    it('should update user status successfully', async () => {
      const userId = 'user-123';
      const changedBy = 'admin-123';
      const statusData = { status: 'ACTIVE' as any, reason: 'Account verified' };

      mockPrismaService.user.findUnique.mockResolvedValue({
        id: userId,
        status: 'PENDING',
        organizationId: 'org-123',
      });

      mockPrismaService.user.update.mockResolvedValue({
        ...mockUser,
        status: 'ACTIVE',
        organization: mockUser.organization,
      });

      mockPrismaService.auditLog = { create: jest.fn().mockResolvedValue({}) };

      const result = await service.updateUserStatus(userId, statusData, changedBy);

      expect(mockPrismaService.user.update).toHaveBeenCalledWith({
        where: { id: userId },
        data: {
          status: 'ACTIVE',
          updatedAt: expect.any(Date),
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

      expect(result.newStatus).toBe('ACTIVE');
      expect(result.previousStatus).toBe('PENDING');
      expect(result.changedBy).toBe(changedBy);
    });

    it('should throw ForbiddenException when user tries to change own status', async () => {
      const userId = 'user-123';
      const statusData = { status: 'ACTIVE' as any };

      // Mock user exists
      mockPrismaService.user.findUnique.mockResolvedValue({
        id: userId,
        status: 'ACTIVE',
        organizationId: 'org-123',
      });

      await expect(service.updateUserStatus(userId, statusData, userId)).rejects.toThrow(
        'Users cannot change their own status',
      );
    });
  });

  describe('getUserPresence', () => {
    it('should return user presence information', async () => {
      const userId = 'user-123';
      mockPrismaService.user.findUnique.mockResolvedValue({
        id: userId,
        isOnline: true,
        lastActiveAt: new Date(),
        status: 'ACTIVE',
      });

      mockRedisService.get.mockResolvedValue('2024-01-01T00:00:00Z');

      const result = await service.getUserPresence(userId);

      expect(result.userId).toBe(userId);
      expect(result.isOnline).toBe(true);
      expect(result.status).toBe('ACTIVE');
    });
  });

  describe('getBulkUserPresence', () => {
    it('should return presence for multiple users', async () => {
      const userIds = ['user-1', 'user-2'];
      mockPrismaService.user.findMany = jest.fn().mockResolvedValue([
        { id: 'user-1', isOnline: true, lastActiveAt: new Date(), status: 'ACTIVE' },
        { id: 'user-2', isOnline: false, lastActiveAt: new Date(), status: 'ACTIVE' },
      ]);

      mockRedisService.get.mockResolvedValue('2024-01-01T00:00:00Z');

      const result = await service.getBulkUserPresence(userIds);

      expect(result.users).toHaveLength(2);
      expect(result.users[0].userId).toBe('user-1');
      expect(result.users[1].userId).toBe('user-2');
    });
  });

  describe('getOnlineUsersInOrganization', () => {
    it('should return online users in organization', async () => {
      const organizationId = 'org-123';
      mockPrismaService.user.findMany = jest.fn().mockResolvedValue([
        { id: 'user-1' },
        { id: 'user-2' },
      ]);

      mockRedisService.get.mockResolvedValue('2024-01-01T00:00:00Z');

      const result = await service.getOnlineUsersInOrganization(organizationId);

      expect(result.onlineUserIds).toHaveLength(2);
      expect(result.totalOnline).toBe(2);
    });
  });

  describe('validatePasswordStrength', () => {
    it('should validate strong password', () => {
      const result = service.validatePasswordStrength('StrongPass123!');

      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject weak passwords', () => {
      const result = service.validatePasswordStrength('weak');

      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors).toContain('Password must be at least 8 characters long');
      expect(result.errors).toContain('Password must contain at least one uppercase letter');
      expect(result.errors).toContain('Password must contain at least one number');
      expect(result.errors).toContain('Password must contain at least one special character');
    });

    it('should reject password that is too long', () => {
      const longPassword = 'a'.repeat(130);
      const result = service.validatePasswordStrength(longPassword);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Password must not exceed 128 characters');
    });

    it('should validate all password requirements', () => {
      // Test missing lowercase
      let result = service.validatePasswordStrength('STRONGPASS123!');
      expect(result.errors).toContain('Password must contain at least one lowercase letter');

      // Test missing uppercase
      result = service.validatePasswordStrength('strongpass123!');
      expect(result.errors).toContain('Password must contain at least one uppercase letter');

      // Test missing number
      result = service.validatePasswordStrength('StrongPass!');
      expect(result.errors).toContain('Password must contain at least one number');

      // Test missing special character
      result = service.validatePasswordStrength('StrongPass123');
      expect(result.errors).toContain('Password must contain at least one special character');
    });
  });

  describe('getUserProfile', () => {
    it('should return user profile without password', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(mockUser);

      const result = await service.getUserProfile('user-123');

      expect(mockPrismaService.user.findUnique).toHaveBeenCalledWith({
        where: { id: 'user-123' },
        include: {
          organization: {
            select: {
              id: true,
              name: true,
              code: true,
              email: true,
              country: true,
              timezone: true,
              currency: true,
            },
          },
        },
      });

      expect(result).not.toHaveProperty('password');
      expect(result.id).toBe('user-123');
      expect(result.email).toBe('test@example.com');
    });

    it('should throw NotFoundException when user not found', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(null);

      await expect(service.getUserProfile('nonexistent')).rejects.toThrow(NotFoundException);
    });
  });

  describe('updateProfile', () => {
    const updateData = {
      firstName: 'Jane',
      lastName: 'Smith',
      phone: '+212600000001',
    };

    it('should update user profile successfully', async () => {
      mockPrismaService.user.findFirst.mockResolvedValue(null); // No conflicts
      mockPrismaService.user.update.mockResolvedValue({ ...mockUser, ...updateData });

      const result = await service.updateProfile('user-123', updateData);

      expect(mockPrismaService.user.update).toHaveBeenCalledWith({
        where: { id: 'user-123' },
        data: {
          ...updateData,
          updatedAt: expect.any(Date),
        },
        include: {
          organization: {
            select: {
              id: true,
              name: true,
              code: true,
              email: true,
              country: true,
              timezone: true,
              currency: true,
            },
          },
        },
      });

      expect(mockAuthorizationService.invalidateUserPermissions).toHaveBeenCalledWith('user-123');
      expect(result.firstName).toBe('Jane');
      expect(result.lastName).toBe('Smith');
    });

    it('should throw ConflictException when email already exists', async () => {
      const updateDataWithEmail = { ...updateData, email: 'existing@example.com' };
      mockPrismaService.user.findFirst.mockResolvedValue({
        ...mockUser,
        id: 'other-user',
        email: 'existing@example.com',
      });

      await expect(service.updateProfile('user-123', updateDataWithEmail)).rejects.toThrow(
        ConflictException,
      );
    });

    it('should throw ConflictException when username already exists', async () => {
      const updateDataWithUsername = { ...updateData, username: 'existinguser' };
      mockPrismaService.user.findFirst.mockResolvedValue({
        ...mockUser,
        id: 'other-user',
        username: 'existinguser',
      });

      await expect(service.updateProfile('user-123', updateDataWithUsername)).rejects.toThrow(
        ConflictException,
      );
    });
  });

  describe('updateAvatar', () => {
    it('should update user avatar successfully', async () => {
      const avatarUrl = '/uploads/avatars/avatar-123.jpg';
      mockPrismaService.user.update.mockResolvedValue({
        id: 'user-123',
        avatar: avatarUrl,
      });

      const result = await service.updateAvatar('user-123', avatarUrl);

      expect(mockPrismaService.user.update).toHaveBeenCalledWith({
        where: { id: 'user-123' },
        data: {
          avatar: avatarUrl,
          updatedAt: expect.any(Date),
        },
        select: {
          id: true,
          avatar: true,
        },
      });
      expect(result.avatar).toBe(avatarUrl);
    });
  });

  describe('updateLastActivity', () => {
    it('should update user activity and set online status', async () => {
      mockPrismaService.user.update.mockResolvedValue(mockUser);
      mockRedisService.set.mockResolvedValue(undefined);

      await service.updateLastActivity('user-123');

      expect(mockPrismaService.user.update).toHaveBeenCalledWith({
        where: { id: 'user-123' },
        data: {
          lastActiveAt: expect.any(Date),
          isOnline: true,
        },
      });
      expect(mockRedisService.set).toHaveBeenCalledWith(
        'user_activity:user-123',
        expect.any(String),
        300,
      );
    });
  });

  describe('setUserOffline', () => {
    it('should set user offline and clear Redis cache', async () => {
      mockPrismaService.user.update.mockResolvedValue({ ...mockUser, isOnline: false });
      mockRedisService.del.mockResolvedValue(undefined);

      await service.setUserOffline('user-123');

      expect(mockPrismaService.user.update).toHaveBeenCalledWith({
        where: { id: 'user-123' },
        data: {
          isOnline: false,
        },
      });
      expect(mockRedisService.del).toHaveBeenCalledWith('user_activity:user-123');
    });
  });

  describe('getUserOnlineStatus', () => {
    it('should return true when user activity is cached in Redis', async () => {
      mockRedisService.get.mockResolvedValue('2024-01-01T00:00:00Z');

      const result = await service.getUserOnlineStatus('user-123');

      expect(result).toBe(true);
      expect(mockRedisService.get).toHaveBeenCalledWith('user_activity:user-123');
    });

    it('should check database when not in Redis cache', async () => {
      mockRedisService.get.mockResolvedValue(null);
      const recentActivity = new Date(Date.now() - 2 * 60 * 1000); // 2 minutes ago
      mockPrismaService.user.findUnique.mockResolvedValue({
        isOnline: true,
        lastActiveAt: recentActivity,
      });

      const result = await service.getUserOnlineStatus('user-123');

      expect(result).toBe(true);
    });

    it('should return false when user activity is old', async () => {
      mockRedisService.get.mockResolvedValue(null);
      const oldActivity = new Date(Date.now() - 10 * 60 * 1000); // 10 minutes ago
      mockPrismaService.user.findUnique.mockResolvedValue({
        isOnline: true,
        lastActiveAt: oldActivity,
      });

      const result = await service.getUserOnlineStatus('user-123');

      expect(result).toBe(false);
    });

    it('should return false when user has no last activity', async () => {
      mockRedisService.get.mockResolvedValue(null);
      mockPrismaService.user.findUnique.mockResolvedValue({
        isOnline: false,
        lastActiveAt: null,
      });

      const result = await service.getUserOnlineStatus('user-123');

      expect(result).toBe(false);
    });
  });
});