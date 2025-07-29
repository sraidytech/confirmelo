import { Test, TestingModule } from '@nestjs/testing';
import { UserPresenceService } from './user-presence.service';
import { WebsocketGateway } from '../../websocket/websocket.gateway';
import { UsersService } from '../users.service';
import { UserStatus } from '@prisma/client';

describe('UserPresenceService', () => {
  let service: UserPresenceService;
  let websocketGateway: jest.Mocked<WebsocketGateway>;
  let usersService: jest.Mocked<UsersService>;

  const mockUserPresence = {
    userId: 'user-123',
    isOnline: true,
    lastActiveAt: new Date(),
    status: UserStatus.ACTIVE,
  };

  beforeEach(async () => {
    const mockWebsocketGateway = {
      broadcastToOrganization: jest.fn(),
      broadcastToUser: jest.fn(),
    };

    const mockUsersService = {
      updateLastActivity: jest.fn(),
      getUserPresence: jest.fn(),
      setUserOffline: jest.fn(),
      getOnlineUsersInOrganization: jest.fn(),
      cleanupInactiveUsers: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UserPresenceService,
        { provide: WebsocketGateway, useValue: mockWebsocketGateway },
        { provide: UsersService, useValue: mockUsersService },
      ],
    }).compile();

    service = module.get<UserPresenceService>(UserPresenceService);
    websocketGateway = module.get(WebsocketGateway);
    usersService = module.get(UsersService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('broadcastUserStatusChange', () => {
    it('should broadcast status change to organization and user', async () => {
      const userId = 'user-123';
      const organizationId = 'org-123';
      const previousStatus = UserStatus.PENDING;
      const newStatus = UserStatus.ACTIVE;
      const changedBy = 'admin-123';
      const reason = 'Account verified';

      await service.broadcastUserStatusChange(
        userId,
        organizationId,
        previousStatus,
        newStatus,
        changedBy,
        reason,
      );

      expect(websocketGateway.broadcastToOrganization).toHaveBeenCalledWith(
        organizationId,
        'user_status_changed',
        expect.objectContaining({
          userId,
          previousStatus,
          newStatus,
          changedBy,
          reason,
          timestamp: expect.any(Date),
        }),
      );

      expect(websocketGateway.broadcastToUser).toHaveBeenCalledWith(
        userId,
        'your_status_changed',
        expect.objectContaining({
          userId,
          previousStatus,
          newStatus,
          changedBy,
          reason,
          timestamp: expect.any(Date),
        }),
      );
    });
  });

  describe('broadcastUserOnlineStatusChange', () => {
    it('should broadcast online status change to organization', async () => {
      const userId = 'user-123';
      const organizationId = 'org-123';
      const isOnline = true;

      await service.broadcastUserOnlineStatusChange(userId, organizationId, isOnline);

      expect(websocketGateway.broadcastToOrganization).toHaveBeenCalledWith(
        organizationId,
        'user_online_status_changed',
        expect.objectContaining({
          userId,
          isOnline,
          timestamp: expect.any(Date),
        }),
      );
    });
  });

  describe('broadcastUserPresenceUpdate', () => {
    it('should broadcast presence update to organization', async () => {
      const userId = 'user-123';
      const organizationId = 'org-123';

      await service.broadcastUserPresenceUpdate(userId, organizationId, mockUserPresence);

      expect(websocketGateway.broadcastToOrganization).toHaveBeenCalledWith(
        organizationId,
        'user_presence_updated',
        expect.objectContaining({
          ...mockUserPresence,
          timestamp: expect.any(Date),
        }),
      );
    });
  });

  describe('broadcastBulkPresenceUpdate', () => {
    it('should broadcast bulk presence updates to organization', async () => {
      const organizationId = 'org-123';
      const presenceUpdates = [mockUserPresence];

      await service.broadcastBulkPresenceUpdate(organizationId, presenceUpdates);

      expect(websocketGateway.broadcastToOrganization).toHaveBeenCalledWith(
        organizationId,
        'bulk_presence_updated',
        expect.objectContaining({
          users: presenceUpdates,
          timestamp: expect.any(Date),
        }),
      );
    });
  });

  describe('broadcastOnlineUsersCount', () => {
    it('should get and broadcast online users count', async () => {
      const organizationId = 'org-123';
      const mockOnlineUsers = {
        onlineUserIds: ['user-1', 'user-2'],
        totalOnline: 2,
        timestamp: new Date(),
      };

      usersService.getOnlineUsersInOrganization.mockResolvedValue(mockOnlineUsers);

      await service.broadcastOnlineUsersCount(organizationId);

      expect(usersService.getOnlineUsersInOrganization).toHaveBeenCalledWith(organizationId);
      expect(websocketGateway.broadcastToOrganization).toHaveBeenCalledWith(
        organizationId,
        'online_users_count_updated',
        expect.objectContaining({
          totalOnline: 2,
          timestamp: expect.any(Date),
        }),
      );
    });
  });

  describe('handleUserConnected', () => {
    it('should update activity and broadcast connection', async () => {
      const userId = 'user-123';
      const organizationId = 'org-123';

      usersService.getUserPresence.mockResolvedValue(mockUserPresence);

      await service.handleUserConnected(userId, organizationId);

      expect(usersService.updateLastActivity).toHaveBeenCalledWith(userId);
      expect(usersService.getUserPresence).toHaveBeenCalledWith(userId);
      expect(websocketGateway.broadcastToOrganization).toHaveBeenCalledWith(
        organizationId,
        'user_online_status_changed',
        expect.objectContaining({
          userId,
          isOnline: true,
          timestamp: expect.any(Date),
        }),
      );
    });
  });

  describe('handleUserDisconnected', () => {
    it('should set user offline and broadcast disconnection', async () => {
      const userId = 'user-123';
      const organizationId = 'org-123';

      await service.handleUserDisconnected(userId, organizationId);

      expect(usersService.setUserOffline).toHaveBeenCalledWith(userId);
      expect(websocketGateway.broadcastToOrganization).toHaveBeenCalledWith(
        organizationId,
        'user_online_status_changed',
        expect.objectContaining({
          userId,
          isOnline: false,
          timestamp: expect.any(Date),
        }),
      );
    });
  });

  describe('performPeriodicCleanup', () => {
    it('should perform cleanup and log results', async () => {
      const cleanedUpCount = 3;
      usersService.cleanupInactiveUsers.mockResolvedValue(cleanedUpCount);

      await service.performPeriodicCleanup();

      expect(usersService.cleanupInactiveUsers).toHaveBeenCalled();
    });

    it('should handle cleanup with no inactive users', async () => {
      usersService.cleanupInactiveUsers.mockResolvedValue(0);

      await service.performPeriodicCleanup();

      expect(usersService.cleanupInactiveUsers).toHaveBeenCalled();
    });
  });
});