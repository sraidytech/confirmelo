import { Test, TestingModule } from '@nestjs/testing';
import { RealtimeNotificationService } from './realtime-notification.service';
import { WebsocketGateway } from '../websocket.gateway';
import { PrismaService } from '../../../common/database/prisma.service';
import { RedisService } from '../../../common/redis/redis.service';
import { UserRole, UserStatus } from '@prisma/client';

describe('RealtimeNotificationService', () => {
  let service: RealtimeNotificationService;
  let websocketGateway: WebsocketGateway;
  let prismaService: PrismaService;
  let redisService: RedisService;

  const mockUser = {
    id: 'user-1',
    organizationId: 'org-1',
    role: UserRole.CALL_CENTER_AGENT,
    status: UserStatus.ACTIVE,
    firstName: 'John',
    lastName: 'Doe',
  };

  const mockTeam = {
    id: 'team-1',
    name: 'Sales Team',
    organizationId: 'org-1',
    leaderId: 'leader-1',
  };

  const mockStore = {
    id: 'store-1',
    name: 'Main Store',
    organizationId: 'org-1',
  };

  beforeEach(async () => {
    const mockWebsocketGateway = {
      broadcastToUser: jest.fn(),
      broadcastToOrganization: jest.fn(),
      disconnectUser: jest.fn(),
    };

    const mockPrismaService = {
      user: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
      },
      team: {
        findUnique: jest.fn(),
      },
      store: {
        findUnique: jest.fn(),
      },
      teamMember: {
        findMany: jest.fn(),
      },
    };

    const mockRedisService = {
      del: jest.fn(),
      getClient: jest.fn().mockReturnValue({
        lPush: jest.fn(),
        lTrim: jest.fn(),
        lRange: jest.fn(),
        expire: jest.fn(),
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RealtimeNotificationService,
        {
          provide: WebsocketGateway,
          useValue: mockWebsocketGateway,
        },
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

    service = module.get<RealtimeNotificationService>(RealtimeNotificationService);
    websocketGateway = module.get<WebsocketGateway>(WebsocketGateway);
    prismaService = module.get<PrismaService>(PrismaService);
    redisService = module.get<RedisService>(RedisService);
  });

  describe('broadcastPermissionUpdate', () => {
    it('should broadcast permission update to user and admins', async () => {
      const event = {
        userId: 'user-1',
        oldRole: UserRole.CALL_CENTER_AGENT,
        newRole: UserRole.TEAM_LEADER,
        updatedBy: 'admin-1',
        timestamp: new Date(),
        organizationId: 'org-1',
      };

      (prismaService.user.findMany as jest.Mock).mockResolvedValue([
        { id: 'admin-1' },
        { id: 'admin-2' },
      ]);

      await service.broadcastPermissionUpdate(event);

      expect(websocketGateway.broadcastToUser).toHaveBeenCalledWith(
        'user-1',
        'permission_updated',
        expect.objectContaining({
          oldRole: UserRole.CALL_CENTER_AGENT,
          newRole: UserRole.TEAM_LEADER,
          updatedBy: 'admin-1',
          message: 'Your role has been updated to TEAM_LEADER',
        }),
      );

      expect(websocketGateway.broadcastToUser).toHaveBeenCalledWith(
        'admin-1',
        'user_permission_changed',
        expect.any(Object),
      );

      expect(websocketGateway.broadcastToUser).toHaveBeenCalledWith(
        'user-1',
        'force_permission_refresh',
        expect.any(Object),
      );
    });
  });

  describe('broadcastSessionUpdate', () => {
    it('should broadcast session update and disconnect user if terminated', async () => {
      const event = {
        userId: 'user-1',
        sessionId: 'sess-1',
        action: 'terminated' as const,
        reason: 'Admin logout',
        timestamp: new Date(),
        organizationId: 'org-1',
      };

      await service.broadcastSessionUpdate(event);

      expect(websocketGateway.broadcastToUser).toHaveBeenCalledWith(
        'user-1',
        'session_updated',
        expect.objectContaining({
          sessionId: 'sess-1',
          action: 'terminated',
          reason: 'Admin logout',
          message: 'Session terminated: Admin logout',
        }),
      );

      expect(websocketGateway.disconnectUser).toHaveBeenCalledWith('user-1', 'Admin logout');
    });

    it('should not disconnect user for non-terminated sessions', async () => {
      const event = {
        userId: 'user-1',
        sessionId: 'sess-1',
        action: 'updated' as const,
        timestamp: new Date(),
        organizationId: 'org-1',
      };

      await service.broadcastSessionUpdate(event);

      expect(websocketGateway.broadcastToUser).toHaveBeenCalledWith(
        'user-1',
        'session_updated',
        expect.any(Object),
      );

      expect(websocketGateway.disconnectUser).not.toHaveBeenCalled();
    });
  });

  describe('broadcastSecurityEvent', () => {
    it('should broadcast security event to user and admins for critical events', async () => {
      const event = {
        userId: 'user-1',
        eventType: 'account_locked' as const,
        details: { reason: 'Too many failed attempts' },
        ipAddress: '192.168.1.1',
        userAgent: 'Mozilla/5.0...',
        timestamp: new Date(),
        organizationId: 'org-1',
        severity: 'critical' as const,
      };

      (prismaService.user.findMany as jest.Mock).mockResolvedValue([
        { id: 'admin-1' },
      ]);

      await service.broadcastSecurityEvent(event);

      expect(websocketGateway.broadcastToUser).toHaveBeenCalledWith(
        'user-1',
        'security_event',
        expect.objectContaining({
          eventType: 'account_locked',
          severity: 'critical',
          message: '⚠️ Account has been locked due to security concerns - Immediate attention required',
        }),
      );

      expect(websocketGateway.broadcastToUser).toHaveBeenCalledWith(
        'admin-1',
        'security_alert',
        expect.objectContaining({
          userId: 'user-1',
          eventType: 'account_locked',
          severity: 'critical',
        }),
      );
    });

    it('should not broadcast to admins for low severity events', async () => {
      const event = {
        userId: 'user-1',
        eventType: 'login_success' as const,
        details: {},
        timestamp: new Date(),
        organizationId: 'org-1',
        severity: 'low' as const,
      };

      await service.broadcastSecurityEvent(event);

      expect(websocketGateway.broadcastToUser).toHaveBeenCalledWith(
        'user-1',
        'security_event',
        expect.any(Object),
      );

      expect(prismaService.user.findMany).not.toHaveBeenCalled();
    });
  });

  describe('broadcastUserStatusUpdate', () => {
    it('should broadcast status update and disconnect suspended users', async () => {
      const event = {
        userId: 'user-1',
        oldStatus: UserStatus.ACTIVE,
        newStatus: UserStatus.SUSPENDED,
        updatedBy: 'admin-1',
        timestamp: new Date(),
        organizationId: 'org-1',
      };

      await service.broadcastUserStatusUpdate(event);

      expect(websocketGateway.broadcastToUser).toHaveBeenCalledWith(
        'user-1',
        'status_updated',
        expect.objectContaining({
          oldStatus: UserStatus.ACTIVE,
          newStatus: UserStatus.SUSPENDED,
          message: 'Your account status has been updated to SUSPENDED',
        }),
      );

      expect(websocketGateway.broadcastToOrganization).toHaveBeenCalledWith(
        'org-1',
        'user_status_changed',
        expect.any(Object),
      );

      expect(websocketGateway.disconnectUser).toHaveBeenCalledWith(
        'user-1',
        'Account suspended',
      );
    });
  });

  describe('broadcastTeamAssignmentUpdate', () => {
    it('should broadcast team assignment to user and team members', async () => {
      const event = {
        userId: 'user-1',
        teamId: 'team-1',
        action: 'assigned' as const,
        updatedBy: 'admin-1',
        timestamp: new Date(),
        organizationId: 'org-1',
      };

      (prismaService.team.findUnique as jest.Mock).mockResolvedValue(mockTeam);
      (prismaService.teamMember.findMany as jest.Mock).mockResolvedValue([
        { userId: 'member-1' },
        { userId: 'member-2' },
      ]);

      await service.broadcastTeamAssignmentUpdate(event);

      expect(websocketGateway.broadcastToUser).toHaveBeenCalledWith(
        'user-1',
        'team_assignment_updated',
        expect.objectContaining({
          teamId: 'team-1',
          teamName: 'Sales Team',
          action: 'assigned',
          message: 'You have been assigned to team: Sales Team',
        }),
      );

      expect(websocketGateway.broadcastToUser).toHaveBeenCalledWith(
        'member-1',
        'team_member_changed',
        expect.any(Object),
      );

      expect(websocketGateway.broadcastToUser).toHaveBeenCalledWith(
        'user-1',
        'force_permission_refresh',
        expect.any(Object),
      );
    });
  });

  describe('broadcastStoreAssignmentUpdate', () => {
    it('should broadcast store assignment to affected users', async () => {
      const event = {
        teamId: 'team-1',
        storeId: 'store-1',
        action: 'assigned' as const,
        updatedBy: 'admin-1',
        timestamp: new Date(),
        organizationId: 'org-1',
        affectedUsers: ['user-1', 'user-2'],
      };

      (prismaService.store.findUnique as jest.Mock).mockResolvedValue(mockStore);
      (prismaService.team.findUnique as jest.Mock).mockResolvedValue(mockTeam);

      await service.broadcastStoreAssignmentUpdate(event);

      expect(websocketGateway.broadcastToUser).toHaveBeenCalledWith(
        'user-1',
        'store_assignment_updated',
        expect.objectContaining({
          teamId: 'team-1',
          teamName: 'Sales Team',
          storeId: 'store-1',
          storeName: 'Main Store',
          action: 'assigned',
          message: 'Store "Main Store" has been assigned to your team "Sales Team"',
        }),
      );

      expect(websocketGateway.broadcastToUser).toHaveBeenCalledWith(
        'user-1',
        'force_permission_refresh',
        expect.any(Object),
      );

      expect(websocketGateway.broadcastToUser).toHaveBeenCalledWith(
        'user-2',
        'force_permission_refresh',
        expect.any(Object),
      );
    });
  });

  describe('getUserNotifications', () => {
    it('should retrieve user notifications from Redis', async () => {
      const mockNotifications = [
        JSON.stringify({
          id: 'notif-1',
          type: 'permission_update',
          data: { message: 'Role updated' },
          timestamp: new Date(),
          read: false,
        }),
      ];

      (redisService.getClient().lRange as jest.Mock).mockResolvedValue(mockNotifications);

      const result = await service.getUserNotifications('user-1', 10);

      expect(result).toHaveLength(1);
      expect(result[0].type).toBe('permission_update');
      expect(redisService.getClient().lRange).toHaveBeenCalledWith(
        'notification:user-1',
        0,
        9,
      );
    });

    it('should return empty array on error', async () => {
      (redisService.getClient().lRange as jest.Mock).mockRejectedValue(new Error('Redis error'));

      const result = await service.getUserNotifications('user-1');

      expect(result).toEqual([]);
    });
  });

  describe('clearUserNotifications', () => {
    it('should clear all notifications for a user', async () => {
      await service.clearUserNotifications('user-1');

      expect(redisService.del).toHaveBeenCalledWith('notification:user-1');
    });
  });
});