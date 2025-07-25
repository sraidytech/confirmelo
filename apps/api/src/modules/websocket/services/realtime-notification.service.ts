import { Injectable, Logger } from '@nestjs/common';
import { WebsocketGateway } from '../websocket.gateway';
import { PrismaService } from '../../../common/database/prisma.service';
import { RedisService } from '../../../common/redis/redis.service';
import { UserRole, UserStatus } from '@prisma/client';

export interface PermissionUpdateEvent {
  userId: string;
  oldRole?: UserRole;
  newRole: UserRole;
  updatedBy: string;
  timestamp: Date;
  organizationId: string;
}

export interface SessionUpdateEvent {
  userId: string;
  sessionId?: string;
  action: 'created' | 'updated' | 'terminated' | 'expired';
  reason?: string;
  timestamp: Date;
  organizationId: string;
}

export interface SecurityEvent {
  userId: string;
  eventType: 'login_attempt' | 'login_success' | 'login_failed' | 'password_changed' | 'account_locked' | 'account_unlocked' | 'suspicious_activity';
  details: any;
  ipAddress?: string;
  userAgent?: string;
  timestamp: Date;
  organizationId: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
}

export interface UserStatusUpdateEvent {
  userId: string;
  oldStatus?: UserStatus;
  newStatus: UserStatus;
  updatedBy?: string;
  timestamp: Date;
  organizationId: string;
}

export interface TeamAssignmentEvent {
  userId: string;
  teamId: string;
  action: 'assigned' | 'removed';
  updatedBy: string;
  timestamp: Date;
  organizationId: string;
}

export interface StoreAssignmentEvent {
  teamId: string;
  storeId: string;
  action: 'assigned' | 'removed';
  updatedBy: string;
  timestamp: Date;
  organizationId: string;
  affectedUsers: string[];
}

@Injectable()
export class RealtimeNotificationService {
  private readonly logger = new Logger(RealtimeNotificationService.name);
  private readonly NOTIFICATION_TTL = 86400; // 24 hours
  private readonly NOTIFICATION_PREFIX = 'notification:';

