import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../../common/database/prisma.service';
import { RedisService } from '../../../common/redis/redis.service';
import { RealtimeNotificationService } from '../../websocket/services/realtime-notification.service';
import { WebsocketGateway } from '../../websocket/websocket.gateway';
import { 
  SessionInfoDto, 
  SessionActivityDto, 
  GetSessionsResponse, 
  SessionStatsDto,
  TerminateSessionResponse 
} from '../dto/session-management.dto';
import { UAParser } from 'ua-parser-js';

@Injectable()
export class SessionManagementService {
  constructor(
    private prisma: PrismaService,
    private redisService: RedisService,
    private realtimeNotificationService: RealtimeNotificationService,
    private websocketGateway: WebsocketGateway,
  ) {}

  /**
   * Get all sessions for a user with detailed information
   */
  async getUserSessions(userId: string, includeExpired = false): Promise<GetSessionsResponse> {
    try {
      // Get sessions from database
      const sessions = await this.prisma.session.findMany({
        where: {
          userId,
          ...(includeExpired ? {} : { expiresAt: { gt: new Date() } }),
        },
        orderBy: { createdAt: 'desc' },
      });

      // Get current session from Redis (if available)
      const currentSessionId = await this.getCurrentSessionId(userId);

      // Process sessions and add additional information
      const sessionInfos: SessionInfoDto[] = await Promise.all(
        sessions.map(async (session) => {
          const deviceInfo = this.parseUserAgent(session.userAgent);
          const locationInfo = await this.getLocationInfo(session.ipAddress);
          const lastActivity = await this.getLastActivity(session.sessionToken);
          const isSuspicious = await this.checkSuspiciousActivity(session);

          return {
            id: session.id,
            sessionToken: this.maskSessionToken(session.sessionToken),
            userId: session.userId,
            ipAddress: session.ipAddress,
            userAgent: session.userAgent,
            deviceInfo,
            locationInfo,
            createdAt: session.createdAt,
            expiresAt: session.expiresAt,
            lastActivity,
            isCurrent: session.sessionToken === currentSessionId,
            isSuspicious: isSuspicious.isSuspicious,
            suspiciousReasons: isSuspicious.reasons,
          };
        })
      );

      const activeCount = sessionInfos.filter(s => s.expiresAt > new Date()).length;
      const suspiciousCount = sessionInfos.filter(s => s.isSuspicious).length;

      return {
        sessions: sessionInfos,
        total: sessionInfos.length,
        activeCount,
        suspiciousCount,
      };
    } catch (error) {
      console.error('Error getting user sessions:', error);
      throw new Error('Failed to retrieve user sessions');
    }
  }

