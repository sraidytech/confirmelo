import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, BadRequestException } from '@nestjs/common';
import { RegistrationService } from './registration.service';
import { PrismaService } from '../../../common/database/prisma.service';
import { PasswordUtil } from '../../../common/utils/password.util';
import { OrganizationUtil } from '../../../common/utils/organization.util';
import { UserRole, UserStatus } from '@prisma/client';

describe('RegistrationService', () => {
  let service: RegistrationService;
  let prismaService: any;
  let passwordUtil: any;
  let organizationUtil: any;

  const mockRegisterDto = {
    organization: {
      name: 'Test Organization',
      email: 'test@example.com',
      phone: '+212600000000',
      address: '123 Test Street',
      city: 'Casablanca',
    },
    adminUser: {
      email: 'admin@example.com',
      username: 'testadmin',
      password: 'SecurePassword123!',
      firstName: 'John',
      lastName: 'Doe',
      phone: '+212600000001',
    },
  };

  beforeEach(async () => {
    const mockPrismaService = {
      organization: {
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
      },
      user: {
        findUnique: jest.fn(),
        create: jest.fn(),
      },
      callStatus: {
        create: jest.fn(),
      },
      $transaction: jest.fn(),
    } as any;

    const mockPasswordUtil = {
      validatePasswordStrength: jest.fn(),
      hashPassword: jest.fn(),
    } as any;

    const mockOrganizationUtil = {
      generateUniqueCode: jest.fn(),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RegistrationService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: PasswordUtil, useValue: mockPasswordUtil },
        { provide: OrganizationUtil, useValue: mockOrganizationUtil },
      ],
    }).compile();

    service = module.get<RegistrationService>(RegistrationService);
    prismaService = module.get(PrismaService);
    passwordUtil = module.get(PasswordUtil);
    organizationUtil = module.get(OrganizationUtil);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('registerOrganization', () => {
    it('should successfully register an organization with admin user', async () => {
      // Mock password validation
      passwordUtil.validatePasswordStrength.mockReturnValue({
        isValid: true,
        score: 4,
        feedback: [],
      });

      // Mock no existing organization or user
      prismaService.organization.findFirst.mockResolvedValue(null);
      prismaService.user.findUnique.mockResolvedValue(null);

      // Mock organization code generation
      organizationUtil.generateUniqueCode.mockResolvedValue('TEST_ORGANIZATION');

      // Mock password hashing
      passwordUtil.hashPassword.mockResolvedValue('hashedPassword123');

      // Mock transaction result
      const mockOrganization = {
        id: 'org-123',
        name: 'Test Organization',
        code: 'TEST_ORGANIZATION',
        email: 'test@example.com',
      };

      const mockUser = {
        id: 'user-123',
        email: 'admin@example.com',
        username: 'testadmin',
        firstName: 'John',
        lastName: 'Doe',
        role: UserRole.ADMIN,
        status: UserStatus.ACTIVE,
      };

      prismaService.$transaction.mockImplementation(async (callback) => {
        return callback({
          organization: {
            create: jest.fn().mockResolvedValue(mockOrganization),
          },
          user: {
            create: jest.fn().mockResolvedValue(mockUser),
          },
          callStatus: {
            create: jest.fn(),
          },
        });
      });

      const result = await service.registerOrganization(mockRegisterDto);

      expect(result).toEqual({
        success: true,
        message: 'Organization registered successfully',
        organization: {
          id: 'org-123',
          name: 'Test Organization',
          code: 'TEST_ORGANIZATION',
          email: 'test@example.com',
        },
        user: {
          id: 'user-123',
          email: 'admin@example.com',
          username: 'testadmin',
          firstName: 'John',
          lastName: 'Doe',
          role: UserRole.ADMIN,
          status: UserStatus.ACTIVE,
        },
      });

      expect(passwordUtil.validatePasswordStrength).toHaveBeenCalledWith('SecurePassword123!');
      expect(organizationUtil.generateUniqueCode).toHaveBeenCalledWith('Test Organization');
      expect(passwordUtil.hashPassword).toHaveBeenCalledWith('SecurePassword123!');
    });

    it('should throw BadRequestException for weak password', async () => {
      passwordUtil.validatePasswordStrength.mockReturnValue({
        isValid: false,
        score: 2,
        feedback: ['Password must contain at least one uppercase letter'],
      });

      await expect(service.registerOrganization(mockRegisterDto)).rejects.toThrow(BadRequestException);
    });

    it('should throw ConflictException for existing organization email', async () => {
      passwordUtil.validatePasswordStrength.mockReturnValue({
        isValid: true,
        score: 4,
        feedback: [],
      });

      prismaService.organization.findFirst.mockResolvedValue({
        id: 'existing-org',
        email: 'test@example.com',
      } as any);

      await expect(service.registerOrganization(mockRegisterDto)).rejects.toThrow(ConflictException);
    });

    it('should throw ConflictException for existing user email', async () => {
      passwordUtil.validatePasswordStrength.mockReturnValue({
        isValid: true,
        score: 4,
        feedback: [],
      });

      prismaService.organization.findFirst.mockResolvedValue(null);
      prismaService.user.findUnique.mockResolvedValueOnce({
        id: 'existing-user',
        email: 'admin@example.com',
      } as any);

      await expect(service.registerOrganization(mockRegisterDto)).rejects.toThrow(ConflictException);
    });

    it('should throw ConflictException for existing username', async () => {
      passwordUtil.validatePasswordStrength.mockReturnValue({
        isValid: true,
        score: 4,
        feedback: [],
      });

      prismaService.organization.findFirst.mockResolvedValue(null);
      prismaService.user.findUnique
        .mockResolvedValueOnce(null) // First call for email check
        .mockResolvedValueOnce({     // Second call for username check
          id: 'existing-user',
          username: 'testadmin',
        } as any);

      await expect(service.registerOrganization(mockRegisterDto)).rejects.toThrow(ConflictException);
    });
  });

  describe('availability checks', () => {
    it('should return true for available organization name', async () => {
      prismaService.organization.findFirst.mockResolvedValue(null);

      const result = await service.isOrganizationNameAvailable('New Organization');

      expect(result).toBe(true);
      expect(prismaService.organization.findFirst).toHaveBeenCalledWith({
        where: {
          name: {
            equals: 'New Organization',
            mode: 'insensitive',
          },
        },
      });
    });

    it('should return false for unavailable organization name', async () => {
      prismaService.organization.findFirst.mockResolvedValue({
        id: 'existing-org',
        name: 'Existing Organization',
      } as any);

      const result = await service.isOrganizationNameAvailable('Existing Organization');

      expect(result).toBe(false);
    });

    it('should return true for available email', async () => {
      prismaService.user.findUnique.mockResolvedValue(null);
      prismaService.organization.findFirst.mockResolvedValue(null);

      const result = await service.isEmailAvailable('new@example.com');

      expect(result).toBe(true);
    });

    it('should return false for email used by existing user', async () => {
      prismaService.user.findUnique.mockResolvedValue({
        id: 'existing-user',
        email: 'existing@example.com',
      } as any);

      const result = await service.isEmailAvailable('existing@example.com');

      expect(result).toBe(false);
    });

    it('should return true for available username', async () => {
      prismaService.user.findUnique.mockResolvedValue(null);

      const result = await service.isUsernameAvailable('newusername');

      expect(result).toBe(true);
    });

    it('should return false for unavailable username', async () => {
      prismaService.user.findUnique.mockResolvedValue({
        id: 'existing-user',
        username: 'existinguser',
      } as any);

      const result = await service.isUsernameAvailable('existinguser');

      expect(result).toBe(false);
    });
  });
});