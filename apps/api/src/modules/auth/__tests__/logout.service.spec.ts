import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { AuthController } from '../auth.controller';
import { PrismaService } from '../../../common/database/prisma.service';
import { RedisService } from '../../../common/redis/redis.service';
import { RealtimeNotificationService } from '../../websocket/services/realtime-notification.service';
import { WebsocketGateway } from '../../websocket/websocket.gateway';
import { SessionManagementService } from '../services/session-management.service';
import { LoggingService } from '../../../common/services/logging.service';

describe('AuthController - Logout Functionality', () => {
  let controller: AuthController;
  let prismaService: PrismaService;
  let redisService: RedisService;
  let jwtService: JwtService;
  let realtimeNotificationService: RealtimeNotificationService;
  let websocketGateway: WebsocketGateway;

  const mockUser = {
    id: 'user-123',
    email: 'test@example.com',
    organizationId: 'org-123',
  };

  const mockSession = {
    id: 'session-123',
    sessionToken: 'session-token-123',
    userId: 'user-123',
    expiresAt: new Date(Date.now() + 3600000),
    ipAddress: '127.0.0.1',
    userAgent: 'test-agent',
    createdAt: new Date(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        {
          provide: PrismaService,
          useValue: {
            session: {
              findMany: jest.fn(),
              deleteMany: jest.fn(),
            },
            user: {
              findUnique: jest.fn(),
              update: jest.fn(),
            },
          },
        },
        {
          provide: RedisService,
          useValue: {
            deleteSession: jest.fn(),
            set: jest.fn(),
            del: jest.fn(),
            getClient: jest.fn().mockReturnValue({
              keys: jest.fn().mockResolvedValue([]),
              del: jest.fn(),
            }),
          },
        },
        {
          provide: JwtService,
          useValue: {
            decode: jest.fn(),
          },
        },
        {
          provide: RealtimeNotificationService,
          useValue: {
            broadcastSessionUpdate: jest.fn(),
          },
        },
        {
          provide: WebsocketGateway,
          useValue: {
            disconnectUser: jest.fn(),
          },
        },
        {
          provide: SessionManagementService,
          useValue: {
            getUserSessions: jest.fn(),
            terminateSession: jest.fn(),
            getSessionStats: jest.fn(),
            getSessionActivity: jest.fn(),
          },
        },
        {
          provide: LoggingService,
          useValue: {
            log: jest.fn(),
            error: jest.fn(),
            warn: jest.fn(),
            debug: jest.fn(),
            logSecurityEvent: jest.fn(),
            logSecurity: jest.fn(),
          },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockReturnValue('localhost'),
          },
        },
        {
          provide: Reflector,
          useValue: {
            get: jest.fn(),
            getAll: jest.fn(),
            getAllAndOverride: jest.fn(),
            getAllAndMerge: jest.fn(),
          },
        },
        {
          provide: 'AuthorizationService',
          useValue: {
            checkUserPermissions: jest.fn().mockResolvedValue(true),
            checkResourcePermission: jest.fn().mockResolvedValue(true),
            getUserPermissions: jest.fn().mockResolvedValue([]),
          },
        },
      ],
    }).compile();

    controller = module.get<AuthController>(AuthController);
    prismaService = module.get<PrismaService>(PrismaService);
    redisService = module.get<RedisService>(RedisService);
    jwtService = module.get<JwtService>(JwtService);
    realtimeNotificationService = module.get<RealtimeNotificationService>(RealtimeNotificationService);
    websocketGateway = module.get<WebsocketGateway>(WebsocketGateway);
  });

  describe('logout', () => {
    it('should logout from current session successfully', async () => {
      const logoutDto = { sessionId: 'session-123' };
      
      jest.spyOn(prismaService.session, 'deleteMany').mockResolvedValue({ count: 1 });
      jest.spyOn(prismaService.user, 'update').mockResolvedValue(mockUser as any);
      jest.spyOn(prismaService.user, 'findUnique').mockResolvedValue(mockUser as any);
      jest.spyOn(jwtService, 'decode').mockReturnValue({ exp: Math.floor(Date.now() / 1000) + 3600 });

      const result = await controller.logout(mockUser, logoutDto);

      expect(result).toEqual({
        message: 'Logout successful',
        userId: mockUser.id,
        timestamp: expect.any(String),
      });

      expect(prismaService.session.deleteMany).toHaveBeenCalledWith({
        where: {
          userId: mockUser.id,
          sessionToken: logoutDto.sessionId,
        },
      });

      expect(redisService.deleteSession).toHaveBeenCalledWith(logoutDto.sessionId);
      expect(redisService.set).toHaveBeenCalledWith(
        `blacklist:${logoutDto.sessionId}`,
        true,
        expect.any(Number)
      );
      expect(websocketGateway.disconnectUser).toHaveBeenCalledWith(mockUser.id, 'User logged out');
    });

    it('should logout from all sessions when logoutFromAll is true', async () => {
      const logoutDto = { logoutFromAll: true };
      const mockSessions = [
        { sessionToken: 'session-1' },
        { sessionToken: 'session-2' },
      ];

      jest.spyOn(prismaService.session, 'findMany').mockResolvedValue(mockSessions as any);
      jest.spyOn(prismaService.session, 'deleteMany').mockResolvedValue({ count: 2 });
      jest.spyOn(prismaService.user, 'update').mockResolvedValue(mockUser as any);
      jest.spyOn(prismaService.user, 'findUnique').mockResolvedValue(mockUser as any);
      jest.spyOn(jwtService, 'decode').mockReturnValue({ exp: Math.floor(Date.now() / 1000) + 3600 });

      const result = await controller.logout(mockUser, logoutDto);

      expect(result).toEqual({
        message: 'Successfully logged out from all devices',
        userId: mockUser.id,
        timestamp: expect.any(String),
      });

      expect(prismaService.session.findMany).toHaveBeenCalledWith({
        where: { userId: mockUser.id },
        select: { sessionToken: true },
      });

      expect(prismaService.session.deleteMany).toHaveBeenCalledWith({
        where: { userId: mockUser.id },
      });

      expect(redisService.deleteSession).toHaveBeenCalledTimes(2);
      expect(redisService.set).toHaveBeenCalledTimes(2);
      expect(websocketGateway.disconnectUser).toHaveBeenCalledWith(mockUser.id, 'Logged out from all devices');
    });

    it('should handle logout without sessionId by logging out from all sessions', async () => {
      const logoutDto = {};
      const mockSessions = [{ sessionToken: 'session-1' }];

      jest.spyOn(prismaService.session, 'findMany').mockResolvedValue(mockSessions as any);
      jest.spyOn(prismaService.session, 'deleteMany').mockResolvedValue({ count: 1 });
      jest.spyOn(prismaService.user, 'update').mockResolvedValue(mockUser as any);
      jest.spyOn(prismaService.user, 'findUnique').mockResolvedValue(mockUser as any);

      const result = await controller.logout(mockUser, logoutDto);

      expect(result).toEqual({
        message: 'Logout successful',
        userId: mockUser.id,
        timestamp: expect.any(String),
      });

      // Should fallback to logout from all sessions
      expect(prismaService.session.findMany).toHaveBeenCalled();
    });

    it('should handle errors gracefully', async () => {
      const logoutDto = { sessionId: 'session-123' };
      
      jest.spyOn(prismaService.session, 'deleteMany').mockRejectedValue(new Error('Database error'));

      await expect(controller.logout(mockUser, logoutDto)).rejects.toThrow('Logout failed');
    });
  });

  describe('logoutFromAllDevices', () => {
    it('should logout from all devices successfully', async () => {
      const mockSessions = [
        { sessionToken: 'session-1' },
        { sessionToken: 'session-2' },
      ];

      jest.spyOn(prismaService.session, 'findMany').mockResolvedValue(mockSessions as any);
      jest.spyOn(prismaService.session, 'deleteMany').mockResolvedValue({ count: 2 });
      jest.spyOn(prismaService.user, 'update').mockResolvedValue(mockUser as any);
      jest.spyOn(prismaService.user, 'findUnique').mockResolvedValue(mockUser as any);
      jest.spyOn(jwtService, 'decode').mockReturnValue({ exp: Math.floor(Date.now() / 1000) + 3600 });

      const result = await controller.logoutFromAllDevices(mockUser);

      expect(result).toEqual({
        message: 'Successfully logged out from all devices',
        userId: mockUser.id,
        timestamp: expect.any(String),
      });

      expect(prismaService.session.deleteMany).toHaveBeenCalledWith({
        where: { userId: mockUser.id },
      });

      expect(redisService.deleteSession).toHaveBeenCalledTimes(2);
      expect(websocketGateway.disconnectUser).toHaveBeenCalledWith(mockUser.id, 'Logged out from all devices');
    });

    it('should handle errors gracefully', async () => {
      jest.spyOn(prismaService.session, 'findMany').mockRejectedValue(new Error('Database error'));

      await expect(controller.logoutFromAllDevices(mockUser)).rejects.toThrow('Logout from all devices failed');
    });
  });

  describe('private helper methods', () => {
    it('should blacklist token with correct expiration', async () => {
      const token = 'test-token';
      const mockDecoded = { exp: Math.floor(Date.now() / 1000) + 3600 };
      
      jest.spyOn(jwtService, 'decode').mockReturnValue(mockDecoded);

      // Access private method through any casting for testing
      await (controller as any).blacklistToken(token);

      expect(redisService.set).toHaveBeenCalledWith(
        `blacklist:${token}`,
        true,
        expect.any(Number)
      );
    });

    it('should handle token decode errors gracefully', async () => {
      const token = 'invalid-token';
      
      jest.spyOn(jwtService, 'decode').mockImplementation(() => {
        throw new Error('Invalid token');
      });

      // Should not throw error
      await expect((controller as any).blacklistToken(token)).resolves.toBeUndefined();

      // Should use default expiration
      expect(redisService.set).toHaveBeenCalledWith(
        `blacklist:${token}`,
        true,
        3600 // Default 1 hour
      );
    });

    it('should clear user Redis data', async () => {
      const userId = 'user-123';
      const mockRedisClient = {
        keys: jest.fn().mockResolvedValue(['rate_limit:user:user-123:login', 'user:user-123:cache']),
        del: jest.fn(),
      };

      jest.spyOn(redisService, 'getClient').mockReturnValue(mockRedisClient as any);

      await (controller as any).clearUserRedisData(userId);

      expect(redisService.del).toHaveBeenCalledWith(`user_permissions:${userId}`);
      expect(redisService.del).toHaveBeenCalledWith(`user:${userId}:online`);
      expect(mockRedisClient.keys).toHaveBeenCalledWith(`rate_limit:user:${userId}:*`);
      expect(mockRedisClient.keys).toHaveBeenCalledWith(`user:${userId}:*`);
    });

    it('should update user online status', async () => {
      const userId = 'user-123';
      const isOnline = false;

      jest.spyOn(prismaService.user, 'update').mockResolvedValue(mockUser as any);

      await (controller as any).updateUserOnlineStatus(userId, isOnline);

      expect(prismaService.user.update).toHaveBeenCalledWith({
        where: { id: userId },
        data: {
          isOnline,
          lastActiveAt: expect.any(Date),
        },
      });
    });
  });
});