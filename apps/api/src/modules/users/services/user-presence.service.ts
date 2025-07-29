import { Injectable, Logger } from '@nestjs/common';
import { WebsocketGateway } from '../../websocket/websocket.gateway';
import { UsersService } from '../users.service';
import { UserPresenceDto } from '../dto';
import { UserStatus } from '@prisma/client';

@Injectable()
export class UserPresenceService {
  private readonly logger = new Logger(UserPresenceService.name);

  constructor(
    private readonly websocketGateway: WebsocketGateway,
    private readonly usersService: UsersService,
  ) {}

  /**
   * Broadcast user status change to organization
   */
  async broadcastUserStatusChange(
    userId: string,
    organizationId: string,
    previousStatus: UserStatus,
    newStatus: UserStatus,
    changedBy: string,
    reason?: string,
  ): Promise<void> {
    try {
      const eventData = {
        userId,
        previousStatus,
        newStatus,
        changedBy,
        reason,
        timestamp: new Date(),
      };

      // Broadcast to organization
      await this.websocketGateway.broadcastToOrganization(
        organizationId,
        'user_status_changed',
        eventData,
      );

      // Broadcast to the affected user specifically
      await this.websocketGateway.broadcastToUser(
        userId,
        'your_status_changed',
        eventData,
      );

      this.logger.log(`Broadcasted status change for user ${userId}: ${previousStatus} -> ${newStatus}`);
    } catch (error) {
      this.logger.error(`Failed to broadcast status change for user ${userId}: ${error.message}`);
    }
  }

  /**
   * Broadcast user online status change
   */
  async broadcastUserOnlineStatusChange(
    userId: string,
    organizationId: string,
    isOnline: boolean,
  ): Promise<void> {
    try {
      const eventData = {
        userId,
        isOnline,
        timestamp: new Date(),
      };

      // Broadcast to organization
      await this.websocketGateway.broadcastToOrganization(
        organizationId,
        'user_online_status_changed',
        eventData,
      );

      this.logger.debug(`Broadcasted online status change for user ${userId}: ${isOnline}`);
    } catch (error) {
      this.logger.error(`Failed to broadcast online status change for user ${userId}: ${error.message}`);
    }
  }

  /**
   * Broadcast user presence update (activity)
   */
  async broadcastUserPresenceUpdate(
    userId: string,
    organizationId: string,
    presenceData: UserPresenceDto,
  ): Promise<void> {
    try {
      const eventData = {
        ...presenceData,
        timestamp: new Date(),
      };

      // Broadcast to organization
      await this.websocketGateway.broadcastToOrganization(
        organizationId,
        'user_presence_updated',
        eventData,
      );

      this.logger.debug(`Broadcasted presence update for user ${userId}`);
    } catch (error) {
      this.logger.error(`Failed to broadcast presence update for user ${userId}: ${error.message}`);
    }
  }

  /**
   * Broadcast bulk presence updates
   */
  async broadcastBulkPresenceUpdate(
    organizationId: string,
    presenceUpdates: UserPresenceDto[],
  ): Promise<void> {
    try {
      const eventData = {
        users: presenceUpdates,
        timestamp: new Date(),
      };

      // Broadcast to organization
      await this.websocketGateway.broadcastToOrganization(
        organizationId,
        'bulk_presence_updated',
        eventData,
      );

      this.logger.debug(`Broadcasted bulk presence update for ${presenceUpdates.length} users in org ${organizationId}`);
    } catch (error) {
      this.logger.error(`Failed to broadcast bulk presence update for org ${organizationId}: ${error.message}`);
    }
  }

  /**
   * Get and broadcast current online users count
   */
  async broadcastOnlineUsersCount(organizationId: string): Promise<void> {
    try {
      const onlineUsers = await this.usersService.getOnlineUsersInOrganization(organizationId);
      
      const eventData = {
        totalOnline: onlineUsers.totalOnline,
        timestamp: new Date(),
      };

      // Broadcast to organization
      await this.websocketGateway.broadcastToOrganization(
        organizationId,
        'online_users_count_updated',
        eventData,
      );

      this.logger.debug(`Broadcasted online users count for org ${organizationId}: ${onlineUsers.totalOnline}`);
    } catch (error) {
      this.logger.error(`Failed to broadcast online users count for org ${organizationId}: ${error.message}`);
    }
  }

  /**
   * Handle user connection (called by WebSocket gateway)
   */
  async handleUserConnected(userId: string, organizationId: string): Promise<void> {
    try {
      // Update user activity
      await this.usersService.updateLastActivity(userId);

      // Get user presence
      const presence = await this.usersService.getUserPresence(userId);

      // Broadcast online status change
      await this.broadcastUserOnlineStatusChange(userId, organizationId, true);

      // Broadcast updated online users count
      await this.broadcastOnlineUsersCount(organizationId);

      this.logger.log(`User ${userId} connected and presence updated`);
    } catch (error) {
      this.logger.error(`Failed to handle user connection for ${userId}: ${error.message}`);
    }
  }

  /**
   * Handle user disconnection (called by WebSocket gateway)
   */
  async handleUserDisconnected(userId: string, organizationId: string): Promise<void> {
    try {
      // Set user offline
      await this.usersService.setUserOffline(userId);

      // Broadcast online status change
      await this.broadcastUserOnlineStatusChange(userId, organizationId, false);

      // Broadcast updated online users count
      await this.broadcastOnlineUsersCount(organizationId);

      this.logger.log(`User ${userId} disconnected and marked offline`);
    } catch (error) {
      this.logger.error(`Failed to handle user disconnection for ${userId}: ${error.message}`);
    }
  }

  /**
   * Periodic cleanup of inactive users with broadcasting
   */
  async performPeriodicCleanup(): Promise<void> {
    try {
      const cleanedUpCount = await this.usersService.cleanupInactiveUsers();
      
      if (cleanedUpCount > 0) {
        this.logger.log(`Cleaned up ${cleanedUpCount} inactive users`);
        
        // Note: We could broadcast organization-specific updates here
        // but it would require getting the organization for each cleaned up user
        // For now, we'll let the periodic online count updates handle this
      }
    } catch (error) {
      this.logger.error(`Failed to perform periodic cleanup: ${error.message}`);
    }
  }
}