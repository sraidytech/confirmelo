import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { WebsocketService } from './websocket.service';
import { PrismaService } from '../../common/database/prisma.service';
import { RedisService } from '../../common/redis/redis.service';
import { Socket } from 'socket.io';
import { UserRole, UserStatus } from '@prisma/client';

describe('WebsocketService', () => {
  let service: WebsocketService;
  let jwtService: JwtService;
  let prismaService: PrismaService;
  let redisService: RedisService;

  const mockUser = {
    id: 'user-1',
    organizationId: 'org-1',
    role: UserRole.CALL_CENTER_AGENT,
    status: UserStatus.ACTIVE,
    firstName: 'John',
    lastName: 'Doe',
    isOnline: false,
    lastActiveAt: new Date(),
  };

  const mockSocket = {
    id: 'socket-1',
    handshake: {
      auth: { token: 'Bearer valid-token' },
      address: '127.0.0.1',
      headers: { 'user-agent': 'test-agent' },
      query: {},
    },
    emit: jest.fn(),
    disconnect: jest.fn(),
    join: jest.fn(),
    leave: jest.fn(),
    to: jest.fn().mockReturnThis(),
  } as unknown as Socket;

  beforeEach(async () => {
    const mockJwtService = {
      verify: jest.fn(),
    };

    const mockPrismaService = {
      user: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
    };

    const mockRedisService = {
      get: jest.fn(),
      set: jest.fn(),
      del: jest.fn(),
      getClient: jest.fn().mockReturnValue({
        sAdd: jest.fn().mockResolvedValue(1),
        sRem: jest.fn().mockResolvedValue(1),
        sCard: jest.fn().mockResolvedValue(1),
        expire: jest.fn().mockResolvedValue(1),
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WebsocketService,
        {
          provide: JwtService,
          useValue: mockJwtService,
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

    service = module.get<WebsocketService>(WebsocketService);
    jwtService = module.get<JwtService>(JwtService);
    prismaService = module.get<PrismaService>(PrismaService);
    redisService = module.get<RedisService>(RedisService);
  });

  describe('authenticateConnection', () => {
    it('should successfully authenticate a valid connection', async () => {
      const mockPayload = { sub: 'user-1', iat: Date.now() };
      
      (jwtService.verify as jest.Mock).mockReturnValue(mockPayload);
      (redisService.get as jest.Mock).mockResolvedValue(null); // Not blacklisted
      (prismaService.user.findUnique as jest.Mock).mockResolvedValue(mockUser);

      const result = await service.authenticateConnection(mockSocket);

      expect(result).toBeDefined();
      expect(result?.userId).toBe('user-1');
      expect(result?.organizationId).toBe('org-1');
      expect(result?.socketId).toBe('socket-1');
      expect(jwtService.verify).toHaveBeenCalledWith('valid-token');
    });

    it('should reject connection with no token', async () => {
      const socketWithoutToken = {
        ...mockSocket,
        handshake: {
          ...mockSocket.handshake,
          auth: {},
          query: {},
        },
      } as unknown as Socket;

      const result = await service.authenticateConnection(socketWithoutToken);

      expect(result).toBeNull();
      expect(jwtService.verify).not.toHaveBeenCalled();
    });

    it('should reject connection with blacklisted token', async () => {
      (redisService.get as jest.Mock).mockResolvedValue('blacklisted');

      const result = await service.authenticateConnection(mockSocket);

      expect(result).toBeNull();
      expect(jwtService.verify).not.toHaveBeenCalled();
    });

    it('should reject connection with invalid token', async () => {
      (jwtService.verify as jest.Mock).mockImplementation(() => {
        throw new Error('Invalid token');
      });
      (redisService.get as jest.Mock).mockResolvedValue(null);

      const result = await service.authenticateConnection(mockSocket);

      expect(result).toBeNull();
    });

    it('should reject connection for inactive user', async () => {
      const inactiveUser = { ...mockUser, status: UserStatus.SUSPENDED };
      const mockPayload = { sub: 'user-1', iat: Date.now() };
      
      (jwtService.verify as jest.Mock).mockReturnValue(mockPayload);
      (redisService.get as jest.Mock).mockResolvedValue(null);
      (prismaService.user.findUnique as jest.Mock).mockResolvedValue(inactiveUser);

      const result = await service.authenticateConnection(mockSocket);

      expect(result).toBeNull();
    });

    it('should extract token from query parameters', async () => {
      const socketWithQueryToken = {
        ...mockSocket,
        handshake: {
          ...mockSocket.handshake,
          auth: {},
          query: { token: 'query-token' },
        },
      } as unknown as Socket;

      const mockPayload = { sub: 'user-1', iat: Date.now() };
      
      (jwtService.verify as jest.Mock).mockReturnValue(mockPayload);
      (redisService.get as jest.Mock).mockResolvedValue(null);
      (prismaService.user.findUnique as jest.Mock).mockResolvedValue(mockUser);

      const result = await service.authenticateConnection(socketWithQueryToken);

      expect(result).toBeDefined();
      expect(jwtService.verify).toHaveBeenCalledWith('query-token');
    });
  });

  describe('handleConnection', () => {
    it('should handle successful connection', async () => {
      const mockConnectedUser = {
        userId: 'user-1',
        socketId: 'socket-1',
        organizationId: 'org-1',
        role: UserRole.CALL_CENTER_AGENT,
        connectedAt: new Date(),
        lastActivity: new Date(),
      };

      jest.spyOn(service, 'authenticateConnection').mockResolvedValue(mockConnectedUser);
      (redisService.set as jest.Mock).mockResolvedValue(undefined);
      (redisService.getClient as jest.Mock).mockReturnValue({
        sAdd: jest.fn().mockResolvedValue(1),
        sCard: jest.fn().mockResolvedValue(1),
        expire: jest.fn().mockResolvedValue(1),
      });
      (prismaService.user.update as jest.Mock).mockResolvedValue(mockUser);

      const result = await service.handleConnection(mockSocket);

      expect(result).toBe(true);
      expect(mockSocket.join).toHaveBeenCalledWith('org:org-1');
      expect(mockSocket.join).toHaveBeenCalledWith('user:user-1');
      expect(mockSocket.emit).toHaveBeenCalledWith('authenticated', {
        userId: 'user-1',
        connectedAt: mockConnectedUser.connectedAt,
      });
    });

    it('should handle failed authentication', async () => {
      jest.spyOn(service, 'authenticateConnection').mockResolvedValue(null);

      const result = await service.handleConnection(mockSocket);

      expect(result).toBe(false);
      expect(mockSocket.emit).toHaveBeenCalledWith('auth_error', {
        message: 'Authentication failed',
      });
      expect(mockSocket.disconnect).toHaveBeenCalled();
    });
  });

  describe('handleDisconnection', () => {
    it('should handle disconnection for connected user', async () => {
      // First simulate a connection
      const mockConnectedUser = {
        userId: 'user-1',
        socketId: 'socket-1',
        organizationId: 'org-1',
        role: UserRole.CALL_CENTER_AGENT,
        connectedAt: new Date(),
        lastActivity: new Date(),
      };

      // Manually add to connections map
      (service as any).connections.set('socket-1', mockConnectedUser);

      (redisService.get as jest.Mock).mockResolvedValue(mockConnectedUser);
      (redisService.del as jest.Mock).mockResolvedValue(undefined);
      (redisService.getClient as jest.Mock).mockReturnValue({
        sRem: jest.fn().mockResolvedValue(1),
        sCard: jest.fn().mockResolvedValue(0), // No other connections
      });

      await service.handleDisconnection(mockSocket);

      expect((service as any).connections.has('socket-1')).toBe(false);
    });

    it('should handle disconnection for unknown socket', async () => {
      await service.handleDisconnection(mockSocket);

      // Should not throw error and complete successfully
      expect(true).toBe(true);
    });
  });

  describe('getUserPresence', () => {
    it('should return cached presence if available', async () => {
      const cachedPresence = {
        userId: 'user-1',
        isOnline: true,
        lastSeen: new Date(),
        activeConnections: 1,
      };

      (redisService.get as jest.Mock).mockResolvedValue(cachedPresence);

      const result = await service.getUserPresence('user-1');

      expect(result).toEqual(cachedPresence);
      expect(prismaService.user.findUnique).not.toHaveBeenCalled();
    });

    it('should fallback to database if not cached', async () => {
      (redisService.get as jest.Mock).mockResolvedValue(null);
      (prismaService.user.findUnique as jest.Mock).mockResolvedValue(mockUser);
      (redisService.getClient as jest.Mock).mockReturnValue({
        sCard: jest.fn().mockResolvedValue(1),
      });
      (redisService.set as jest.Mock).mockResolvedValue(undefined);

      const result = await service.getUserPresence('user-1');

      expect(result).toBeDefined();
      expect(result?.userId).toBe('user-1');
      expect(result?.isOnline).toBe(false);
      expect(result?.activeConnections).toBe(1);
    });

    it('should return null for non-existent user', async () => {
      (redisService.get as jest.Mock).mockResolvedValue(null);
      (prismaService.user.findUnique as jest.Mock).mockResolvedValue(null);

      const result = await service.getUserPresence('non-existent');

      expect(result).toBeNull();
    });
  });

  describe('getOnlineUsersInOrganization', () => {
    it('should return unique user IDs for organization', async () => {
      // Add mock connections to the service
      const connections = new Map();
      connections.set('socket-1', { userId: 'user-1', organizationId: 'org-1' });
      connections.set('socket-2', { userId: 'user-2', organizationId: 'org-1' });
      connections.set('socket-3', { userId: 'user-1', organizationId: 'org-1' }); // Duplicate user
      connections.set('socket-4', { userId: 'user-3', organizationId: 'org-2' }); // Different org

      (service as any).connections = connections;

      const result = await service.getOnlineUsersInOrganization('org-1');

      expect(result).toEqual(['user-1', 'user-2']);
      expect(result).toHaveLength(2); // Should deduplicate user-1
    });
  });

  describe('updateActivity', () => {
    it('should update activity for connected user', async () => {
      const mockConnectedUser = {
        userId: 'user-1',
        socketId: 'socket-1',
        organizationId: 'org-1',
        role: UserRole.CALL_CENTER_AGENT,
        connectedAt: new Date(),
        lastActivity: new Date(),
      };

      (service as any).connections.set('socket-1', mockConnectedUser);
      (redisService.set as jest.Mock).mockResolvedValue(undefined);
      (prismaService.user.update as jest.Mock).mockResolvedValue(mockUser);

      await service.updateActivity('socket-1');

      expect(redisService.set).toHaveBeenCalled();
      expect(prismaService.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: {
          isOnline: true,
          lastActiveAt: expect.any(Date),
        },
      });
    });

    it('should handle activity update for unknown socket', async () => {
      await service.updateActivity('unknown-socket');

      // Should not throw error
      expect(redisService.set).not.toHaveBeenCalled();
      expect(prismaService.user.update).not.toHaveBeenCalled();
    });
  });

  describe('getConnectionStats', () => {
    it('should return correct connection statistics', () => {
      const connections = new Map();
      connections.set('socket-1', { userId: 'user-1', organizationId: 'org-1' });
      connections.set('socket-2', { userId: 'user-2', organizationId: 'org-1' });
      connections.set('socket-3', { userId: 'user-1', organizationId: 'org-1' }); // Same user, different socket
      connections.set('socket-4', { userId: 'user-3', organizationId: 'org-2' });

      (service as any).connections = connections;

      const stats = service.getConnectionStats();

      expect(stats.totalConnections).toBe(4);
      expect(stats.uniqueUsers).toBe(3);
      expect(stats.connectionsByOrganization).toEqual({
        'org-1': 3,
        'org-2': 1,
      });
    });
  });
});