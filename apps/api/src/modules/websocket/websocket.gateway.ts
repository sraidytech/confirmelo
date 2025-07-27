import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
} from '@nestjs/websockets';
import { Injectable, Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../../common/database/prisma.service';
import { RedisService } from '../../common/redis/redis.service';

@Injectable()
@WebSocketGateway({
  cors: {
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    credentials: true,
  },
  namespace: '/realtime',
})
export class WebsocketGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(WebsocketGateway.name);
  private readonly userSockets = new Map<string, Set<string>>(); // userId -> Set of socketIds
  private readonly socketUsers = new Map<string, string>(); // socketId -> userId

  constructor(
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  afterInit(server: Server) {
    this.logger.log('WebSocket Gateway initialized');
  }

  async handleConnection(client: Socket) {
    try {
      const token = client.handshake.auth?.token || client.handshake.headers?.authorization?.replace('Bearer ', '');
      
      if (!token) {
        this.logger.warn(`Connection rejected: No token provided`);
        client.disconnect();
        return;
      }

      const payload = this.jwtService.verify(token);
      const userId = payload.sub;

      // Verify user exists and is active
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, status: true, organizationId: true },
      });

      if (!user || user.status !== 'ACTIVE') {
        this.logger.warn(`Connection rejected: User ${userId} not found or inactive`);
        client.disconnect();
        return;
      }

      // Store connection mapping
      if (!this.userSockets.has(userId)) {
        this.userSockets.set(userId, new Set());
      }
      this.userSockets.get(userId)!.add(client.id);
      this.socketUsers.set(client.id, userId);

      // Join user to their organization room
      client.join(`org:${user.organizationId}`);
      client.join(`user:${userId}`);

      // Update user online status in Redis
      await this.updateUserOnlineStatus(userId, true);

      this.logger.log(`User ${userId} connected with socket ${client.id}`);
      
      // Notify user of successful connection
      client.emit('connected', {
        message: 'Successfully connected to real-time notifications',
        timestamp: new Date(),
      });

    } catch (error) {
      this.logger.error(`Connection error: ${error.message}`);
      client.disconnect();
    }
  }

  async handleDisconnect(client: Socket) {
    const userId = this.socketUsers.get(client.id);
    
    if (userId) {
      // Remove socket from user's socket set
      const userSocketSet = this.userSockets.get(userId);
      if (userSocketSet) {
        userSocketSet.delete(client.id);
        
        // If no more sockets for this user, mark as offline
        if (userSocketSet.size === 0) {
          this.userSockets.delete(userId);
          await this.updateUserOnlineStatus(userId, false);
        }
      }
      
      this.socketUsers.delete(client.id);
      this.logger.log(`User ${userId} disconnected socket ${client.id}`);
    }
  }

  /**
   * Broadcast message to a specific user across all their connected devices
   */
  async broadcastToUser(userId: string, event: string, data: any): Promise<void> {
    try {
      const userSocketSet = this.userSockets.get(userId);
      if (userSocketSet && userSocketSet.size > 0) {
        // Send to all user's connected sockets
        for (const socketId of userSocketSet) {
          this.server.to(socketId).emit(event, {
            ...data,
            timestamp: new Date(),
          });
        }
        this.logger.debug(`Broadcasted ${event} to user ${userId} on ${userSocketSet.size} sockets`);
      } else {
        this.logger.debug(`User ${userId} not connected, skipping broadcast of ${event}`);
      }
    } catch (error) {
      this.logger.error(`Error broadcasting to user ${userId}: ${error.message}`);
    }
  }

  /**
   * Broadcast message to all users in an organization
   */
  async broadcastToOrganization(organizationId: string, event: string, data: any): Promise<void> {
    try {
      this.server.to(`org:${organizationId}`).emit(event, {
        ...data,
        timestamp: new Date(),
      });
      this.logger.debug(`Broadcasted ${event} to organization ${organizationId}`);
    } catch (error) {
      this.logger.error(`Error broadcasting to organization ${organizationId}: ${error.message}`);
    }
  }

  /**
   * Force disconnect a user from all their sessions
   */
  async disconnectUser(userId: string, reason?: string): Promise<void> {
    try {
      const userSocketSet = this.userSockets.get(userId);
      if (userSocketSet) {
        for (const socketId of userSocketSet) {
          const socket = this.server.sockets.sockets.get(socketId);
          if (socket) {
            socket.emit('force_disconnect', {
              reason: reason || 'Session terminated',
              timestamp: new Date(),
            });
            socket.disconnect(true);
          }
        }
        this.userSockets.delete(userId);
        await this.updateUserOnlineStatus(userId, false);
        this.logger.log(`Force disconnected user ${userId}: ${reason}`);
      }
    } catch (error) {
      this.logger.error(`Error force disconnecting user ${userId}: ${error.message}`);
    }
  }

  /**
   * Get list of online users in an organization
   */
  async getOnlineUsers(organizationId: string): Promise<string[]> {
    try {
      const onlineUsers: string[] = [];
      for (const [userId, socketSet] of this.userSockets.entries()) {
        if (socketSet.size > 0) {
          // Verify user belongs to the organization
          const user = await this.prisma.user.findUnique({
            where: { id: userId },
            select: { organizationId: true },
          });
          if (user?.organizationId === organizationId) {
            onlineUsers.push(userId);
          }
        }
      }
      return onlineUsers;
    } catch (error) {
      this.logger.error(`Error getting online users for org ${organizationId}: ${error.message}`);
      return [];
    }
  }

  /**
   * Check if a specific user is online
   */
  isUserOnline(userId: string): boolean {
    const userSocketSet = this.userSockets.get(userId);
    return userSocketSet ? userSocketSet.size > 0 : false;
  }

  /**
   * Update user online status in Redis for persistence
   */
  private async updateUserOnlineStatus(userId: string, isOnline: boolean): Promise<void> {
    try {
      const redisClient = this.redis.getClient();
      const key = `user:${userId}:online`;
      
      if (isOnline) {
        await redisClient.set(key, '1', { EX: 300 }); // 5 minutes TTL
      } else {
        await redisClient.del(key);
      }
    } catch (error) {
      this.logger.error(`Error updating online status for user ${userId}: ${error.message}`);
    }
  }
}