import { Injectable, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../../common/database/prisma.service';
import { RedisService } from '../../common/redis/redis.service';
import { Socket } from 'socket.io';

export interface ConnectedUser {
  userId: string;
  socketId: string;
  organizationId: string;
  role: string;
  connectedAt: Date;
  lastActivity: Date;
  ipAddress?: string;
  userAgent?: string;
}

export interface UserPresence {
  userId: string;
  isOnline: boolean;
  lastSeen: Date;
  activeConnections: number;
}

@Injectable()
export class WebsocketService {
  private readonly logger = new Logger(WebsocketService.name);
  private readonly PRESENCE_TTL = 300; // 5 minutes
  private readonly CONNECTION_PREFIX = 'ws_connection:';
  private readonly PRESENCE_PREFIX = 'user_presence:';
  private readonly USER_CONNECTIONS_PREFIX = 'user_connections:';

  // In-memory connection store for quick access
  private connections = new Map<string, ConnectedUser>();

  constructor(
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  /**
   * Authenticate WebSocket connection using JWT token
   */
  async authenticateConnection(socket: Socket): Promise<ConnectedUser | null> {
    try {
      // Extract token from handshake auth or query
      const token = this.extractTokenFromSocket(socket);
      
      if (!token) {
        this.logger.warn(`No token provided for socket ${socket.id}`);
        return null;
      }

      // Check if token is blacklisted
      const isBlacklisted = await this.redis.get(`blacklist:${token}`);
      if (isBlacklisted) {
        this.logger.warn(`Blacklisted token used for socket ${socket.id}`);
        return null;
      }

      // Verify JWT token
      const payload = this.jwtService.verify(token);
      
      // Get user from database
      const user = await this.prisma.user.findUnique({
        where: { id: payload.sub },
        select: {
          id: true,
          organizationId: true,
          role: true,
          status: true,
          firstName: true,
          lastName: true,
        },
      });

      if (!user || user.status !== 'ACTIVE') {
        this.logger.warn(`Invalid or inactive user for socket ${socket.id}`);
        return null;
      }

      // Create connected user object
      const connectedUser: ConnectedUser = {
        userId: user.id,
        socketId: socket.id,
        organizationId: user.organizationId,
        role: user.role,
        connectedAt: new Date(),
        lastActivity: new Date(),
        ipAddress: socket.handshake.address,
        userAgent: socket.handshake.headers['user-agent'],
      };

      return connectedUser;
    } catch (error) {
      this.logger.error(`Authentication failed for socket ${socket.id}:`, error.message);
      return null;
    }
  }

  /**
   * Handle new WebSocket connection
   */
  async handleConnection(socket: Socket): Promise<boolean> {
    const connectedUser = await this.authenticateConnection(socket);
    
    if (!connectedUser) {
      socket.emit('auth_error', { message: 'Authentication failed' });
      socket.disconnect();
      return false;
    }

    // Store connection in memory and Redis
    this.connections.set(socket.id, connectedUser);
    await this.storeConnectionInRedis(connectedUser);

    // Update user presence
    await this.updateUserPresence(connectedUser.userId, true);

    // Update user's last activity in database
    await this.updateUserActivity(connectedUser.userId);

    // Join user to their organization room
    socket.join(`org:${connectedUser.organizationId}`);
    socket.join(`user:${connectedUser.userId}`);

    // Emit successful connection
    socket.emit('authenticated', {
      userId: connectedUser.userId,
      connectedAt: connectedUser.connectedAt,
    });

    // Broadcast user online status to organization
    socket.to(`org:${connectedUser.organizationId}`).emit('user_online', {
      userId: connectedUser.userId,
      timestamp: new Date(),
    });

    this.logger.log(`User ${connectedUser.userId} connected via socket ${socket.id}`);
    return true;
  }

  /**
   * Handle WebSocket disconnection
   */
  async handleDisconnection(socket: Socket): Promise<void> {
    const connectedUser = this.connections.get(socket.id);
    
    if (!connectedUser) {
      return;
    }

    // Remove connection from memory and Redis
    this.connections.delete(socket.id);
    await this.removeConnectionFromRedis(socket.id);

    // Check if user has other active connections
    const hasOtherConnections = await this.hasActiveConnections(connectedUser.userId);
    
    if (!hasOtherConnections) {
      // Update user presence to offline
      await this.updateUserPresence(connectedUser.userId, false);

      // Broadcast user offline status to organization
      socket.to(`org:${connectedUser.organizationId}`).emit('user_offline', {
        userId: connectedUser.userId,
        timestamp: new Date(),
      });
    }

    this.logger.log(`User ${connectedUser.userId} disconnected from socket ${socket.id}`);
  }

  /**
   * Update user activity timestamp
   */
  async updateActivity(socketId: string): Promise<void> {
    const connectedUser = this.connections.get(socketId);
    
    if (connectedUser) {
      connectedUser.lastActivity = new Date();
      await this.storeConnectionInRedis(connectedUser);
      await this.updateUserActivity(connectedUser.userId);
    }
  }

  /**
   * Get user presence information
   */
  async getUserPresence(userId: string): Promise<UserPresence | null> {
    const cacheKey = `${this.PRESENCE_PREFIX}${userId}`;
    const cached = await this.redis.get(cacheKey);
    
    if (cached) {
      return cached;
    }

    // Fallback to database
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        isOnline: true,
        lastActiveAt: true,
      },
    });

    if (!user) {
      return null;
    }

    const activeConnections = await this.getActiveConnectionCount(userId);
    
    const presence: UserPresence = {
      userId,
      isOnline: user.isOnline,
      lastSeen: user.lastActiveAt || new Date(),
      activeConnections,
    };

    await this.redis.set(cacheKey, presence, this.PRESENCE_TTL);
    return presence;
  }

  /**
   * Get all online users in an organization
   */
  async getOnlineUsersInOrganization(organizationId: string): Promise<string[]> {
    const connections = Array.from(this.connections.values())
      .filter(conn => conn.organizationId === organizationId);
    
    const userIds = [...new Set(connections.map(conn => conn.userId))];
    return userIds;
  }

  /**
   * Disconnect user from all sessions
   */
  async disconnectUser(userId: string, reason?: string): Promise<void> {
    const userConnections = Array.from(this.connections.values())
      .filter(conn => conn.userId === userId);

    for (const connection of userConnections) {
      // Emit disconnection reason if provided
      if (reason) {
        // Note: We would need access to the socket server here
        // This will be handled in the gateway
      }
      
      // Remove from memory and Redis
      this.connections.delete(connection.socketId);
      await this.removeConnectionFromRedis(connection.socketId);
    }

    // Update user presence
    await this.updateUserPresence(userId, false);
  }

  /**
   * Broadcast message to user's all connections
   */
  async broadcastToUser(userId: string, event: string, data: any): Promise<void> {
    // This will be implemented in the gateway as it needs access to the socket server
    // The service provides the logic, gateway handles the actual emission
  }

  /**
   * Clean up expired connections
   */
  async cleanupExpiredConnections(): Promise<void> {
    const now = new Date();
    const expiredThreshold = new Date(now.getTime() - (30 * 60 * 1000)); // 30 minutes

    for (const [socketId, connection] of this.connections.entries()) {
      if (connection.lastActivity < expiredThreshold) {
        this.logger.warn(`Cleaning up expired connection for user ${connection.userId}`);
        this.connections.delete(socketId);
        await this.removeConnectionFromRedis(socketId);
      }
    }
  }

  /**
   * Get connection statistics
   */
  getConnectionStats(): {
    totalConnections: number;
    uniqueUsers: number;
    connectionsByOrganization: Record<string, number>;
  } {
    const connections = Array.from(this.connections.values());
    const uniqueUsers = new Set(connections.map(conn => conn.userId)).size;
    
    const connectionsByOrganization = connections.reduce((acc, conn) => {
      acc[conn.organizationId] = (acc[conn.organizationId] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    return {
      totalConnections: connections.length,
      uniqueUsers,
      connectionsByOrganization,
    };
  }

  // Private helper methods

  private extractTokenFromSocket(socket: Socket): string | null {
    // Try to get token from auth header
    const authHeader = socket.handshake.auth?.token || socket.handshake.headers?.authorization;
    if (authHeader) {
      const [type, token] = authHeader.split(' ');
      if (type === 'Bearer' && token) {
        return token;
      }
      return authHeader; // In case it's just the token without Bearer prefix
    }

    // Try to get token from query parameters
    const queryToken = socket.handshake.query?.token;
    if (typeof queryToken === 'string') {
      return queryToken;
    }

    return null;
  }

  private async storeConnectionInRedis(connection: ConnectedUser): Promise<void> {
    const connectionKey = `${this.CONNECTION_PREFIX}${connection.socketId}`;
    const userConnectionsKey = `${this.USER_CONNECTIONS_PREFIX}${connection.userId}`;
    
    // Store individual connection
    await this.redis.set(connectionKey, connection, this.PRESENCE_TTL);
    
    // Add to user's connections set
    await this.redis.getClient().sAdd(userConnectionsKey, connection.socketId);
    await this.redis.getClient().expire(userConnectionsKey, this.PRESENCE_TTL);
  }

  private async removeConnectionFromRedis(socketId: string): Promise<void> {
    const connectionKey = `${this.CONNECTION_PREFIX}${socketId}`;
    const connection = await this.redis.get(connectionKey);
    
    if (connection) {
      const userConnectionsKey = `${this.USER_CONNECTIONS_PREFIX}${connection.userId}`;
      await this.redis.getClient().sRem(userConnectionsKey, socketId);
    }
    
    await this.redis.del(connectionKey);
  }

  private async hasActiveConnections(userId: string): Promise<boolean> {
    const userConnectionsKey = `${this.USER_CONNECTIONS_PREFIX}${userId}`;
    const connectionCount = await this.redis.getClient().sCard(userConnectionsKey);
    return connectionCount > 0;
  }

  private async getActiveConnectionCount(userId: string): Promise<number> {
    const userConnectionsKey = `${this.USER_CONNECTIONS_PREFIX}${userId}`;
    return await this.redis.getClient().sCard(userConnectionsKey);
  }

  private async updateUserPresence(userId: string, isOnline: boolean): Promise<void> {
    const presenceKey = `${this.PRESENCE_PREFIX}${userId}`;
    const presence: UserPresence = {
      userId,
      isOnline,
      lastSeen: new Date(),
      activeConnections: await this.getActiveConnectionCount(userId),
    };
    
    await this.redis.set(presenceKey, presence, this.PRESENCE_TTL);
  }

  private async updateUserActivity(userId: string): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        isOnline: true,
        lastActiveAt: new Date(),
      },
    });
  }
}