  constructor(
    private readonly websocketGateway: WebsocketGateway,
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  /**
   * Broadcast permission update to affected users
   */
  async broadcastPermissionUpdate(event: PermissionUpdateEvent): Promise<void> {
    try {
      // Store notification for offline users
      await this.storeNotification(event.userId, 'permission_update', event);

      // Broadcast to the specific user
      await this.websocketGateway.broadcastToUser(event.userId, 'permission_updated', {
        oldRole: event.oldRole,
        newRole: event.newRole,
        updatedBy: event.updatedBy,
        timestamp: event.timestamp,
        message: `Your role has been updated to ${event.newRole}`,
      });

      // Broadcast to organization admins
      await this.broadcastToAdmins(event.organizationId, 'user_permission_changed', {
        userId: event.userId,
        oldRole: event.oldRole,
        newRole: event.newRole,
        updatedBy: event.updatedBy,
        timestamp: event.timestamp,
      });

      // If user is online, force refresh their permissions
      await this.forcePermissionRefresh(event.userId);

      this.logger.log(`Permission update broadcasted for user ${event.userId}: ${event.oldRole} -> ${event.newRole}`);
    } catch (error) {
      this.logger.error(`Failed to broadcast permission update for user ${event.userId}:`, error);
    }
  }

  /**
   * Broadcast session update to affected users
   */
  async broadcastSessionUpdate(event: SessionUpdateEvent): Promise<void> {
    try {
      // Store notification for offline users
      await this.storeNotification(event.userId, 'session_update', event);

      const message = this.getSessionUpdateMessage(event.action, event.reason);

      // Broadcast to the specific user
      await this.websocketGateway.broadcastToUser(event.userId, 'session_updated', {
        sessionId: event.sessionId,
        action: event.action,
        reason: event.reason,
        timestamp: event.timestamp,
        message,
      });

      // If session is terminated, force disconnect
      if (event.action === 'terminated') {
        await this.websocketGateway.disconnectUser(event.userId, event.reason);
      }

      this.logger.log(`Session update broadcasted for user ${event.userId}: ${event.action}`);
    } catch (error) {
      this.logger.error(`Failed to broadcast session update for user ${event.userId}:`, error);
    }
  }

  /**
   * Broadcast security event to relevant users
   */
  async broadcastSecurityEvent(event: SecurityEvent): Promise<void> {
    try {
      // Store notification for offline users
      await this.storeNotification(event.userId, 'security_event', event);

      // Broadcast to the specific user
      await this.websocketGateway.broadcastToUser(event.userId, 'security_event', {
        eventType: event.eventType,
        details: event.details,
        timestamp: event.timestamp,
        severity: event.severity,
        message: this.getSecurityEventMessage(event.eventType, event.severity),
      });

      // Broadcast critical events to organization admins
      if (event.severity === 'critical' || event.severity === 'high') {
        await this.broadcastToAdmins(event.organizationId, 'security_alert', {
          userId: event.userId,
          eventType: event.eventType,
          details: event.details,
          ipAddress: event.ipAddress,
          userAgent: event.userAgent,
          timestamp: event.timestamp,
          severity: event.severity,
        });
      }

      this.logger.log(`Security event broadcasted for user ${event.userId}: ${event.eventType} (${event.severity})`);
    } catch (error) {
      this.logger.error(`Failed to broadcast security event for user ${event.userId}:`, error);
    }
  }

  /**
   * Broadcast user status update
   */
  async broadcastUserStatusUpdate(event: UserStatusUpdateEvent): Promise<void> {
    try {
      // Store notification for offline users
      await this.storeNotification(event.userId, 'status_update', event);

      // Broadcast to the specific user
      await this.websocketGateway.broadcastToUser(event.userId, 'status_updated', {
        oldStatus: event.oldStatus,
        newStatus: event.newStatus,
        updatedBy: event.updatedBy,
        timestamp: event.timestamp,
        message: `Your account status has been updated to ${event.newStatus}`,
      });

      // Broadcast to organization
      await this.websocketGateway.broadcastToOrganization(event.organizationId, 'user_status_changed', {
        userId: event.userId,
        oldStatus: event.oldStatus,
        newStatus: event.newStatus,
        timestamp: event.timestamp,
      });

      // If user is suspended or deleted, force disconnect
      if (event.newStatus === UserStatus.SUSPENDED || event.newStatus === UserStatus.DELETED) {
        await this.websocketGateway.disconnectUser(event.userId, `Account ${event.newStatus.toLowerCase()}`);
      }

      this.logger.log(`User status update broadcasted for user ${event.userId}: ${event.oldStatus} -> ${event.newStatus}`);
    } catch (error) {
      this.logger.error(`Failed to broadcast user status update for user ${event.userId}:`, error);
    }
  }

  /**
   * Broadcast team assignment update
   */
  async broadcastTeamAssignmentUpdate(event: TeamAssignmentEvent): Promise<void> {
    try {
      // Store notification for offline users
      await this.storeNotification(event.userId, 'team_assignment', event);

      // Get team details
      const team = await this.prisma.team.findUnique({
        where: { id: event.teamId },
        select: { name: true },
      });

      const message = event.action === 'assigned' 
        ? `You have been assigned to team: ${team?.name || 'Unknown'}`
        : `You have been removed from team: ${team?.name || 'Unknown'}`;

      // Broadcast to the specific user
      await this.websocketGateway.broadcastToUser(event.userId, 'team_assignment_updated', {
        teamId: event.teamId,
        teamName: team?.name,
        action: event.action,
        updatedBy: event.updatedBy,
        timestamp: event.timestamp,
        message,
      });

      // Broadcast to team members
      const teamMembers = await this.getTeamMemberIds(event.teamId);
      for (const memberId of teamMembers) {
        if (memberId !== event.userId) {
          await this.websocketGateway.broadcastToUser(memberId, 'team_member_changed', {
            userId: event.userId,
            teamId: event.teamId,
            action: event.action,
            timestamp: event.timestamp,
          });
        }
      }

      // Force permission refresh for the user
      await this.forcePermissionRefresh(event.userId);

      this.logger.log(`Team assignment update broadcasted for user ${event.userId}: ${event.action} to team ${event.teamId}`);
    } catch (error) {
      this.logger.error(`Failed to broadcast team assignment update for user ${event.userId}:`, error);
    }
  }

  /**
   * Broadcast store assignment update
   */
  async broadcastStoreAssignmentUpdate(event: StoreAssignmentEvent): Promise<void> {
    try {
      // Get store and team details
      const [store, team] = await Promise.all([
        this.prisma.store.findUnique({
          where: { id: event.storeId },
          select: { name: true },
        }),
        this.prisma.team.findUnique({
          where: { id: event.teamId },
          select: { name: true },
        }),
      ]);

      const message = event.action === 'assigned'
        ? `Store "${store?.name}" has been assigned to your team "${team?.name}"`
        : `Store "${store?.name}" has been removed from your team "${team?.name}"`;

      // Broadcast to all affected users
      for (const userId of event.affectedUsers) {
        await this.storeNotification(userId, 'store_assignment', event);
        
        await this.websocketGateway.broadcastToUser(userId, 'store_assignment_updated', {
          teamId: event.teamId,
          teamName: team?.name,
          storeId: event.storeId,
          storeName: store?.name,
          action: event.action,
          updatedBy: event.updatedBy,
          timestamp: event.timestamp,
          message,
        });

        // Force permission refresh for each user
        await this.forcePermissionRefresh(userId);
      }

      this.logger.log(`Store assignment update broadcasted for team ${event.teamId}: ${event.action} store ${event.storeId}`);
    } catch (error) {
      this.logger.error(`Failed to broadcast store assignment update for team ${event.teamId}:`, error);
    }
  }

  /**
   * Get stored notifications for a user
   */
  async getUserNotifications(userId: string, limit: number = 50): Promise<any[]> {
    try {
      const notificationKey = `${this.NOTIFICATION_PREFIX}${userId}`;
      const notifications = await this.redis.getClient().lRange(notificationKey, 0, limit - 1);
      
      return notifications.map(notification => JSON.parse(notification));
    } catch (error) {
      this.logger.error(`Failed to get notifications for user ${userId}:`, error);
      return [];
    }
  }

  /**
   * Mark notifications as read
   */
  async markNotificationsAsRead(userId: string, notificationIds: string[]): Promise<void> {
    try {
      // Implementation would depend on how we want to track read status
      // For now, we'll just log it
      this.logger.log(`Marked ${notificationIds.length} notifications as read for user ${userId}`);
    } catch (error) {
      this.logger.error(`Failed to mark notifications as read for user ${userId}:`, error);
    }
  }

  /**
   * Clear all notifications for a user
   */
  async clearUserNotifications(userId: string): Promise<void> {
    try {
      const notificationKey = `${this.NOTIFICATION_PREFIX}${userId}`;
      await this.redis.del(notificationKey);
      
      this.logger.log(`Cleared all notifications for user ${userId}`);
    } catch (error) {
      this.logger.error(`Failed to clear notifications for user ${userId}:`, error);
    }
  }

  // Private helper methods

  private async storeNotification(userId: string, type: string, data: any): Promise<void> {
    try {
      const notificationKey = `${this.NOTIFICATION_PREFIX}${userId}`;
      const notification = {
        id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        type,
        data,
        timestamp: new Date(),
        read: false,
      };

      // Add to the beginning of the list
      await this.redis.getClient().lPush(notificationKey, JSON.stringify(notification));
      
      // Keep only the last 100 notifications
      await this.redis.getClient().lTrim(notificationKey, 0, 99);
      
      // Set expiration
      await this.redis.getClient().expire(notificationKey, this.NOTIFICATION_TTL);
    } catch (error) {
      this.logger.error(`Failed to store notification for user ${userId}:`, error);
    }
  }

  private async broadcastToAdmins(organizationId: string, event: string, data: any): Promise<void> {
    try {
      // Get admin users in the organization
      const admins = await this.prisma.user.findMany({
        where: {
          organizationId,
          role: {
            in: [UserRole.SUPER_ADMIN, UserRole.ADMIN],
          },
          status: UserStatus.ACTIVE,
        },
        select: { id: true },
      });

      // Broadcast to each admin
      for (const admin of admins) {
        await this.websocketGateway.broadcastToUser(admin.id, event, data);
      }
    } catch (error) {
      this.logger.error(`Failed to broadcast to admins in organization ${organizationId}:`, error);
    }
  }

  private async forcePermissionRefresh(userId: string): Promise<void> {
    try {
      await this.websocketGateway.broadcastToUser(userId, 'force_permission_refresh', {
        timestamp: new Date(),
        message: 'Your permissions have been updated. Please refresh your session.',
      });
    } catch (error) {
      this.logger.error(`Failed to force permission refresh for user ${userId}:`, error);
    }
  }

  private async getTeamMemberIds(teamId: string): Promise<string[]> {
    try {
      const members = await this.prisma.teamMember.findMany({
        where: {
          teamId,
          leftAt: null,
        },
        select: { userId: true },
      });

      const team = await this.prisma.team.findUnique({
        where: { id: teamId },
        select: { leaderId: true },
      });

      const memberIds = members.map(member => member.userId);
      if (team?.leaderId && !memberIds.includes(team.leaderId)) {
        memberIds.push(team.leaderId);
      }

      return memberIds;
    } catch (error) {
      this.logger.error(`Failed to get team member IDs for team ${teamId}:`, error);
      return [];
    }
  }

  private getSessionUpdateMessage(action: string, reason?: string): string {
    switch (action) {
      case 'created':
        return 'New session created';
      case 'updated':
        return 'Session updated';
      case 'terminated':
        return reason ? `Session terminated: ${reason}` : 'Session terminated';
      case 'expired':
        return 'Session expired';
      default:
        return 'Session updated';
    }
  }

  private getSecurityEventMessage(eventType: string, severity: string): string {
    const messages = {
      login_attempt: 'Login attempt detected',
      login_success: 'Successful login',
      login_failed: 'Failed login attempt',
      password_changed: 'Password changed successfully',
      account_locked: 'Account has been locked due to security concerns',
      account_unlocked: 'Account has been unlocked',
      suspicious_activity: 'Suspicious activity detected on your account',
    };

    const baseMessage = messages[eventType] || 'Security event';
    
    if (severity === 'critical' || severity === 'high') {
      return `⚠️ ${baseMessage} - Immediate attention required`;
    }
    
    return baseMessage;
  }
}