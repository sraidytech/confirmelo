import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtStrategy } from '../jwt.strategy';
import { PrismaService } from '../../database/prisma.service';
import { RedisService } from '../../redis/redis.service';

describe('JwtStrategy - Token Blacklisting', () => {
  let strategy: JwtStrategy;
  let prismaService: PrismaService;
  let redisService: RedisService;

  const mockUser = {
    id: 'user-123',
    email: 'test@example.com',
    username: 'testuser',
    firstName: 'Test',
    lastName: 'User',
    role: 'ADMIN',
    status: 'ACTIVE',
    organizationId: 'org-123',
    isOnline: true,
    lastActiveAt: new Date(),
    deletedAt: null,
    organization: {
      id: 'org-123',
      name: 'Test Org',
      code: 'TEST',
      deletedAt: null,
    },
    leadingTeams: [],
    teamMemberships: [],
  };

  const mockPayload = {
    sub: 'user-123',
    email: 'test@example.com',
    role: 'ADMIN',
    organizationId: 'org-123',
    sessionId: 'session-123',
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 3600,
  };

  const mockRequest = {
    headers: {
      authorization: 'Bearer valid-jwt-token',
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        JwtStrategy,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockReturnValue('test-secret'),
          },
        },
        {
          provide: PrismaService,
          useValue: {
            user: {
              findUnique: jest.fn(),
              update: jest.fn(),
            },
          },
        },
        {
          provide: RedisService,
          useValue: {
            exists: jest.fn(),
          },
        },
      ],
    }).compile();

    strategy = module.get<JwtStrategy>(JwtStrategy);
    prismaService = module.get<PrismaService>(PrismaService);
    redisService = module.get<RedisService>(RedisService);
  });

  describe('validate', () => {
    it('should validate token successfully when not blacklisted', async () => {
      jest.spyOn(redisService, 'exists').mockResolvedValue(false);
      jest.spyOn(prismaService.user, 'findUnique').mockResolvedValue(mockUser as any);
      jest.spyOn(prismaService.user, 'update').mockResolvedValue(mockUser as any);

      const result = await strategy.validate(mockRequest, mockPayload);

      expect(result).toEqual({
        id: mockUser.id,
        email: mockUser.email,
        username: mockUser.username,
        firstName: mockUser.firstName,
        lastName: mockUser.lastName,
        role: mockUser.role,
        status: mockUser.status,
        organizationId: mockUser.organizationId,
        organization: mockUser.organization,
        leadingTeams: mockUser.leadingTeams,
        teamMemberships: [],
        sessionId: mockPayload.sessionId,
        isOnline: mockUser.isOnline,
        lastActiveAt: mockUser.lastActiveAt,
      });

      expect(redisService.exists).toHaveBeenCalledWith('blacklist:valid-jwt-token');
    });

    it('should reject blacklisted token', async () => {
      jest.spyOn(redisService, 'exists').mockResolvedValue(true);

      await expect(strategy.validate(mockRequest, mockPayload)).rejects.toThrow(
        new UnauthorizedException('Token has been invalidated')
      );

      expect(redisService.exists).toHaveBeenCalledWith('blacklist:valid-jwt-token');
      expect(prismaService.user.findUnique).not.toHaveBeenCalled();
    });

    it('should handle missing token gracefully', async () => {
      const requestWithoutToken = { headers: {} };
      
      jest.spyOn(prismaService.user, 'findUnique').mockResolvedValue(mockUser as any);
      jest.spyOn(prismaService.user, 'update').mockResolvedValue(mockUser as any);

      const result = await strategy.validate(requestWithoutToken, mockPayload);

      expect(result).toBeDefined();
      expect(redisService.exists).not.toHaveBeenCalled();
    });

    it('should handle Redis errors gracefully', async () => {
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
      jest.spyOn(redisService, 'exists').mockRejectedValue(new Error('Redis connection failed'));
      jest.spyOn(prismaService.user, 'findUnique').mockResolvedValue(mockUser as any);
      jest.spyOn(prismaService.user, 'update').mockResolvedValue(mockUser as any);

      // Should continue with validation even if Redis check fails
      const result = await strategy.validate(mockRequest, mockPayload);

      expect(result).toBeDefined();
      expect(prismaService.user.findUnique).toHaveBeenCalled();
      expect(consoleSpy).toHaveBeenCalledWith('Redis blacklist check failed:', 'Redis connection failed');
      
      consoleSpy.mockRestore();
    });

    it('should reject token for non-existent user', async () => {
      jest.spyOn(redisService, 'exists').mockResolvedValue(false);
      jest.spyOn(prismaService.user, 'findUnique').mockResolvedValue(null);

      await expect(strategy.validate(mockRequest, mockPayload)).rejects.toThrow(
        new UnauthorizedException('User not found')
      );
    });

    it('should reject token for inactive user', async () => {
      const inactiveUser = { ...mockUser, status: 'SUSPENDED' };
      
      jest.spyOn(redisService, 'exists').mockResolvedValue(false);
      jest.spyOn(prismaService.user, 'findUnique').mockResolvedValue(inactiveUser as any);

      await expect(strategy.validate(mockRequest, mockPayload)).rejects.toThrow(
        new UnauthorizedException('User account is not active')
      );
    });

    it('should reject token for deleted user', async () => {
      const deletedUser = { ...mockUser, deletedAt: new Date() };
      
      jest.spyOn(redisService, 'exists').mockResolvedValue(false);
      jest.spyOn(prismaService.user, 'findUnique').mockResolvedValue(deletedUser as any);

      await expect(strategy.validate(mockRequest, mockPayload)).rejects.toThrow(
        new UnauthorizedException('User account has been deleted')
      );
    });

    it('should reject token for deleted organization', async () => {
      const userWithDeletedOrg = {
        ...mockUser,
        organization: { ...mockUser.organization, deletedAt: new Date() },
      };
      
      jest.spyOn(redisService, 'exists').mockResolvedValue(false);
      jest.spyOn(prismaService.user, 'findUnique').mockResolvedValue(userWithDeletedOrg as any);

      await expect(strategy.validate(mockRequest, mockPayload)).rejects.toThrow(
        new UnauthorizedException('Organization is not active')
      );
    });

    it('should update user last active timestamp', async () => {
      jest.spyOn(redisService, 'exists').mockResolvedValue(false);
      jest.spyOn(prismaService.user, 'findUnique').mockResolvedValue(mockUser as any);
      jest.spyOn(prismaService.user, 'update').mockResolvedValue(mockUser as any);

      await strategy.validate(mockRequest, mockPayload);

      expect(prismaService.user.update).toHaveBeenCalledWith({
        where: { id: mockUser.id },
        data: { lastActiveAt: expect.any(Date) },
      });
    });
  });

  describe('token extraction', () => {
    it('should extract token from Authorization header', async () => {
      const requestWithBearer = {
        headers: {
          authorization: 'Bearer test-token-123',
        },
      };

      jest.spyOn(redisService, 'exists').mockResolvedValue(false);
      jest.spyOn(prismaService.user, 'findUnique').mockResolvedValue(mockUser as any);
      jest.spyOn(prismaService.user, 'update').mockResolvedValue(mockUser as any);

      await strategy.validate(requestWithBearer, mockPayload);

      expect(redisService.exists).toHaveBeenCalledWith('blacklist:test-token-123');
    });

    it('should handle malformed Authorization header', async () => {
      const requestWithMalformedAuth = {
        headers: {
          authorization: 'InvalidFormat token-123',
        },
      };

      jest.spyOn(prismaService.user, 'findUnique').mockResolvedValue(mockUser as any);
      jest.spyOn(prismaService.user, 'update').mockResolvedValue(mockUser as any);

      // Should not call Redis exists since token extraction fails
      await strategy.validate(requestWithMalformedAuth, mockPayload);

      expect(redisService.exists).not.toHaveBeenCalled();
    });
  });
});