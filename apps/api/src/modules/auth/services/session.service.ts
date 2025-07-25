import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../common/database/prisma.service';
import { RedisService } from '../../../common/redis/redis.service';

export interface SessionData {
  userId: string;
  organizationId?: string;
  role: string;
  permissions: string[];
  assignments: any[];
  websocketId?: string;
  lastActivity: Date;
  ipAddress: string;
  userAgent: string;
}

export interface SessionInfo {
  id: string;
  userId: string;
  ipAddress?: string;
  userAgent?: string;
  createdAt: Date;
  lastActivity: Date;
  expiresAt: Date;
  isActive: boolean;
}

@Injectable()
export class SessionService {
  constructor(
    private prisma: PrismaService,
    private redisService: RedisService,
  ) {}

  /**
   * Create a new session
   */
  async createSession(
    sessionId: string,
    userId: string,
    sessionData: SessionData,
    expiresAt: Date,
  ): Promise<void> {
    // Store in database
    await this.prisma.session.create({
      data: {
        sessionToken: sessionId,
        userId,
        expiresAt,
        ipAddress: sessionData.ipAddress,
        userAgent: sessionData.userAgent,
      },
    });

    // Store in Redis with TTL
    const ttl = Math.floor((expiresAt.getTime() - Date.now()) / 1000);
    await this.redisService.setSession(sessionId, sessionData, ttl);
  }

  /**
   * Get session data
   */
  async getSession(sessionId: string): Promise<SessionData | null> {
    // Try Redis first (faster)
    let sessionData = await this.redisService.getSession(sessionId);
    
    if (!sessionData) {
      // Fallback to database
      const dbSession = await this.prisma.session.findUnique({
        where: { sessionToken: sessionId },
        include: { user: { include: { organization: true } } },
      });

      if (!dbSession || dbSession.expiresAt < new Date()) {
        return null;
      }

      // Reconstruct session data
      sessionData = {
        userId: dbSession.user.id,
        organizationId: dbSession.user.organizationId,
        role: dbSession.user.role,
        permissions: [], // Would be populated by authorization service
        assignments: [], // Would be populated by authorization service
        lastActivity: new Date(),
        ipAddress: dbSession.ipAddress || 'unknown',
        userAgent: dbSession.userAgent || 'unknown',
      };

      // Restore to Redis
      const ttl = Math.floor((dbSession.expiresAt.getTime() - Date.now()) / 1000);
      if (ttl > 0) {
        await this.redisService.setSession(sessionId, sessionData, ttl);
      }
    }

    return sessionData;
  }

  /**
   * Update session data
   */
  async updateSession(sessionId: string, updates: Partial<SessionData>): Promise<void> {
    const existingSession = await this.getSession(sessionId);
    if (!existingSession) return;

    const updatedSession = { ...existingSession, ...updates, lastActivity: new Date() };
    
    // Update Redis
    await this.redisService.setSession(sessionId, updatedSession);

    // Update database session timestamp
    await this.prisma.session.updateMany({
      where: { sessionToken: sessionId },
      data: { /* lastUsedAt would be added to schema if needed */ },
    });
  }

  /**
   * Invalidate a session
   */
  async invalidateSession(sessionId: string): Promise<void> {
    // Remove from Redis
    await this.redisService.deleteSession(sessionId);

    // Remove from database
    await this.prisma.session.deleteMany({
      where: { sessionToken: sessionId },
    });
  }

  /**
   * Get all sessions for a user
   */
  async getUserSessions(userId: string): Promise<SessionInfo[]> {
    const dbSessions = await this.prisma.session.findMany({
      where: { 
        userId,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: 'desc' },
    });

    const sessions: SessionInfo[] = [];

    for (const dbSession of dbSessions) {
      const redisSession = await this.redisService.getSession(dbSession.sessionToken);
      
      sessions.push({
        id: dbSession.sessionToken,
        userId: dbSession.userId,
        ipAddress: dbSession.ipAddress,
        userAgent: dbSession.userAgent,
        createdAt: dbSession.createdAt,
        lastActivity: redisSession?.lastActivity || dbSession.createdAt,
        expiresAt: dbSession.expiresAt,
        isActive: !!redisSession,
      });
    }

    return sessions;
  }

  /**
   * Invalidate all sessions for a user
   */
  async invalidateAllUserSessions(userId: string): Promise<number> {
    const sessions = await this.prisma.session.findMany({
      where: { userId },
      select: { sessionToken: true },
    });

    // Remove from Redis
    for (const session of sessions) {
      await this.redisService.deleteSession(session.sessionToken);
    }

    // Remove from database
    const result = await this.prisma.session.deleteMany({
      where: { userId },
    });

    return result.count;
  }

