import { Injectable, BadRequestException, ConflictException, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../common/database/prisma.service';
import { RedisService } from '../../common/redis/redis.service';
import { AuthorizationService } from '../../common/services/authorization.service';
import { UpdateProfileDto, ChangePasswordDto, UpdateUserStatusDto, UserPresenceDto, BulkUserPresenceDto, OnlineUsersResponseDto, UserActivitySummaryDto } from './dto';
import { UserStatus } from '@prisma/client';
import * as bcrypt from 'bcrypt';

@Injectable()
export class UsersService {
  constructor(
    private prismaService: PrismaService,
    private redisService: RedisService,
    private authorizationService: AuthorizationService,
  ) {}

  /**
   * Get user profile by ID
   */
  async getUserProfile(userId: string) {
    const user = await this.prismaService.user.findUnique({
      where: { id: userId },
      include: {
        organization: {
          select: {
            id: true,
            name: true,
            code: true,
            email: true,
            country: true,
            timezone: true,
            currency: true,
          },
        },
      },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Remove password from response
    const { password, ...userProfile } = user;

    return userProfile;
  }

  /**
   * Update user profile
   */
  async updateProfile(userId: string, updateData: UpdateProfileDto) {
    // Check if email or username already exists (if being updated)
    if (updateData.email || updateData.username) {
      const existingUser = await this.prismaService.user.findFirst({
        where: {
          AND: [
            { id: { not: userId } },
            {
              OR: [
                updateData.email ? { email: updateData.email } : {},
                updateData.username ? { username: updateData.username } : {},
              ].filter(condition => Object.keys(condition).length > 0),
            },
          ],
        },
      });

      if (existingUser) {
        if (existingUser.email === updateData.email) {
          throw new ConflictException('Email already exists');
        }
        if (existingUser.username === updateData.username) {
          throw new ConflictException('Username already exists');
        }
      }
    }

    // Update user profile
    const updatedUser = await this.prismaService.user.update({
      where: { id: userId },
      data: {
        ...updateData,
        updatedAt: new Date(),
      },
      include: {
        organization: {
          select: {
            id: true,
            name: true,
            code: true,
            email: true,
            country: true,
            timezone: true,
            currency: true,
          },
        },
      },
    });

    // Invalidate user permissions cache if profile was updated
    await this.authorizationService.invalidateUserPermissions(userId);

    // Update user's online status
    await this.updateLastActivity(userId);

    // Remove password from response
    const { password, ...userProfile } = updatedUser;

    return userProfile;
  }

  /**
   * Change user password
   */
  async changePassword(userId: string, changePasswordData: ChangePasswordDto) {
    // Get current user
    const user = await this.prismaService.user.findUnique({
      where: { id: userId },
      select: { id: true, password: true },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Verify current password
    const isCurrentPasswordValid = await bcrypt.compare(
      changePasswordData.currentPassword,
      user.password,
    );

    if (!isCurrentPasswordValid) {
      throw new BadRequestException('Current password is incorrect');
    }

    // Validate new password strength (basic validation)
    if (changePasswordData.newPassword.length < 8) {
      throw new BadRequestException('New password must be at least 8 characters long');
    }

    // Check if new password is different from current
    const isSamePassword = await bcrypt.compare(
      changePasswordData.newPassword,
      user.password,
    );

    if (isSamePassword) {
      throw new BadRequestException('New password must be different from current password');
    }

    // Hash new password
    const hashedNewPassword = await bcrypt.hash(changePasswordData.newPassword, 12);

    // Update password
    await this.prismaService.user.update({
      where: { id: userId },
      data: {
        password: hashedNewPassword,
        updatedAt: new Date(),
      },
    });

    // TODO: Invalidate all user sessions except current one
    // This would require session management implementation

    return { success: true, message: 'Password changed successfully' };
  }

  /**
   * Update user avatar
   */
  async updateAvatar(userId: string, avatarUrl: string) {
    const updatedUser = await this.prismaService.user.update({
      where: { id: userId },
      data: {
        avatar: avatarUrl,
        updatedAt: new Date(),
      },
      select: {
        id: true,
        avatar: true,
      },
    });

    return updatedUser;
  }

  /**
   * Update user's last activity timestamp
   */
  async updateLastActivity(userId: string) {
    await this.prismaService.user.update({
      where: { id: userId },
      data: {
        lastActiveAt: new Date(),
        isOnline: true,
      },
    });

    // Update Redis cache for real-time features
    const cacheKey = `user_activity:${userId}`;
    await this.redisService.set(cacheKey, new Date().toISOString(), 300); // 5 minutes TTL
  }

  /**
   * Set user offline status
   */
  async setUserOffline(userId: string) {
    await this.prismaService.user.update({
      where: { id: userId },
      data: {
        isOnline: false,
      },
    });

    // Remove from Redis cache
    const cacheKey = `user_activity:${userId}`;
    await this.redisService.del(cacheKey);
  }

  /**
   * Get user's online status
   */
  async getUserOnlineStatus(userId: string): Promise<boolean> {
    const cacheKey = `user_activity:${userId}`;
    const lastActivity = await this.redisService.get(cacheKey);
    
    if (lastActivity) {
      return true;
    }

    // Fallback to database
    const user = await this.prismaService.user.findUnique({
      where: { id: userId },
      select: { isOnline: true, lastActiveAt: true },
    });

    // Consider user online if last activity was within 5 minutes
    if (user?.lastActiveAt) {
      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
      return user.lastActiveAt > fiveMinutesAgo;
    }

    return false;
  }

  /**
   * Update user status (ACTIVE, SUSPENDED, PENDING)
   */
  async updateUserStatus(userId: string, statusData: UpdateUserStatusDto, changedBy: string) {
    // Get current user to check existing status
    const user = await this.prismaService.user.findUnique({
      where: { id: userId },
      select: { id: true, status: true, organizationId: true },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Prevent users from changing their own status
    if (userId === changedBy) {
      throw new ForbiddenException('Users cannot change their own status');
    }

    const previousStatus = user.status;
    const newStatus = statusData.status;

    // Update user status
    const updatedUser = await this.prismaService.user.update({
      where: { id: userId },
      data: {
        status: newStatus,
        updatedAt: new Date(),
      },
      include: {
        organization: {
          select: {
            id: true,
            name: true,
            code: true,
          },
        },
      },
    });

    // Log status change in audit log
    await this.prismaService.auditLog.create({
      data: {
        userId: changedBy,
        organizationId: user.organizationId,
        action: 'USER_STATUS_CHANGED',
        entityType: 'User',
        entityId: userId,
        previousValue: { status: previousStatus },
        newValue: { status: newStatus, reason: statusData.reason },
      },
    });

    // If user is suspended or deleted, set them offline
    if (newStatus === UserStatus.SUSPENDED || newStatus === UserStatus.DELETED) {
      await this.setUserOffline(userId);
    }

    // Invalidate user permissions cache
    await this.authorizationService.invalidateUserPermissions(userId);

    // Remove password from response
    const { password, ...userProfile } = updatedUser;

    return {
      user: userProfile,
      previousStatus,
      newStatus,
      changedBy,
      changedAt: new Date(),
      reason: statusData.reason,
    };
  }

  /**
   * Get user presence information
   */
  async getUserPresence(userId: string): Promise<UserPresenceDto> {
    const user = await this.prismaService.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        isOnline: true,
        lastActiveAt: true,
        status: true,
      },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Check Redis for real-time online status
    const isOnline = await this.getUserOnlineStatus(userId);

    return {
      userId: user.id,
      isOnline,
      lastActiveAt: user.lastActiveAt || new Date(),
      status: user.status,
    };
  }

  /**
   * Get presence information for multiple users
   */
  async getBulkUserPresence(userIds: string[]): Promise<BulkUserPresenceDto> {
    const users = await this.prismaService.user.findMany({
      where: {
        id: { in: userIds },
      },
      select: {
        id: true,
        isOnline: true,
        lastActiveAt: true,
        status: true,
      },
    });

    const presenceData: UserPresenceDto[] = [];

    for (const user of users) {
      const isOnline = await this.getUserOnlineStatus(user.id);
      presenceData.push({
        userId: user.id,
        isOnline,
        lastActiveAt: user.lastActiveAt || new Date(),
        status: user.status,
      });
    }

    return {
      users: presenceData,
      timestamp: new Date(),
    };
  }

  /**
   * Get all online users in an organization
   */
  async getOnlineUsersInOrganization(organizationId: string): Promise<OnlineUsersResponseDto> {
    // Get all users in the organization
    const users = await this.prismaService.user.findMany({
      where: {
        organizationId,
        status: UserStatus.ACTIVE,
      },
      select: {
        id: true,
      },
    });

    const onlineUserIds: string[] = [];

    // Check each user's online status
    for (const user of users) {
      const isOnline = await this.getUserOnlineStatus(user.id);
      if (isOnline) {
        onlineUserIds.push(user.id);
      }
    }

    return {
      onlineUserIds,
      totalOnline: onlineUserIds.length,
      timestamp: new Date(),
    };
  }

  /**
   * Get comprehensive user activity summary
   */
  async getUserActivitySummary(userId: string): Promise<UserActivitySummaryDto> {
    const user = await this.prismaService.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        isOnline: true,
        lastActiveAt: true,
        status: true,
      },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Get active sessions count
    const activeSessions = await this.prismaService.session.count({
      where: {
        userId,
        expiresAt: { gt: new Date() },
      },
    });

    // Get latest session info for IP and user agent
    const latestSession = await this.prismaService.session.findFirst({
      where: {
        userId,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: 'desc' },
      select: {
        ipAddress: true,
        userAgent: true,
      },
    });

    const isOnline = await this.getUserOnlineStatus(userId);

    return {
      userId: user.id,
      isOnline,
      lastActiveAt: user.lastActiveAt || new Date(),
      activeSessions,
      status: user.status,
      lastIpAddress: latestSession?.ipAddress,
      lastUserAgent: latestSession?.userAgent,
    };
  }

  /**
   * Batch update user activity for multiple users
   */
  async batchUpdateUserActivity(userIds: string[]): Promise<void> {
    const now = new Date();

    // Update database
    await this.prismaService.user.updateMany({
      where: {
        id: { in: userIds },
      },
      data: {
        lastActiveAt: now,
        isOnline: true,
      },
    });

    // Update Redis cache for each user
    const promises = userIds.map(userId => {
      const cacheKey = `user_activity:${userId}`;
      return this.redisService.set(cacheKey, now.toISOString(), 300); // 5 minutes TTL
    });
    await Promise.all(promises);
  }

  /**
   * Clean up inactive users (mark as offline)
   */
  async cleanupInactiveUsers(): Promise<number> {
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);

    // Find users who haven't been active in the last 5 minutes but are marked as online
    const inactiveUsers = await this.prismaService.user.findMany({
      where: {
        isOnline: true,
        lastActiveAt: { lt: fiveMinutesAgo },
      },
      select: { id: true },
    });

    if (inactiveUsers.length === 0) {
      return 0;
    }

    const userIds = inactiveUsers.map(user => user.id);

    // Mark them as offline
    await this.prismaService.user.updateMany({
      where: {
        id: { in: userIds },
      },
      data: {
        isOnline: false,
      },
    });

    // Remove from Redis cache
    const promises = userIds.map(userId => {
      const cacheKey = `user_activity:${userId}`;
      return this.redisService.del(cacheKey);
    });
    await Promise.all(promises);

    return inactiveUsers.length;
  }

  /**
   * Validate password strength
   */
  validatePasswordStrength(password: string): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (password.length < 8) {
      errors.push('Password must be at least 8 characters long');
    }

    if (password.length > 128) {
      errors.push('Password must not exceed 128 characters');
    }

    if (!/[a-z]/.test(password)) {
      errors.push('Password must contain at least one lowercase letter');
    }

    if (!/[A-Z]/.test(password)) {
      errors.push('Password must contain at least one uppercase letter');
    }

    if (!/\d/.test(password)) {
      errors.push('Password must contain at least one number');
    }

    if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
      errors.push('Password must contain at least one special character');
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }
}