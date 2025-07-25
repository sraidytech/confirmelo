import { Test, TestingModule } from '@nestjs/testing';
import { SessionService, SessionData } from './session.service';
import { PrismaService } from '../../../common/database/prisma.service';
import { RedisService } from '../../../common/redis/redis.service';
import { UserRole } from '@prisma/client';

describe('SessionService', () => {
  let service: SessionService;
  let prismaService: any;
  let redisService: any;

  const mockSessionData: SessionData = {
    userId: 'user-123',
    organizationId: 'org-123',
    role: UserRole.ADMIN,
    permissions: ['read', 'write'],
    assignments: [],
    lastActivity: new Date(),
    ipAddress: '192.168.1.1',
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  };

  beforeEach(async () => {
    const mockPrismaService = {
      session: {
        create: jest.fn(),
        findUnique: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
        deleteMany: jest.fn(),
      },
      user: {
        update: jest.fn(),
      },
    } as any;

    const mockRedisService = {
      setSession: jest.fn(),
      getSession: jest.fn(),
      deleteSession: jest.fn(),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SessionService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: RedisService, useValue: mockRedisService },
      ],
    }).compile();

    service = module.get<SessionService>(SessionService);
    prismaService = module.get(PrismaService);
    redisService = module.get(RedisService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('createSession', () => {
    it('should create session in both database and Redis', async () => {
      const sessionId = 'session-123';
      const expiresAt = new Date(Date.now() + 3600000); // 1 hour from now

      prismaService.session.create.mockResolvedValue({
        sessionToken: sessionId,
        userId: mockSessionData.userId,
        expiresAt,
      });

      await service.createSession(sessionId, mockSessionData.userId, mockSessionData, expiresAt);

      expect(prismaService.session.create).toHaveBeenCalledWith({
        data: {
          sessionToken: sessionId,
          userId: mockSessionData.userId,
          expiresAt,
          ipAddress: mockSessionData.ipAddress,
          userAgent: mockSessionData.userAgent,
        },
      });

      expect(redisService.setSession).toHaveBeenCalledWith(
        sessionId,
        mockSessionData,
        expect.any(Number),
      );
    });
  });

  describe('getSession', () => {
    it('should return session data from Redis if available', async () => {
      const sessionId = 'session-123';
      redisService.getSession.mockResolvedValue(mockSessionData);

      const result = await service.getSession(sessionId);

      expect(result).toEqual(mockSessionData);
      expect(redisService.getSession).toHaveBeenCalledWith(sessionId);
      expect(prismaService.session.findUnique).not.toHaveBeenCalled();
    });

    it('should fallback to database if Redis session not found', async () => {
      const sessionId = 'session-123';
      const dbSession = {
        sessionToken: sessionId,
        userId: 'user-123',
        expiresAt: new Date(Date.now() + 3600000),
        ipAddress: '192.168.1.1',
        userAgent: 'Mozilla/5.0',
        user: {
          id: 'user-123',
          role: UserRole.ADMIN,
          organizationId: 'org-123',
          organization: { id: 'org-123' },
        },
      };

      redisService.getSession.mockResolvedValue(null);
      prismaService.session.findUnique.mockResolvedValue(dbSession);

      const result = await service.getSession(sessionId);

      expect(result).toMatchObject({
        userId: 'user-123',
        organizationId: 'org-123',
        role: UserRole.ADMIN,
        ipAddress: '192.168.1.1',
        userAgent: 'Mozilla/5.0',
      });

      expect(redisService.setSession).toHaveBeenCalled(); // Should restore to Redis
    });

    it('should return null for expired session', async () => {
      const sessionId = 'session-123';
      const expiredSession = {
        sessionToken: sessionId,
        expiresAt: new Date(Date.now() - 3600000), // 1 hour ago
      };

      redisService.getSession.mockResolvedValue(null);
      prismaService.session.findUnique.mockResolvedValue(expiredSession);

      const result = await service.getSession(sessionId);

      expect(result).toBeNull();
    });
  });

  describe('updateSession', () => {
    it('should update session data in Redis', async () => {
      const sessionId = 'session-123';
      const updates = { websocketId: 'ws-123' };

      redisService.getSession.mockResolvedValue(mockSessionData);

      await service.updateSession(sessionId, updates);

      expect(redisService.setSession).toHaveBeenCalledWith(
        sessionId,
        expect.objectContaining({
          ...mockSessionData,
          ...updates,
          lastActivity: expect.any(Date),
        }),
      );
    });

    it('should not update if session does not exist', async () => {
      const sessionId = 'nonexistent-session';
      const updates = { websocketId: 'ws-123' };

      redisService.getSession.mockResolvedValue(null);
      prismaService.session.findUnique.mockResolvedValue(null);

      await service.updateSession(sessionId, updates);

      expect(redisService.setSession).not.toHaveBeenCalled();
    });
  });

  describe('invalidateSession', () => {
    it('should remove session from both Redis and database', async () => {
      const sessionId = 'session-123';

      await service.invalidateSession(sessionId);

      expect(redisService.deleteSession).toHaveBeenCalledWith(sessionId);
      expect(prismaService.session.deleteMany).toHaveBeenCalledWith({
        where: { sessionToken: sessionId },
      });
    });
  });

  describe('getUserSessions', () => {
    it('should return all active sessions for a user', async () => {
      const userId = 'user-123';
      const dbSessions = [
        {
          sessionToken: 'session-1',
          userId,
          ipAddress: '192.168.1.1',
          userAgent: 'Chrome',
          createdAt: new Date(),
          expiresAt: new Date(Date.now() + 3600000),
        },
        {
          sessionToken: 'session-2',
          userId,
          ipAddress: '192.168.1.2',
          userAgent: 'Firefox',
          createdAt: new Date(),
          expiresAt: new Date(Date.now() + 3600000),
        },
      ];

      prismaService.session.findMany.mockResolvedValue(dbSessions);
      redisService.getSession
        .mockResolvedValueOnce(mockSessionData) // session-1 is active
        .mockResolvedValueOnce(null); // session-2 is inactive

      const result = await service.getUserSessions(userId);

      expect(result).toHaveLength(2);
      expect(result[0].isActive).toBe(true);
      expect(result[1].isActive).toBe(false);
    });
  });

  describe('invalidateAllUserSessions', () => {
    it('should remove all sessions for a user', async () => {
      const userId = 'user-123';
      const sessions = [
        { sessionToken: 'session-1' },
        { sessionToken: 'session-2' },
      ];

      prismaService.session.findMany.mockResolvedValue(sessions);
      prismaService.session.deleteMany.mockResolvedValue({ count: 2 });

      const result = await service.invalidateAllUserSessions(userId);

      expect(result).toBe(2);
      expect(redisService.deleteSession).toHaveBeenCalledTimes(2);
      expect(prismaService.session.deleteMany).toHaveBeenCalledWith({
        where: { userId },
      });
    });
  });

  describe('cleanupExpiredSessions', () => {
    it('should remove expired sessions from database', async () => {
      prismaService.session.deleteMany.mockResolvedValue({ count: 5 });

      const result = await service.cleanupExpiredSessions();

      expect(result).toBe(5);
      expect(prismaService.session.deleteMany).toHaveBeenCalledWith({
        where: {
          expiresAt: { lt: expect.any(Date) },
        },
      });
    });
  });

  describe('updateUserOnlineStatus', () => {
    it('should set user online if they have active sessions', async () => {
      const userId = 'user-123';
      
      // Mock getUserSessions to return active sessions
      jest.spyOn(service, 'getUserSessions').mockResolvedValue([
        {
          id: 'session-1',
          userId,
          ipAddress: '192.168.1.1',
          userAgent: 'Chrome',
          createdAt: new Date(),
          lastActivity: new Date(),
          expiresAt: new Date(Date.now() + 3600000),
          isActive: true,
        },
      ]);

      await service.updateUserOnlineStatus(userId);

      expect(prismaService.user.update).toHaveBeenCalledWith({
        where: { id: userId },
        data: {
          isOnline: true,
          lastActiveAt: expect.any(Date),
        },
      });
    });

    it('should set user offline if they have no active sessions', async () => {
      const userId = 'user-123';
      
      jest.spyOn(service, 'getUserSessions').mockResolvedValue([]);

      await service.updateUserOnlineStatus(userId);

      expect(prismaService.user.update).toHaveBeenCalledWith({
        where: { id: userId },
        data: {
          isOnline: false,
          lastActiveAt: undefined,
        },
      });
    });
  });

  describe('isSessionValid', () => {
    it('should return true for valid session', async () => {
      const sessionId = 'session-123';
      jest.spyOn(service, 'getSession').mockResolvedValue(mockSessionData);

      const result = await service.isSessionValid(sessionId);

      expect(result).toBe(true);
    });

    it('should return false for invalid session', async () => {
      const sessionId = 'invalid-session';
      jest.spyOn(service, 'getSession').mockResolvedValue(null);

      const result = await service.isSessionValid(sessionId);

      expect(result).toBe(false);
    });
  });

  describe('getSessionDeviceInfo', () => {
    it('should parse user agent and return device info', async () => {
      const sessionId = 'session-123';
      const session = {
        sessionToken: sessionId,
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        ipAddress: '192.168.1.1',
      };

      prismaService.session.findUnique.mockResolvedValue(session);

      const result = await service.getSessionDeviceInfo(sessionId);

      expect(result).toEqual({
        browser: 'Chrome',
        os: 'Windows',
        device: 'Desktop',
        location: '192.168.1.1',
      });
    });

    it('should return null for non-existent session', async () => {
      const sessionId = 'nonexistent-session';
      prismaService.session.findUnique.mockResolvedValue(null);

      const result = await service.getSessionDeviceInfo(sessionId);

      expect(result).toBeNull();
    });
  });
});