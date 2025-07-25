import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger, UseGuards } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { WebsocketService } from './websocket.service';

@WebSocketGateway({
  cors: {
    origin: process.env.WEBSOCKET_CORS_ORIGIN || 'http://localhost:3000',
    credentials: true,
  },
  transports: ['websocket', 'polling'],
})
export class WebsocketGateway 
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect 
{
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(WebsocketGateway.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly websocketService: WebsocketService,
  ) {}

  afterInit(server: Server) {
    this.logger.log('WebSocket Gateway initialized');
    
    // Set up server reference in service for broadcasting
    this.setupServerReference(server);
  }

  async handleConnection(client: Socket) {
    this.logger.log(`Client attempting connection: ${client.id}`);
    
    const success = await this.websocketService.handleConnection(client);
    
    if (!success) {
      this.logger.warn(`Connection rejected for client: ${client.id}`);
      client.disconnect();
      return;
    }

    this.logger.log(`Client successfully connected: ${client.id}`);
  }

  async handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnecting: ${client.id}`);
    await this.websocketService.handleDisconnection(client);
  }

  @SubscribeMessage('ping')
  async handlePing(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: any,
  ): Promise<void> {
    // Update user activity on ping
    await this.websocketService.updateActivity(client.id);
    
    // Send pong response
    client.emit('pong', {
      timestamp: new Date(),
      data,
    });
  }

  @SubscribeMessage('get_presence')
  async handleGetPresence(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { userId: string },
  ): Promise<void> {
    try {
      const presence = await this.websocketService.getUserPresence(data.userId);
      client.emit('presence_update', presence);
    } catch (error) {
      client.emit('error', {
        event: 'get_presence',
        message: 'Failed to get user presence',
      });
    }
  }

  @SubscribeMessage('get_online_users')
  async handleGetOnlineUsers(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { organizationId: string },
  ): Promise<void> {
    try {
      const onlineUsers = await this.websocketService.getOnlineUsersInOrganization(
        data.organizationId,
      );
      client.emit('online_users', {
        organizationId: data.organizationId,
        users: onlineUsers,
        timestamp: new Date(),
      });
    } catch (error) {
      client.emit('error', {
        event: 'get_online_users',
        message: 'Failed to get online users',
      });
    }
  }

  @SubscribeMessage('join_room')
  async handleJoinRoom(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { room: string },
  ): Promise<void> {
    try {
      await client.join(data.room);
      client.emit('room_joined', {
        room: data.room,
        timestamp: new Date(),
      });
      
      this.logger.log(`Client ${client.id} joined room: ${data.room}`);
    } catch (error) {
      client.emit('error', {
        event: 'join_room',
        message: 'Failed to join room',
      });
    }
  }

  @SubscribeMessage('leave_room')
  async handleLeaveRoom(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { room: string },
  ): Promise<void> {
    try {
      await client.leave(data.room);
      client.emit('room_left', {
        room: data.room,
        timestamp: new Date(),
      });
      
      this.logger.log(`Client ${client.id} left room: ${data.room}`);
    } catch (error) {
      client.emit('error', {
        event: 'leave_room',
        message: 'Failed to leave room',
      });
    }
  }

  /**
   * Broadcast message to specific user
   */
  async broadcastToUser(userId: string, event: string, data: any): Promise<void> {
    this.server.to(`user:${userId}`).emit(event, data);
  }

  /**
   * Broadcast message to organization
   */
  async broadcastToOrganization(organizationId: string, event: string, data: any): Promise<void> {
    this.server.to(`org:${organizationId}`).emit(event, data);
  }

  /**
   * Disconnect user from all sessions
   */
  async disconnectUser(userId: string, reason?: string): Promise<void> {
    if (reason) {
      // Emit disconnection reason before disconnecting
      this.server.to(`user:${userId}`).emit('force_disconnect', {
        reason,
        timestamp: new Date(),
      });
    }

    // Get all sockets for the user and disconnect them
    const sockets = await this.server.in(`user:${userId}`).fetchSockets();
    for (const socket of sockets) {
      socket.disconnect();
    }

    // Clean up in service
    await this.websocketService.disconnectUser(userId, reason);
  }

  /**
   * Get connection statistics
   */
  getConnectionStats() {
    return this.websocketService.getConnectionStats();
  }

  /**
   * Cleanup expired connections every 5 minutes
   */
  @Cron(CronExpression.EVERY_5_MINUTES)
  async handleConnectionCleanup() {
    this.logger.log('Running connection cleanup...');
    await this.websocketService.cleanupExpiredConnections();
  }

  /**
   * Set up server reference for broadcasting
   */
  private setupServerReference(server: Server): void {
    // Extend the websocket service with server methods
    (this.websocketService as any).broadcastToUser = (userId: string, event: string, data: any) => {
      return this.broadcastToUser(userId, event, data);
    };

    (this.websocketService as any).broadcastToOrganization = (organizationId: string, event: string, data: any) => {
      return this.broadcastToOrganization(organizationId, event, data);
    };

    (this.websocketService as any).disconnectUser = (userId: string, reason?: string) => {
      return this.disconnectUser(userId, reason);
    };
  }
}