import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ConflictException } from '@nestjs/common';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

describe('UsersController', () => {
  let controller: UsersController;
  let usersService: any;

  const mockUser = {
    id: 'user-123',
    email: 'test@example.com',
    username: 'testuser',
    firstName: 'John',
    lastName: 'Doe',
    phone: '+212600000000',
    avatar: null,
    role: 'ADMIN',
    status: 'ACTIVE',
    isOnline: true,
    lastActiveAt: new Date(),
    organizationId: 'org-123',
    organization: {
      id: 'org-123',
      name: 'Test Organization',
      code: 'TEST001',
      email: 'org@test.com',
      country: 'MA',
      timezone: 'Africa/Casablanca',
      currency: 'MAD',
    },
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
  };

  beforeEach(async () => {
    usersService = {
      getUserProfile: jest.fn(),
      updateProfile: jest.fn(),
      changePassword: jest.fn(),
      updateAvatar: jest.fn(),
      updateLastActivity: jest.fn(),
      getUserOnlineStatus: jest.fn(),
      validatePasswordStrength: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [UsersController],
      providers: [
        {
          provide: UsersService,
          useValue: usersService,
        },
      ],
    }).compile();

    controller = module.get<UsersController>(UsersController);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getProfile', () => {
    it('should return user profile', async () => {
      usersService.getUserProfile.mockResolvedValue(mockUser);

      const result = await controller.getProfile('user-123');

      expect(usersService.getUserProfile).toHaveBeenCalledWith('user-123');
      expect(result).toEqual(mockUser);
    });
  });

  describe('updateProfile', () => {
    const updateProfileDto = {
      firstName: 'Jane',
      lastName: 'Smith',
      phone: '+212600000001',
    };

    it('should update profile successfully', async () => {
      const updatedUser = { ...mockUser, ...updateProfileDto };
      usersService.updateProfile.mockResolvedValue(updatedUser);

      const result = await controller.updateProfile('user-123', updateProfileDto);

      expect(usersService.updateProfile).toHaveBeenCalledWith('user-123', updateProfileDto);
      expect(result.success).toBe(true);
      expect(result.message).toBe('Profile updated successfully');
      expect(result.user).toEqual(updatedUser);
    });

    it('should handle ConflictException', async () => {
      usersService.updateProfile.mockRejectedValue(new ConflictException('Email already exists'));

      await expect(controller.updateProfile('user-123', updateProfileDto)).rejects.toThrow(
        ConflictException,
      );
    });
  });

  describe('changePassword', () => {
    const changePasswordDto = {
      currentPassword: 'currentpass',
      newPassword: 'NewSecurePass123!',
    };

    it('should change password successfully', async () => {
      usersService.validatePasswordStrength.mockReturnValue({
        isValid: true,
        errors: [],
      });
      usersService.changePassword.mockResolvedValue({
        success: true,
        message: 'Password changed successfully',
      });

      const result = await controller.changePassword('user-123', changePasswordDto);

      expect(usersService.validatePasswordStrength).toHaveBeenCalledWith('NewSecurePass123!');
      expect(usersService.changePassword).toHaveBeenCalledWith('user-123', changePasswordDto);
      expect(result.success).toBe(true);
    });

    it('should reject weak password', async () => {
      const weakPasswordDto = {
        currentPassword: 'currentpass',
        newPassword: 'weak',
      };

      usersService.validatePasswordStrength.mockReturnValue({
        isValid: false,
        errors: ['Password must be at least 8 characters long'],
      });

      await expect(controller.changePassword('user-123', weakPasswordDto)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('updateAvatarUrl', () => {
    it('should update avatar URL successfully', async () => {
      const avatarUrl = '/uploads/avatars/avatar-123.jpg';
      usersService.updateAvatar.mockResolvedValue({
        id: 'user-123',
        avatar: avatarUrl,
      });

      const result = await controller.updateAvatarUrl('user-123', { avatarUrl });

      expect(usersService.updateAvatar).toHaveBeenCalledWith('user-123', avatarUrl);
      expect(result.success).toBe(true);
      expect(result.message).toBe('Avatar updated successfully');
      expect(result.avatarUrl).toBe(avatarUrl);
    });

    it('should throw BadRequestException when no avatar URL provided', async () => {
      await expect(controller.updateAvatarUrl('user-123', { avatarUrl: '' })).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('updateActivity', () => {
    it('should update user activity', async () => {
      usersService.updateLastActivity.mockResolvedValue(undefined);

      const result = await controller.updateActivity('user-123');

      expect(usersService.updateLastActivity).toHaveBeenCalledWith('user-123');
      expect(result.success).toBe(true);
      expect(result.message).toBe('Activity updated successfully');
    });
  });

  describe('getOnlineStatus', () => {
    it('should return online status', async () => {
      usersService.getUserOnlineStatus.mockResolvedValue(true);

      const result = await controller.getOnlineStatus('user-123');

      expect(usersService.getUserOnlineStatus).toHaveBeenCalledWith('user-123');
      expect(result.isOnline).toBe(true);
      expect(result.timestamp).toBeDefined();
    });
  });
});