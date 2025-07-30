import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { AdminService } from './admin.service';
import { PrismaService } from '../../common/database/prisma.service';
import { AuthorizationService } from '../../common/services/authorization.service';
import { UserRole, UserStatus } from '@prisma/client';
import * as bcrypt from 'bcrypt';

// Mock bcrypt
jest.mock('bcrypt');
const mockedBcrypt = bcrypt as jest.Mocked<typeof bcrypt>;

describe('AdminService', () => {
  let service: AdminService;
  let prismaService: any;
  let authorizationService: any;

  const mockOrganizationId = 'org-123';
  const mockAdminId = 'admin-123';
  const mockUserId = 'user-123';

  const mockUser = {
    id: mockUserId,
    email: 'test@example.com',
    username: 'testuser',
    password: 'hashedpassword',
    firstName: 'Test',
    lastName: 'User',
    phone: '+1234567890',
    avatar: null,
    role: UserRole.CALL_CENTER_AGENT,
    status: UserStatus.ACTIVE,
    isOnline: false,
    lastActiveAt: new Date(),
    organizationId: mockOrganizationId,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    organization: {
      id: mockOrganizationId,
      name: 'Test Organization',
      code: 'TEST',
    },
  };

  beforeEach(async () => {
    const mockPrismaService = {
      user: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      auditLog: {
        create: jest.fn(),
      },
    };

    const mockAuthorizationService = {
      invalidateUserPermissions: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
        {
          provide: AuthorizationService,
          useValue: mockAuthorizationService,
        },
      ],
    }).compile();

    service = module.get<AdminService>(AdminService);
    prismaService = module.get(PrismaService);
    authorizationService = module.get(AuthorizationService);

    // Reset mocks
    jest.clearAllMocks();
  });

  describe('getUsers', () => {
    it('should return paginated users with filters', async () => {
      const mockUsers = [mockUser];
      const mockTotal = 1;

      prismaService.user.findMany.mockResolvedValue(mockUsers);
      prismaService.user.count.mockResolvedValue(mockTotal);

      const result = await service.getUsers(mockOrganizationId, {
        page: 1,
        limit: 20,
        search: 'test',
        role: 'CALL_CENTER_AGENT',
        status: 'ACTIVE',
      });

      expect(result).toEqual({
        users: mockUsers,
        pagination: {
          page: 1,
          limit: 20,
          total: mockTotal,
          pages: 1,
        },
      });

      expect(prismaService.user.findMany).toHaveBeenCalledWith({
        where: {
          organizationId: mockOrganizationId,
          deletedAt: null,
          OR: [
            { firstName: { contains: 'test', mode: 'insensitive' } },
            { lastName: { contains: 'test', mode: 'insensitive' } },
            { email: { contains: 'test', mode: 'insensitive' } },
            { username: { contains: 'test', mode: 'insensitive' } },
          ],
          role: UserRole.CALL_CENTER_AGENT,
          status: UserStatus.ACTIVE,
        },
        skip: 0,
        take: 20,
        orderBy: [{ createdAt: 'desc' }],
        select: expect.any(Object),
      });
    });
  });

  describe('createUser', () => {
    const createUserDto = {
      email: 'newuser@example.com',
      username: 'newuser',
      password: 'SecurePassword123!',
      firstName: 'New',
      lastName: 'User',
      phone: '+1234567890',
      role: UserRole.CALL_CENTER_AGENT,
      avatar: undefined,
    };

    it('should create a new user successfully', async () => {
      prismaService.user.findFirst.mockResolvedValue(null); // No existing user
      mockedBcrypt.hash.mockResolvedValue('hashedpassword' as never);
      prismaService.user.create.mockResolvedValue({ ...mockUser, ...createUserDto });
      prismaService.auditLog.create.mockResolvedValue({} as any);

      const result = await service.createUser(mockOrganizationId, createUserDto, mockAdminId);

      expect(prismaService.user.findFirst).toHaveBeenCalledWith({
        where: {
          OR: [
            { email: createUserDto.email },
            { username: createUserDto.username },
          ],
        },
      });

      expect(mockedBcrypt.hash).toHaveBeenCalledWith(createUserDto.password, 12);

      expect(prismaService.user.create).toHaveBeenCalledWith({
        data: {
          email: createUserDto.email,
          username: createUserDto.username,
          password: 'hashedpassword',
          firstName: createUserDto.firstName,
          lastName: createUserDto.lastName,
          phone: createUserDto.phone,
          avatar: createUserDto.avatar,
          role: createUserDto.role,
          status: UserStatus.ACTIVE,
          organizationId: mockOrganizationId,
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

      expect(prismaService.auditLog.create).toHaveBeenCalledWith({
        data: {
          userId: mockAdminId,
          organizationId: mockOrganizationId,
          action: 'USER_CREATED',
          entityType: 'User',
          entityId: expect.any(String),
          newValue: expect.any(Object),
        },
      });

      expect(result).not.toHaveProperty('password');
    });

    it('should throw ConflictException if email already exists', async () => {
      prismaService.user.findFirst.mockResolvedValue({ ...mockUser, email: createUserDto.email });

      await expect(
        service.createUser(mockOrganizationId, createUserDto, mockAdminId)
      ).rejects.toThrow(ConflictException);
    });

    it('should throw ConflictException if username already exists', async () => {
      prismaService.user.findFirst.mockResolvedValue({ ...mockUser, username: createUserDto.username });

      await expect(
        service.createUser(mockOrganizationId, createUserDto, mockAdminId)
      ).rejects.toThrow(ConflictException);
    });

    it('should throw BadRequestException for weak password', async () => {
      const weakPasswordDto = { ...createUserDto, password: 'weak' };
      prismaService.user.findFirst.mockResolvedValue(null);

      await expect(
        service.createUser(mockOrganizationId, weakPasswordDto, mockAdminId)
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('updateUser', () => {
    const updateUserDto = {
      firstName: 'Updated',
      lastName: 'Name',
      role: UserRole.TEAM_LEADER,
    };

    it('should update user successfully', async () => {
      prismaService.user.findFirst
        .mockResolvedValueOnce(mockUser) // Current user lookup
        .mockResolvedValueOnce(null); // No conflicting user

      const updatedUser = { ...mockUser, ...updateUserDto };
      prismaService.user.update.mockResolvedValue(updatedUser);
      prismaService.auditLog.create.mockResolvedValue({} as any);
      authorizationService.invalidateUserPermissions.mockResolvedValue();

      const result = await service.updateUser(mockUserId, mockOrganizationId, updateUserDto, mockAdminId);

      expect(prismaService.user.update).toHaveBeenCalledWith({
        where: { id: mockUserId },
        data: {
          ...updateUserDto,
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

      expect(authorizationService.invalidateUserPermissions).toHaveBeenCalledWith(mockUserId);
      expect(result).not.toHaveProperty('password');
    });

    it('should throw NotFoundException if user not found', async () => {
      prismaService.user.findFirst.mockResolvedValue(null);

      await expect(
        service.updateUser(mockUserId, mockOrganizationId, updateUserDto, mockAdminId)
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException when trying to change own role', async () => {
      prismaService.user.findFirst.mockResolvedValue(mockUser);

      await expect(
        service.updateUser(mockUserId, mockOrganizationId, { role: UserRole.ADMIN }, mockUserId)
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('suspendUser', () => {
    const suspensionDto = {
      reason: 'Policy violation - inappropriate behavior',
    };

    it('should suspend user successfully', async () => {
      prismaService.user.findFirst.mockResolvedValue(mockUser);
      const suspendedUser = { ...mockUser, status: UserStatus.SUSPENDED, isOnline: false };
      prismaService.user.update.mockResolvedValue(suspendedUser);
      prismaService.auditLog.create.mockResolvedValue({} as any);
      authorizationService.invalidateUserPermissions.mockResolvedValue();

      const result = await service.suspendUser(mockUserId, mockOrganizationId, suspensionDto, mockAdminId);

      expect(prismaService.user.update).toHaveBeenCalledWith({
        where: { id: mockUserId },
        data: {
          status: UserStatus.SUSPENDED,
          isOnline: false,
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

      expect(result).toEqual({
        user: expect.not.objectContaining({ password: expect.anything() }),
        previousStatus: UserStatus.ACTIVE,
        newStatus: UserStatus.SUSPENDED,
        changedBy: mockAdminId,
        changedAt: expect.any(Date),
        reason: suspensionDto.reason,
      });
    });

    it('should throw ForbiddenException when trying to suspend own account', async () => {
      prismaService.user.findFirst.mockResolvedValue(mockUser);

      await expect(
        service.suspendUser(mockUserId, mockOrganizationId, suspensionDto, mockUserId)
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw BadRequestException if user is already suspended', async () => {
      const suspendedUser = { ...mockUser, status: UserStatus.SUSPENDED };
      prismaService.user.findFirst.mockResolvedValue(suspendedUser);

      await expect(
        service.suspendUser(mockUserId, mockOrganizationId, suspensionDto, mockAdminId)
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('activateUser', () => {
    const activationDto = {
      reason: 'Account verified and cleared for activation',
    };

    it('should activate user successfully', async () => {
      const suspendedUser = { ...mockUser, status: UserStatus.SUSPENDED };
      prismaService.user.findFirst.mockResolvedValue(suspendedUser);
      const activatedUser = { ...mockUser, status: UserStatus.ACTIVE };
      prismaService.user.update.mockResolvedValue(activatedUser);
      prismaService.auditLog.create.mockResolvedValue({} as any);
      authorizationService.invalidateUserPermissions.mockResolvedValue();

      const result = await service.activateUser(mockUserId, mockOrganizationId, activationDto, mockAdminId);

      expect(prismaService.user.update).toHaveBeenCalledWith({
        where: { id: mockUserId },
        data: {
          status: UserStatus.ACTIVE,
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

      expect(result).toEqual({
        user: expect.not.objectContaining({ password: expect.anything() }),
        previousStatus: UserStatus.SUSPENDED,
        newStatus: UserStatus.ACTIVE,
        changedBy: mockAdminId,
        changedAt: expect.any(Date),
        reason: activationDto.reason,
      });
    });

    it('should throw BadRequestException if user is already active', async () => {
      prismaService.user.findFirst.mockResolvedValue(mockUser);

      await expect(
        service.activateUser(mockUserId, mockOrganizationId, activationDto, mockAdminId)
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('validatePasswordStrength', () => {
    it('should validate strong password', () => {
      const result = service['validatePasswordStrength']('SecurePassword123!');
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject weak passwords', () => {
      const result = service['validatePasswordStrength']('weak');
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Password must be at least 8 characters long');
      expect(result.errors).toContain('Password must contain at least one uppercase letter');
      expect(result.errors).toContain('Password must contain at least one number');
      expect(result.errors).toContain('Password must contain at least one special character');
    });

    it('should reject overly long passwords', () => {
      const longPassword = 'a'.repeat(129);
      const result = service['validatePasswordStrength'](longPassword);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Password must not exceed 128 characters');
    });
  });
});