  /**
   * Terminate a specific session
   */
  async terminateSession(
    userId: string, 
    sessionId: string, 
    reason?: string,
    terminatedBy?: string
  ): Promise<TerminateSessionResponse> {
    try {
      // Find the session
      const session = await this.prisma.session.findFirst({
        where: {
          id: sessionId,
          userId,
        },
      });

      if (!session) {
        throw new NotFoundException('Session not found');
      }

      // Remove session from database
      await this.prisma.session.delete({
        where: { id: sessionId },
      });

      // Remove session from Redis
      await this.redisService.deleteSession(session.sessionToken);

      // Add token to blacklist
      await this.blacklistToken(session.sessionToken);

      // Clear user-specific Redis data for this session
      await this.clearSessionRedisData(userId, session.sessionToken);

      // Log session termination activity
      await this.logSessionActivity(sessionId, 'session_terminated', {
        reason: reason || 'Manual termination',
        terminatedBy,
        ipAddress: session.ipAddress,
        userAgent: session.userAgent,
      });

      // Broadcast session termination event
      await this.realtimeNotificationService.broadcastSessionUpdate({
        userId,
        sessionId: session.sessionToken,
        action: 'terminated',
        reason: reason || 'Session terminated',
        timestamp: new Date(),
        organizationId: await this.getUserOrganizationId(userId),
      });

      // Disconnect WebSocket connections for this session
      await this.websocketGateway.disconnectUser(userId, reason || 'Session terminated');

      return {
        message: 'Session terminated successfully',
        sessionId,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      console.error('Error terminating session:', error);
      if (error instanceof NotFoundException) {
        throw error;
      }
      throw new Error('Failed to terminate session');
    }
  }

  /**
   * Get session statistics for a user
   */
  async getSessionStats(userId: string): Promise<SessionStatsDto> {
    try {
      const sessions = await this.prisma.session.findMany({
        where: { userId },
      });

      const now = new Date();
      const activeSessions = sessions.filter(s => s.expiresAt > now);
      const expiredSessions = sessions.filter(s => s.expiresAt <= now);

      // Device breakdown
      const deviceBreakdown = {
        desktop: 0,
        mobile: 0,
        tablet: 0,
        unknown: 0,
      };

      const locationBreakdown: Record<string, number> = {};
      let suspiciousCount = 0;

      for (const session of sessions) {
        // Device analysis
        const deviceInfo = this.parseUserAgent(session.userAgent);
        if (deviceInfo.isMobile) {
          deviceBreakdown.mobile++;
        } else if (deviceInfo.device?.toLowerCase().includes('tablet')) {
          deviceBreakdown.tablet++;
        } else if (deviceInfo.device) {
          deviceBreakdown.desktop++;
        } else {
          deviceBreakdown.unknown++;
        }

        // Location analysis
        const locationInfo = await this.getLocationInfo(session.ipAddress);
        const locationKey = locationInfo.country || 'Unknown';
        locationBreakdown[locationKey] = (locationBreakdown[locationKey] || 0) + 1;

        // Suspicious activity check
        const suspiciousCheck = await this.checkSuspiciousActivity(session);
        if (suspiciousCheck.isSuspicious) {
          suspiciousCount++;
        }
      }

      // Recent activity count (last 24 hours)
      const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const recentActivityCount = await this.getRecentActivityCount(userId, yesterday);

      return {
        totalSessions: sessions.length,
        activeSessions: activeSessions.length,
        expiredSessions: expiredSessions.length,
        suspiciousSessions: suspiciousCount,
        deviceBreakdown,
        locationBreakdown,
        recentActivityCount,
      };
    } catch (error) {
      console.error('Error getting session stats:', error);
      throw new Error('Failed to retrieve session statistics');
    }
  }

  /**
   * Get session activity history
   */
  async getSessionActivity(userId: string, sessionId?: string): Promise<SessionActivityDto[]> {
    try {
      // For now, we'll get activities from Redis or create a simple activity log
      // In a production system, you'd want a dedicated activity log table
      const activities: SessionActivityDto[] = [];

      if (sessionId) {
        // Get activities for specific session
        const sessionActivities = await this.redisService.get(`session_activity:${sessionId}`);
        if (sessionActivities) {
          activities.push(...JSON.parse(sessionActivities));
        }
      } else {
        // Get all activities for user
        const userSessions = await this.prisma.session.findMany({
          where: { userId },
          select: { sessionToken: true },
        });

        for (const session of userSessions) {
          const sessionActivities = await this.redisService.get(`session_activity:${session.sessionToken}`);
          if (sessionActivities) {
            activities.push(...JSON.parse(sessionActivities));
          }
        }
      }

      return activities.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    } catch (error) {
      console.error('Error getting session activity:', error);
      throw new Error('Failed to retrieve session activity');
    }
  }

  /**
   * Check for suspicious session activity
   */
  private async checkSuspiciousActivity(session: any): Promise<{ isSuspicious: boolean; reasons: string[] }> {
    const reasons: string[] = [];
    let isSuspicious = false;

    try {
      // Check for unusual location
      const locationInfo = await this.getLocationInfo(session.ipAddress);
      const userLocations = await this.getUserTypicalLocations(session.userId);
      
      if (locationInfo.country && !userLocations.includes(locationInfo.country)) {
        reasons.push('Unusual location detected');
        isSuspicious = true;
      }

      // Check for unusual device
      const deviceInfo = this.parseUserAgent(session.userAgent);
      const userDevices = await this.getUserTypicalDevices(session.userId);
      
      const deviceSignature = `${deviceInfo.browser}-${deviceInfo.os}`;
      if (!userDevices.includes(deviceSignature)) {
        reasons.push('New device detected');
        // Note: New device alone might not be suspicious, but combined with other factors it could be
      }

      // Check session timing (e.g., login at unusual hours)
      const loginHour = session.createdAt.getHours();
      const userTypicalHours = await this.getUserTypicalLoginHours(session.userId);
      
      if (!userTypicalHours.includes(loginHour)) {
        reasons.push('Login at unusual time');
        // This alone might not be suspicious, but adds to the score
      }

      // Check for concurrent sessions from different locations
      const concurrentSessions = await this.getConcurrentSessions(session.userId, session.createdAt);
      const locations = await Promise.all(
        concurrentSessions.map(s => this.getLocationInfo(s.ipAddress))
      );
      
      const uniqueCountries = new Set(locations.map(l => l.country).filter(Boolean));
      if (uniqueCountries.size > 1) {
        reasons.push('Concurrent sessions from different countries');
        isSuspicious = true;
      }

      // Check for rapid session creation
      const recentSessions = await this.getRecentSessions(session.userId, session.createdAt, 5); // 5 minutes
      if (recentSessions.length > 3) {
        reasons.push('Multiple rapid login attempts');
        isSuspicious = true;
      }

    } catch (error) {
      console.error('Error checking suspicious activity:', error);
      // Don't fail the whole operation if suspicious activity check fails
    }

    return { isSuspicious, reasons };
  }

  /**
   * Parse user agent string to extract device information
   */
  private parseUserAgent(userAgent?: string): SessionInfoDto['deviceInfo'] {
    if (!userAgent) {
      return {
        browser: 'Unknown',
        os: 'Unknown',
        device: 'Unknown',
        isMobile: false,
      };
    }

    const parser = new UAParser(userAgent);
    const result = parser.getResult();

    return {
      browser: result.browser.name || 'Unknown',
      os: result.os.name || 'Unknown',
      device: result.device.model || result.device.type || 'Desktop',
      isMobile: result.device.type === 'mobile' || result.device.type === 'tablet',
    };
  }

  /**
   * Get location information from IP address
   */
  private async getLocationInfo(ipAddress?: string): Promise<SessionInfoDto['locationInfo']> {
    if (!ipAddress || ipAddress === '127.0.0.1' || ipAddress === '::1') {
      return {
        country: 'Local',
        city: 'Local',
        region: 'Local',
        timezone: 'UTC',
      };
    }

    try {
      // In a production system, you'd use a geolocation service like MaxMind or ipapi
      // For now, we'll return mock data based on IP patterns
      if (ipAddress.startsWith('192.168.') || ipAddress.startsWith('10.') || ipAddress.startsWith('172.')) {
        return {
          country: 'Local Network',
          city: 'Local',
          region: 'Local',
          timezone: 'UTC',
        };
      }

      // Mock geolocation data - in production, integrate with a real service
      return {
        country: 'Morocco',
        city: 'Casablanca',
        region: 'Casablanca-Settat',
        timezone: 'Africa/Casablanca',
      };
    } catch (error) {
      console.error('Error getting location info:', error);
      return {
        country: 'Unknown',
        city: 'Unknown',
        region: 'Unknown',
        timezone: 'UTC',
      };
    }
  }

  /**
   * Mask session token for security
   */
  private maskSessionToken(token: string): string {
    if (token.length <= 8) return '***';
    return token.substring(0, 4) + '***' + token.substring(token.length - 4);
  }

  /**
   * Get current session ID from Redis
   */
  private async getCurrentSessionId(userId: string): Promise<string | null> {
    try {
      return await this.redisService.get(`current_session:${userId}`);
    } catch (error) {
      console.error('Error getting current session ID:', error);
      return null;
    }
  }

  /**
   * Get last activity timestamp for a session
   */
  private async getLastActivity(sessionToken: string): Promise<Date | undefined> {
    try {
      const lastActivity = await this.redisService.get(`session_activity:${sessionToken}:last`);
      return lastActivity ? new Date(lastActivity) : undefined;
    } catch (error) {
      console.error('Error getting last activity:', error);
      return undefined;
    }
  }

  /**
   * Log session activity
   */
  private async logSessionActivity(sessionId: string, type: string, metadata: any): Promise<void> {
    try {
      const activity: SessionActivityDto = {
        id: `activity_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        sessionId,
        type,
        description: this.getActivityDescription(type, metadata),
        ipAddress: metadata.ipAddress,
        userAgent: metadata.userAgent,
        timestamp: new Date(),
        metadata,
      };

      // Store in Redis with TTL (30 days)
      const existingActivities = await this.redisService.get(`session_activity:${sessionId}`);
      const activities = existingActivities ? JSON.parse(existingActivities) : [];
      activities.push(activity);

      // Keep only last 100 activities per session
      if (activities.length > 100) {
        activities.splice(0, activities.length - 100);
      }

      await this.redisService.set(`session_activity:${sessionId}`, JSON.stringify(activities), 30 * 24 * 60 * 60);
    } catch (error) {
      console.error('Error logging session activity:', error);
    }
  }

  /**
   * Get activity description based on type
   */
  private getActivityDescription(type: string, metadata: any): string {
    switch (type) {
      case 'session_created':
        return 'Session created';
      case 'session_terminated':
        return `Session terminated: ${metadata.reason}`;
      case 'login_attempt':
        return 'Login attempt';
      case 'token_refresh':
        return 'Token refreshed';
      case 'suspicious_activity':
        return `Suspicious activity detected: ${metadata.reason}`;
      default:
        return `Activity: ${type}`;
    }
  }

  /**
   * Helper methods for suspicious activity detection
   */
  private async getUserTypicalLocations(userId: string): Promise<string[]> {
    try {
      const sessions = await this.prisma.session.findMany({
        where: { userId },
        select: { ipAddress: true },
        take: 50, // Last 50 sessions
        orderBy: { createdAt: 'desc' },
      });

      const locations = await Promise.all(
        sessions.map(s => this.getLocationInfo(s.ipAddress))
      );

      return [...new Set(locations.map(l => l.country).filter(Boolean))];
    } catch (error) {
      console.error('Error getting user typical locations:', error);
      return [];
    }
  }

  private async getUserTypicalDevices(userId: string): Promise<string[]> {
    try {
      const sessions = await this.prisma.session.findMany({
        where: { userId },
        select: { userAgent: true },
        take: 20, // Last 20 sessions
        orderBy: { createdAt: 'desc' },
      });

      const devices = sessions.map(s => {
        const deviceInfo = this.parseUserAgent(s.userAgent);
        return `${deviceInfo.browser}-${deviceInfo.os}`;
      });

      return [...new Set(devices)];
    } catch (error) {
      console.error('Error getting user typical devices:', error);
      return [];
    }
  }

  private async getUserTypicalLoginHours(userId: string): Promise<number[]> {
    try {
      const sessions = await this.prisma.session.findMany({
        where: { userId },
        select: { createdAt: true },
        take: 30, // Last 30 sessions
        orderBy: { createdAt: 'desc' },
      });

      const hours = sessions.map(s => s.createdAt.getHours());
      return [...new Set(hours)];
    } catch (error) {
      console.error('Error getting user typical login hours:', error);
      return [];
    }
  }

  private async getConcurrentSessions(userId: string, timestamp: Date): Promise<any[]> {
    const timeWindow = 10 * 60 * 1000; // 10 minutes
    const startTime = new Date(timestamp.getTime() - timeWindow);
    const endTime = new Date(timestamp.getTime() + timeWindow);

    return this.prisma.session.findMany({
      where: {
        userId,
        createdAt: {
          gte: startTime,
          lte: endTime,
        },
      },
    });
  }

  private async getRecentSessions(userId: string, timestamp: Date, minutesBack: number): Promise<any[]> {
    const startTime = new Date(timestamp.getTime() - minutesBack * 60 * 1000);

    return this.prisma.session.findMany({
      where: {
        userId,
        createdAt: {
          gte: startTime,
          lte: timestamp,
        },
      },
    });
  }

  private async getRecentActivityCount(userId: string, since: Date): Promise<number> {
    try {
      // This would typically query an activity log table
      // For now, we'll estimate based on session creation
      const recentSessions = await this.prisma.session.count({
        where: {
          userId,
          createdAt: { gte: since },
        },
      });

      return recentSessions;
    } catch (error) {
      console.error('Error getting recent activity count:', error);
      return 0;
    }
  }

  private async blacklistToken(token: string): Promise<void> {
    try {
      await this.redisService.set(`blacklist:${token}`, true, 3600); // 1 hour TTL
    } catch (error) {
      console.error('Error blacklisting token:', error);
    }
  }

  private async clearSessionRedisData(userId: string, sessionToken: string): Promise<void> {
    try {
      await this.redisService.del(`session_activity:${sessionToken}`);
      await this.redisService.del(`session_activity:${sessionToken}:last`);
    } catch (error) {
      console.error('Error clearing session Redis data:', error);
    }
  }

  private async getUserOrganizationId(userId: string): Promise<string> {
    try {
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { organizationId: true },
      });
      return user?.organizationId || '';
    } catch (error) {
      console.error('Error getting user organization ID:', error);
      return '';
    }
  }
}