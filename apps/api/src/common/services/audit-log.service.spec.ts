import { Test, TestingModule } from '@nestjs/testing';
import { AuditLogService } from './audit-log.service';
import { PrismaService } from '../database/prisma.service';
import { RedisService } from '../redis/redis.service';

describe('AuditLogService', () => {
  let service: AuditLogService;
  let prismaService: PrismaService;
  let redisService: RedisService;

  const mockAuditLog = {
    id: 'audit-1',
    userId: 'user-1',
    organizationId: 'org-1',
    action: 'LOGIN_SUCCESS',
    entityType: 'User',
    entityId: 'user-1',
    previousValue: null,
    newValue: { loginTime: '2024-01-15T10:30:00Z' },
    ipAddress: '192.168.1.1',
    userAgent: 'Mozilla/5.0...',
    createdAt: new Date('2024-01-15T10:30:00Z'),
  };

  beforeEach(async () => {
    const mockPrismaService = {
      auditLog: {
        create: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
        groupBy: jest.fn(),
        deleteMany: jest.fn(),
      },
      $queryRaw: jest.fn(),
    };

    const mockRedisService = {
      get: jest.fn(),
      set: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuditLogService,
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

    service = module.get<AuditLogService>(AuditLogService);
    prismaService = module.get<PrismaService>(PrismaService);
    redisService = module.get<RedisService>(RedisService);
  });

  describe('log', () => {
    it('should create an audit log entry', async () => {
      (prismaService.auditLog.create as jest.Mock).mockResolvedValue(mockAuditLog);

      await service.log({
        userId: 'user-1',
        organizationId: 'org-1',
        action: 'LOGIN_SUCCESS',
        entityType: 'User',
        entityId: 'user-1',
        ipAddress: '192.168.1.1',
        userAgent: 'Mozilla/5.0...',
      });

      expect(prismaService.auditLog.create).toHaveBeenCalledWith({
        data: {
          userId: 'user-1',
          organizationId: 'org-1',
          action: 'LOGIN_SUCCESS',
          entityType: 'User',
          entityId: 'user-1',
          previousValue: undefined,
          newValue: undefined,
          ipAddress: '192.168.1.1',
          userAgent: 'Mozilla/5.0...',
          createdAt: expect.any(Date),
        },
      });
    });

    it('should handle errors gracefully without throwing', async () => {
      (prismaService.auditLog.create as jest.Mock).mockRejectedValue(new Error('Database error'));

      // Should not throw
      await expect(service.log({
        action: 'TEST_ACTION',
        entityType: 'Test',
        entityId: 'test-1',
      })).resolves.toBeUndefined();
    });
  });

  describe('logAuthEvent', () => {
    it('should log authentication events', async () => {
      (prismaService.auditLog.create as jest.Mock).mockResolvedValue(mockAuditLog);

      await service.logAuthEvent(
        'LOGIN_SUCCESS',
        'user-1',
        'org-1',
        '192.168.1.1',
        'Mozilla/5.0...',
        { loginTime: '2024-01-15T10:30:00Z' },
      );

      expect(prismaService.auditLog.create).toHaveBeenCalledWith({
        data: {
          userId: 'user-1',
          organizationId: 'org-1',
          action: 'LOGIN_SUCCESS',
          entityType: 'User',
          entityId: 'user-1',
          previousValue: undefined,
          newValue: { loginTime: '2024-01-15T10:30:00Z' },
          ipAddress: '192.168.1.1',
          userAgent: 'Mozilla/5.0...',
          createdAt: expect.any(Date),
        },
      });
    });
  });

  describe('logUserEvent', () => {
    it('should log user management events', async () => {
      (prismaService.auditLog.create as jest.Mock).mockResolvedValue(mockAuditLog);

      await service.logUserEvent(
        'USER_UPDATED',
        'user-1',
        'org-1',
        'admin-1',
        { role: 'CALL_CENTER_AGENT' },
        { role: 'TEAM_LEADER' },
        '192.168.1.1',
        'Mozilla/5.0...',
      );

      expect(prismaService.auditLog.create).toHaveBeenCalledWith({
        data: {
          userId: 'admin-1',
          organizationId: 'org-1',
          action: 'USER_UPDATED',
          entityType: 'User',
          entityId: 'user-1',
          previousValue: { role: 'CALL_CENTER_AGENT' },
          newValue: { role: 'TEAM_LEADER' },
          ipAddress: '192.168.1.1',
          userAgent: 'Mozilla/5.0...',
          createdAt: expect.any(Date),
        },
      });
    });
  });

  describe('queryLogs', () => {
    it('should query audit logs with filters and pagination', async () => {
      const mockLogs = [mockAuditLog];
      const mockTotal = 1;

      (redisService.get as jest.Mock).mockResolvedValue(null);
      (prismaService.auditLog.findMany as jest.Mock).mockResolvedValue(mockLogs);
      (prismaService.auditLog.count as jest.Mock).mockResolvedValue(mockTotal);
      (redisService.set as jest.Mock).mockResolvedValue(undefined);

      const result = await service.queryLogs({
        filters: {
          userId: 'user-1',
          action: 'LOGIN_SUCCESS',
        },
        page: 1,
        limit: 50,
        sortBy: 'createdAt',
        sortOrder: 'desc',
      });

      expect(result).toEqual({
        logs: mockLogs,
        total: mockTotal,
        page: 1,
        limit: 50,
        totalPages: 1,
      });

      expect(prismaService.auditLog.findMany).toHaveBeenCalledWith({
        where: {
          userId: 'user-1',
          action: 'LOGIN_SUCCESS',
        },
        skip: 0,
        take: 50,
        orderBy: { createdAt: 'desc' },
      });
    });

    it('should return cached results when available', async () => {
      const cachedResult = {
        logs: [mockAuditLog],
        total: 1,
        page: 1,
        limit: 50,
        totalPages: 1,
      };

      (redisService.get as jest.Mock).mockResolvedValue(cachedResult);

      const result = await service.queryLogs({
        filters: { userId: 'user-1' },
      });

      expect(result).toEqual(cachedResult);
      expect(prismaService.auditLog.findMany).not.toHaveBeenCalled();
    });

    it('should handle date range filters', async () => {
      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-01-31');

      (redisService.get as jest.Mock).mockResolvedValue(null);
      (prismaService.auditLog.findMany as jest.Mock).mockResolvedValue([]);
      (prismaService.auditLog.count as jest.Mock).mockResolvedValue(0);
      (redisService.set as jest.Mock).mockResolvedValue(undefined);

      await service.queryLogs({
        filters: {
          startDate,
          endDate,
        },
      });

      expect(prismaService.auditLog.findMany).toHaveBeenCalledWith({
        where: {
          createdAt: {
            gte: startDate,
            lte: endDate,
          },
        },
        skip: 0,
        take: 50,
        orderBy: { createdAt: 'desc' },
      });
    });
  });

  describe('getUserAuditLogs', () => {
    it('should get audit logs for a specific user', async () => {
      const mockLogs = [mockAuditLog];
      
      (redisService.get as jest.Mock).mockResolvedValue(null);
      (prismaService.auditLog.findMany as jest.Mock).mockResolvedValue(mockLogs);
      (prismaService.auditLog.count as jest.Mock).mockResolvedValue(1);
      (redisService.set as jest.Mock).mockResolvedValue(undefined);

      const result = await service.getUserAuditLogs('user-1', 'org-1', 1, 25);

      expect(result.logs).toEqual(mockLogs);
      expect(result.total).toBe(1);
      expect(result.page).toBe(1);
      expect(result.limit).toBe(25);
    });
  });

  describe('getSecurityAuditLogs', () => {
    it('should get security-related audit logs', async () => {
      const securityLog = {
        ...mockAuditLog,
        action: 'LOGIN_FAILED',
      };

      (prismaService.auditLog.findMany as jest.Mock).mockResolvedValue([securityLog]);
      (prismaService.auditLog.count as jest.Mock).mockResolvedValue(1);

      const result = await service.getSecurityAuditLogs('org-1', 1, 50);

      expect(result.logs).toEqual([securityLog]);
      expect(prismaService.auditLog.findMany).toHaveBeenCalledWith({
        where: {
          action: {
            in: [
              'LOGIN_FAILED',
              'ACCOUNT_LOCKED',
              'ACCOUNT_UNLOCKED',
              'SUSPICIOUS_ACTIVITY',
              'SECURITY_ALERT',
              'BRUTE_FORCE_DETECTED',
            ],
          },
          organizationId: 'org-1',
        },
        skip: 0,
        take: 50,
        orderBy: { createdAt: 'desc' },
      });
    });
  });

  describe('getAuditLogStats', () => {
    it('should return audit log statistics', async () => {
      const mockActionCounts = [
        { action: 'LOGIN_SUCCESS', _count: { action: 100 } },
        { action: 'LOGIN_FAILED', _count: { action: 10 } },
      ];

      const mockEntityTypeCounts = [
        { entityType: 'User', _count: { entityType: 80 } },
        { entityType: 'Team', _count: { entityType: 30 } },
      ];

      const mockDailyCounts = [
        { date: new Date('2024-01-15'), count: BigInt(50) },
        { date: new Date('2024-01-14'), count: BigInt(60) },
      ];

      (redisService.get as jest.Mock).mockResolvedValue(null);
      (prismaService.auditLog.count as jest.Mock).mockResolvedValue(110);
      (prismaService.auditLog.groupBy as jest.Mock)
        .mockResolvedValueOnce(mockActionCounts)
        .mockResolvedValueOnce(mockEntityTypeCounts);
      (prismaService.$queryRaw as jest.Mock).mockResolvedValue(mockDailyCounts);
      (redisService.set as jest.Mock).mockResolvedValue(undefined);

      const result = await service.getAuditLogStats('org-1');

      expect(result).toEqual({
        totalLogs: 110,
        actionCounts: {
          'LOGIN_SUCCESS': 100,
          'LOGIN_FAILED': 10,
        },
        entityTypeCounts: {
          'User': 80,
          'Team': 30,
        },
        dailyCounts: [
          { date: '2024-01-15', count: 50 },
          { date: '2024-01-14', count: 60 },
        ],
      });
    });
  });

  describe('cleanupOldLogs', () => {
    it('should clean up old audit logs', async () => {
      (prismaService.auditLog.deleteMany as jest.Mock).mockResolvedValue({ count: 500 });

      const result = await service.cleanupOldLogs(365);

      expect(result).toBe(500);
      expect(prismaService.auditLog.deleteMany).toHaveBeenCalledWith({
        where: {
          createdAt: {
            lt: expect.any(Date),
          },
        },
      });
    });
  });

  describe('exportToCsv', () => {
    it('should export audit logs to CSV format', async () => {
      const mockLogs = [
        {
          id: 'audit-1',
          userId: 'user-1',
          organizationId: 'org-1',
          action: 'LOGIN_SUCCESS',
          entityType: 'User',
          entityId: 'user-1',
          ipAddress: '192.168.1.1',
          userAgent: 'Mozilla/5.0...',
          createdAt: new Date('2024-01-15T10:30:00Z'),
        },
      ];

      (prismaService.auditLog.findMany as jest.Mock).mockResolvedValue(mockLogs);

      const csv = await service.exportToCsv({}, 1000);

      expect(csv).toContain('ID,User ID,Organization ID,Action,Entity Type,Entity ID,IP Address,User Agent,Created At');
      expect(csv).toContain('"audit-1","user-1","org-1","LOGIN_SUCCESS","User","user-1","192.168.1.1","Mozilla/5.0...","2024-01-15T10:30:00.000Z"');
    });
  });

  describe('logFromRequest', () => {
    it('should extract request information and create audit log', async () => {
      const mockRequest = {
        user: { id: 'user-1', organizationId: 'org-1' },
        headers: {
          'user-agent': 'Mozilla/5.0...',
          'x-forwarded-for': '192.168.1.1',
        },
        connection: {},
        socket: {},
      } as any;

      (prismaService.auditLog.create as jest.Mock).mockResolvedValue(mockAuditLog);

      await service.logFromRequest(
        mockRequest,
        'USER_UPDATED',
        'User',
        'user-1',
        { role: 'AGENT' },
        { role: 'LEADER' },
      );

      expect(prismaService.auditLog.create).toHaveBeenCalledWith({
        data: {
          userId: 'user-1',
          organizationId: 'org-1',
          action: 'USER_UPDATED',
          entityType: 'User',
          entityId: 'user-1',
          previousValue: { role: 'AGENT' },
          newValue: { role: 'LEADER' },
          ipAddress: '192.168.1.1',
          userAgent: 'Mozilla/5.0...',
          createdAt: expect.any(Date),
        },
      });
    });
  });
});