import { Test, TestingModule } from '@nestjs/testing';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { UserRole, UserStatus } from '@prisma/client';

describe('AdminController', () => {
  let controller: AdminController;
  let adminService: any;

  const mockOrganizationId = 'org-123';
  const mockAdminId = 'admin-123';
  const mockUserId = 'user-123';

  const mockUser = {
    id: mockUserId,
    email: 'test@example.com',
    username: 'testuser',
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
    const mockAdminService = {
      getUsers: jest.fn(),
      createUser: jest.fn(),
      updateUser: jest.fn(),
      suspendUser: jest.fn(),
      activateUser: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AdminController],
      providers: [
        {
          provide: AdminService,
          useValue: mockAdminService,
        },
      ],
    }).compile();

    controller = module.get<AdminController>(AdminController);
    adminService = module.get(AdminService);

    jest.clearAllMocks();
  });

  describe('getUsers', () => {
    it('should return paginated users', async () => {
      const mockResponse = {
        users: [mockUser],
        pagination: {
          page: 1,
          limit: 20,
          total: 1,
          pages: 1,
        },
      };

      adminService.getUsers.mockResolvedValue(mockResponse);

      const result = await controller.getUsers(
        mockOrganizationId,
        '1',
        '20',
        'test',
        'CALL_CENTER_AGENT',
        'ACTIVE'
      );

      expect(adminService.getUsers).toHaveBeenCalledWith(mockOrganizationId, {
        page: 1,
        limit: 20,
        search: 'test',
        role: 'CALL_CENTER_AGENT',
        status: 'ACTIVE',
      });

      expect(result).toEqual(mockResponse);
    });

    it('should use default pagination values', async () => {
      const mockResponse = {
        users: [mockUser],
        pagination: {
          page: 1,
          limit: 20,
          total: 1,
          pages: 1,
        },
      };

      adminService.getUsers.mockResolvedValue(mockResponse);

      await controller.getUsers(mockOrganizationId);

      expect(adminService.getUsers).toHaveBeenCalledWith(mockOrganizationId, {
        page: 1,
        limit: 20,
        search: undefined,
        role: undefined,
        status: undefined,
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
    };

    it('should create a new user successfully', async () => {
      adminService.createUser.mockResolvedValue(mockUser);

      const result = await controller.createUser(mockOrganizationId, mockAdminId, createUserDto);

      expect(adminService.createUser).toHaveBeenCalledWith(
        mockOrganizationId,
        createUserDto,
        mockAdminId
      );

      expect(result).toEqual({
        success: true,
        message: 'User created successfully',
        user: mockUser,
      });
    });
  });

  describe('updateUser', () => {
    const updateUserDto = {
      firstName: 'Updated',
      lastName: 'Name',
      role: UserRole.TEAM_LEADER,
    };

    it('should update user successfully', async () => {
      const updatedUser = { ...mockUser, ...updateUserDto };
      adminService.updateUser.mockResolvedValue(updatedUser);

      const result = await controller.updateUser(
        mockUserId,
        mockOrganizationId,
        mockAdminId,
        updateUserDto
      );

      expect(adminService.updateUser).toHaveBeenCalledWith(
        mockUserId,
        mockOrganizationId,
        updateUserDto,
        mockAdminId
      );

      expect(result).toEqual({
        success: true,
        message: 'User updated successfully',
        user: updatedUser,
      });
    });
  });

  describe('suspendUser', () => {
    const suspensionDto = {
      reason: 'Policy violation - inappropriate behavior',
    };

    it('should suspend user successfully', async () => {
      const suspensionResult = {
        user: { ...mockUser, status: UserStatus.SUSPENDED },
        previousStatus: UserStatus.ACTIVE,
        newStatus: UserStatus.SUSPENDED,
        changedBy: mockAdminId,
        changedAt: new Date(),
        reason: suspensionDto.reason,
      };

      adminService.suspendUser.mockResolvedValue(suspensionResult);

      const result = await controller.suspendUser(
        mockUserId,
        mockOrganizationId,
        mockAdminId,
        suspensionDto
      );

      expect(adminService.suspendUser).toHaveBeenCalledWith(
        mockUserId,
        mockOrganizationId,
        suspensionDto,
        mockAdminId
      );

      expect(result).toEqual({
        success: true,
        message: 'User suspended successfully',
        ...suspensionResult,
      });
    });
  });

  describe('activateUser', () => {
    const activationDto = {
      reason: 'Account verified and cleared for activation',
    };

    it('should activate user successfully', async () => {
      const activationResult = {
        user: { ...mockUser, status: UserStatus.ACTIVE },
        previousStatus: UserStatus.SUSPENDED,
        newStatus: UserStatus.ACTIVE,
        changedBy: mockAdminId,
        changedAt: new Date(),
        reason: activationDto.reason,
      };

      adminService.activateUser.mockResolvedValue(activationResult);

      const result = await controller.activateUser(
        mockUserId,
        mockOrganizationId,
        mockAdminId,
        activationDto
      );

      expect(adminService.activateUser).toHaveBeenCalledWith(
        mockUserId,
        mockOrganizationId,
        activationDto,
        mockAdminId
      );

      expect(result).toEqual({
        success: true,
        message: 'User activated successfully',
        ...activationResult,
      });
    });
  });
});