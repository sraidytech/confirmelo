import { Test, TestingModule } from '@nestjs/testing';
import { SessionManagementService } from '../services/session-management.service';
import { PrismaService } from '../../../common/database/prisma.service';
import { RedisService } from '../../../common/redis/redis.service';
import { RealtimeNotificationService } from '../../websocket/services/realtime-notification.service';
import { WebsocketGateway } from '../../websocket/websocket.gateway';
import { NotFoundException } from '@nestjs/common';

describe('SessionManagementService', () => {
  let service: SessionManagementService;
  let prismaService: any;
  let redisService: any;
  let realtimeNotificationService: any;
  let websocketGateway: any;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SessionManagementService,
        {
          provide: PrismaService,
          useValue: {
            session: {
              findMany: jest.fn(),
              findFirst: jest.fn(),
              delete: jest.fn(),
              deleteMany: jest.fn(),
              count: jest.fn(),
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
            get: jest.fn(),
            set: jest.fn(),
            del: jest.fn(),
            exists: jest.fn(),
            deleteSession: jest.fn(),
            getClient: jest.fn().mockReturnValue({
              keys: jest.fn().mockResolvedValue([]),
              del: jest.fn(),
              set: jest.fn(),
            }),
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
      ],
    }).compile();

    service = module.get<SessionManagementService>(SessionManagementService);
    prismaService = module.get(PrismaService) as jest.Mocked<PrismaService>;
    redisService = module.get(RedisService) as jest.Mocked<RedisService>;
    realtimeNotificationService = module.get(RealtimeNotificationService) as jest.Mocked<RealtimeNotificationService>;
    websocketGateway = module.get(WebsocketGateway) as jest.Mocked<WebsocketGateway>;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getUserSessions', () => {
    it('should return user sessions successfully', async () => {
      const mockSessions = [
        {
          id: 'session-1',
          sessionToken: 'token-123',
          userId: 'user-1',
          ipAddress: '192.168.1.1',
          userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
          createdAt: new Date(),
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        },
      ];

      prismaService.session.findMany.mockResolvedValue(mockSessions);
      redisService.get.mockResolvedValue(null);

      const result = await service.getUserSessions('user-1');

      expect(result).toBeDefined();
      expect(result.sessions).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(result.activeCount).toBe(1);
      expect(prismaService.session.findMany).toHaveBeenCalledWith({
        where: {
          userId: 'user-1',
          expiresAt: { gt: expect.any(Date) },
        },
        orderBy: { createdAt: 'desc' },
      });
    });

    it('should handle errors gracefully', async () => {
      prismaService.session.findMany.mockRejectedValue(new Error('Database error'));

      await expect(service.getUserSessions('user-1')).rejects.toThrow('Failed to retrieve user sessions');
    });
  });

  describe('getSessionStats', () => {
    it('should return session statistics', async () => {
      const mockSessions = [
        {
          id: 'session-1',
          sessionToken: 'token-123',
          userId: 'user-1',
          ipAddress: '192.168.1.1',
          userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
          createdAt: new Date(),
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        },
      ];

      prismaService.session.findMany.mockResolvedValue(mockSessions);
      prismaService.session.count.mockResolvedValue(1);

      const result = await service.getSessionStats('user-1');

      expect(result).toBeDefined();
      expect(result.totalSessions).toBe(1);
      expect(result.activeSessions).toBe(1);
      expect(result.deviceBreakdown).toBeDefined();
      expect(result.locationBreakdown).toBeDefined();
    });
  });

  describe('terminateSession', () => {
    it('should terminate a session successfully', async () => {
      const mockSession = {
        id: 'session-1',
        sessionToken: 'token-123',
        userId: 'user-1',
        ipAddress: '192.168.1.1',
        userAgent: 'Mozilla/5.0',
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      };

      const mockUser = {
        id: 'user-1',
        organizationId: 'org-1',
      };

      prismaService.session.findFirst.mockResolvedValue(mockSession);
      prismaService.session.delete.mockResolvedValue(mockSession);
      prismaService.user.findUnique.mockResolvedValue(mockUser);
      prismaService.user.update.mockResolvedValue({ ...mockUser, isOnline: false });
      redisService.deleteSession.mockResolvedValue(undefined);
      redisService.set.mockResolvedValue(undefined);

      const result = await service.terminateSession('user-1', 'session-1', 'Test reason');

      expect(result).toBeDefined();
      expect(result.message).toBe('Session terminated successfully');
      expect(result.sessionId).toBe('session-1');
      expect(prismaService.session.delete).toHaveBeenCalledWith({
        where: { id: 'session-1' },
      });
      expect(redisService.deleteSession).toHaveBeenCalledWith('token-123');
      expect(websocketGateway.disconnectUser).toHaveBeenCalledWith('user-1', 'Test reason');
    });

    it('should throw NotFoundException for non-existent session', async () => {
      prismaService.session.findFirst.mockResolvedValue(null);

      await expect(service.terminateSession('user-1', 'non-existent', 'Test'))
        .rejects.toThrow('Session not found');
    });
  });
});