  /**
   * Clean up expired sessions
   */
  async cleanupExpiredSessions(): Promise<number> {
    const result = await this.prisma.session.deleteMany({
      where: {
        expiresAt: { lt: new Date() },
      },
    });

    return result.count;
  }

  /**
   * Update user online status based on session activity
   */
  async updateUserOnlineStatus(userId: string): Promise<void> {
    const activeSessions = await this.getUserSessions(userId);
    const isOnline = activeSessions.some(session => session.isActive);

    await this.prisma.user.update({
      where: { id: userId },
      data: { 
        isOnline,
        lastActiveAt: isOnline ? new Date() : undefined,
      },
    });
  }

  /**
   * Get session statistics
   */
  async getSessionStats(): Promise<{
    totalActiveSessions: number;
    totalUsers: number;
    onlineUsers: number;
    sessionsByRole: Record<string, number>;
  }> {
    // Get all active sessions from database
    const activeSessions = await this.prisma.session.findMany({
      where: {
        expiresAt: { gt: new Date() },
      },
      include: { user: true },
    });

    // Count online users (users with active Redis sessions)
    const userIds = [...new Set(activeSessions.map(s => s.userId))];
    let onlineUsers = 0;
    
    for (const userId of userIds) {
      const userSessions = activeSessions.filter(s => s.userId === userId);
      const hasActiveSession = await Promise.all(
        userSessions.map(s => this.redisService.getSession(s.sessionToken))
      );
      
      if (hasActiveSession.some(session => session !== null)) {
        onlineUsers++;
      }
    }

    // Count sessions by role
    const sessionsByRole: Record<string, number> = {};
    for (const session of activeSessions) {
      const role = session.user.role;
      sessionsByRole[role] = (sessionsByRole[role] || 0) + 1;
    }

    return {
      totalActiveSessions: activeSessions.length,
      totalUsers: userIds.length,
      onlineUsers,
      sessionsByRole,
    };
  }

  /**
   * Extend session expiration
   */
  async extendSession(sessionId: string, additionalTime: number): Promise<void> {
    const session = await this.prisma.session.findUnique({
      where: { sessionToken: sessionId },
    });

    if (!session) return;

    const newExpiresAt = new Date(session.expiresAt.getTime() + additionalTime);

    // Update database
    await this.prisma.session.update({
      where: { sessionToken: sessionId },
      data: { expiresAt: newExpiresAt },
    });

    // Update Redis TTL
    const sessionData = await this.redisService.getSession(sessionId);
    if (sessionData) {
      const newTtl = Math.floor((newExpiresAt.getTime() - Date.now()) / 1000);
      await this.redisService.setSession(sessionId, sessionData, newTtl);
    }
  }

  /**
   * Check if session is valid and active
   */
  async isSessionValid(sessionId: string): Promise<boolean> {
    const sessionData = await this.getSession(sessionId);
    return sessionData !== null;
  }

  /**
   * Get session device info
   */
  async getSessionDeviceInfo(sessionId: string): Promise<{
    browser?: string;
    os?: string;
    device?: string;
    location?: string;
  } | null> {
    const session = await this.prisma.session.findUnique({
      where: { sessionToken: sessionId },
    });

    if (!session) return null;

    // Parse user agent (simplified)
    const userAgent = session.userAgent || '';
    const browser = this.extractBrowser(userAgent);
    const os = this.extractOS(userAgent);
    const device = this.extractDevice(userAgent);

    return {
      browser,
      os,
      device,
      location: session.ipAddress, // Could be enhanced with IP geolocation
    };
  }

  private extractBrowser(userAgent: string): string {
    if (userAgent.includes('Chrome')) return 'Chrome';
    if (userAgent.includes('Firefox')) return 'Firefox';
    if (userAgent.includes('Safari')) return 'Safari';
    if (userAgent.includes('Edge')) return 'Edge';
    return 'Unknown';
  }

  private extractOS(userAgent: string): string {
    if (userAgent.includes('Windows')) return 'Windows';
    if (userAgent.includes('Mac')) return 'macOS';
    if (userAgent.includes('Linux')) return 'Linux';
    if (userAgent.includes('Android')) return 'Android';
    if (userAgent.includes('iOS')) return 'iOS';
    return 'Unknown';
  }

  private extractDevice(userAgent: string): string {
    if (userAgent.includes('Mobile')) return 'Mobile';
    if (userAgent.includes('Tablet')) return 'Tablet';
    return 'Desktop';
  }
}