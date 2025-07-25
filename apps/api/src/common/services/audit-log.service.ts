import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { RedisService } from '../redis/redis.service';
import { Request } from 'express';

export interface AuditLogEntry {
  userId?: string;
  organizationId?: string;
  action: string;
  entityType: string;
  entityId: string;
  previousValue?: any;
  newValue?: any;
  ipAddress?: string;
  userAgent?: string;
  metadata?: any;
}

export interface AuditLogFilter {
  userId?: string;
  organizationId?: string;
  action?: string;
  entityType?: string;
  entityId?: string;
  startDate?: Date;
  endDate?: Date;
  ipAddress?: string;
}

export interface AuditLogQuery {
  filters?: AuditLogFilter;
  page?: number;
  limit?: number;
  sortBy?: 'createdAt' | 'action' | 'entityType';
  sortOrder?: 'asc' | 'desc';
}

export interface AuditLogResult {
  logs: any[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

@Injectable()
export class AuditLogService {
  private readonly logger = new Logger(AuditLogService.name);
  private readonly CACHE_TTL = 300; // 5 minutes
  private readonly CACHE_PREFIX = 'audit_log:';

  // Authentication-related actions
  static readonly ACTIONS = {
    // Authentication
    LOGIN_ATTEMPT: 'LOGIN_ATTEMPT',
    LOGIN_SUCCESS: 'LOGIN_SUCCESS',
    LOGIN_FAILED: 'LOGIN_FAILED',
    LOGOUT: 'LOGOUT',
    LOGOUT_ALL: 'LOGOUT_ALL',
    SESSION_CREATED: 'SESSION_CREATED',
    SESSION_EXPIRED: 'SESSION_EXPIRED',
    SESSION_TERMINATED: 'SESSION_TERMINATED',
    
    // User Management
    USER_CREATED: 'USER_CREATED',
    USER_UPDATED: 'USER_UPDATED',
    USER_DELETED: 'USER_DELETED',
    USER_SUSPENDED: 'USER_SUSPENDED',
    USER_ACTIVATED: 'USER_ACTIVATED',
    USER_PASSWORD_CHANGED: 'USER_PASSWORD_CHANGED',
    USER_PASSWORD_RESET_REQUESTED: 'USER_PASSWORD_RESET_REQUESTED',
    USER_PASSWORD_RESET_COMPLETED: 'USER_PASSWORD_RESET_COMPLETED',
    
    // Role and Permission Management
    ROLE_ASSIGNED: 'ROLE_ASSIGNED',
    ROLE_REMOVED: 'ROLE_REMOVED',
    PERMISSION_GRANTED: 'PERMISSION_GRANTED',
    PERMISSION_REVOKED: 'PERMISSION_REVOKED',
    
    // Organization Management
    ORGANIZATION_CREATED: 'ORGANIZATION_CREATED',
    ORGANIZATION_UPDATED: 'ORGANIZATION_UPDATED',
    ORGANIZATION_DELETED: 'ORGANIZATION_DELETED',
    
    // Team Management
    TEAM_CREATED: 'TEAM_CREATED',
    TEAM_UPDATED: 'TEAM_UPDATED',
    TEAM_DELETED: 'TEAM_DELETED',
    TEAM_MEMBER_ASSIGNED: 'TEAM_MEMBER_ASSIGNED',
    TEAM_MEMBER_REMOVED: 'TEAM_MEMBER_REMOVED',
    TEAM_STORE_ASSIGNED: 'TEAM_STORE_ASSIGNED',
    TEAM_STORE_REMOVED: 'TEAM_STORE_REMOVED',
    
    // Security Events
    ACCOUNT_LOCKED: 'ACCOUNT_LOCKED',
    ACCOUNT_UNLOCKED: 'ACCOUNT_UNLOCKED',
    SUSPICIOUS_ACTIVITY: 'SUSPICIOUS_ACTIVITY',
    SECURITY_ALERT: 'SECURITY_ALERT',
    BRUTE_FORCE_DETECTED: 'BRUTE_FORCE_DETECTED',
    
    // Platform Connections
    PLATFORM_CONNECTED: 'PLATFORM_CONNECTED',
    PLATFORM_DISCONNECTED: 'PLATFORM_DISCONNECTED',
    PLATFORM_TOKEN_REFRESHED: 'PLATFORM_TOKEN_REFRESHED',
    
    // System Events
    SYSTEM_MAINTENANCE: 'SYSTEM_MAINTENANCE',
    SYSTEM_ERROR: 'SYSTEM_ERROR',
    CONFIGURATION_CHANGED: 'CONFIGURATION_CHANGED',
  } as const;

  // Entity types
  static readonly ENTITY_TYPES = {
    USER: 'User',
    ORGANIZATION: 'Organization',
    TEAM: 'Team',
    TEAM_MEMBER: 'TeamMember',
    TEAM_STORE: 'TeamStore',
    SESSION: 'Session',
    PLATFORM_CONNECTION: 'PlatformConnection',
    SYSTEM: 'System',
  } as const;

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  /**
   * Create an audit log entry
   */
  async log(entry: AuditLogEntry): Promise<void> {
    try {
      await this.prisma.auditLog.create({
        data: {
          userId: entry.userId,
          organizationId: entry.organizationId,
          action: entry.action,
          entityType: entry.entityType,
          entityId: entry.entityId,
          previousValue: entry.previousValue,
          newValue: entry.newValue,
          ipAddress: entry.ipAddress,
          userAgent: entry.userAgent,
          createdAt: new Date(),
        },
      });

      this.logger.log(`Audit log created: ${entry.action} on ${entry.entityType}:${entry.entityId}`);
    } catch (error) {
      this.logger.error(`Failed to create audit log entry:`, error);
      // Don't throw error to avoid breaking the main operation
    }
  }

  /**
   * Create audit log from Express request
   */
  async logFromRequest(
    request: Request,
    action: string,
    entityType: string,
    entityId: string,
    previousValue?: any,
    newValue?: any,
    metadata?: any,
  ): Promise<void> {
    const user = (request as any).user;
    const ipAddress = this.extractIpAddress(request);
    const userAgent = request.headers['user-agent'];

    await this.log({
      userId: user?.id,
      organizationId: user?.organizationId,
      action,
      entityType,
      entityId,
      previousValue,
      newValue,
      ipAddress,
      userAgent,
      metadata,
    });
  }

  /**
   * Log authentication events
   */
  async logAuthEvent(
    action: string,
    userId: string,
    organizationId?: string,
    ipAddress?: string,
    userAgent?: string,
    metadata?: any,
  ): Promise<void> {
    await this.log({
      userId,
      organizationId,
      action,
      entityType: AuditLogService.ENTITY_TYPES.USER,
      entityId: userId,
      newValue: metadata,
      ipAddress,
      userAgent,
    });
  }

  /**
   * Log user management events
   */
  async logUserEvent(
    action: string,
    userId: string,
    organizationId: string,
    performedBy?: string,
    previousValue?: any,
    newValue?: any,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<void> {
    await this.log({
      userId: performedBy || userId,
      organizationId,
      action,
      entityType: AuditLogService.ENTITY_TYPES.USER,
      entityId: userId,
      previousValue,
      newValue,
      ipAddress,
      userAgent,
    });
  }

  /**
   * Log organization events
   */
  async logOrganizationEvent(
    action: string,
    organizationId: string,
    performedBy?: string,
    previousValue?: any,
    newValue?: any,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<void> {
    await this.log({
      userId: performedBy,
      organizationId,
      action,
      entityType: AuditLogService.ENTITY_TYPES.ORGANIZATION,
      entityId: organizationId,
      previousValue,
      newValue,
      ipAddress,
      userAgent,
    });
  }

  /**
   * Log team management events
   */
  async logTeamEvent(
    action: string,
    teamId: string,
    organizationId: string,
    performedBy: string,
    previousValue?: any,
    newValue?: any,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<void> {
    await this.log({
      userId: performedBy,
      organizationId,
      action,
      entityType: AuditLogService.ENTITY_TYPES.TEAM,
      entityId: teamId,
      previousValue,
      newValue,
      ipAddress,
      userAgent,
    });
  }

  /**
   * Log security events
   */
  async logSecurityEvent(
    action: string,
    userId?: string,
    organizationId?: string,
    details?: any,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<void> {
    await this.log({
      userId,
      organizationId,
      action,
      entityType: AuditLogService.ENTITY_TYPES.SYSTEM,
      entityId: userId || 'system',
      newValue: details,
      ipAddress,
      userAgent,
    });
  }

  /**
   * Query audit logs with filtering and pagination
   */
  async queryLogs(query: AuditLogQuery): Promise<AuditLogResult> {
    const {
      filters = {},
      page = 1,
      limit = 50,
      sortBy = 'createdAt',
      sortOrder = 'desc',
    } = query;

    // Build cache key
    const cacheKey = `${this.CACHE_PREFIX}query:${JSON.stringify(query)}`;
    
    // Check cache first
    const cached = await this.redis.get(cacheKey);
    if (cached) {
      return cached;
    }

    // Build where clause
    const where: any = {};
    
    if (filters.userId) where.userId = filters.userId;
    if (filters.organizationId) where.organizationId = filters.organizationId;
    if (filters.action) where.action = filters.action;
    if (filters.entityType) where.entityType = filters.entityType;
    if (filters.entityId) where.entityId = filters.entityId;
    if (filters.ipAddress) where.ipAddress = filters.ipAddress;
    
    if (filters.startDate || filters.endDate) {
      where.createdAt = {};
      if (filters.startDate) where.createdAt.gte = filters.startDate;
      if (filters.endDate) where.createdAt.lte = filters.endDate;
    }

    // Calculate pagination
    const skip = (page - 1) * limit;

    // Execute queries
    const [logs, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        skip,
        take: limit,
        orderBy: { [sortBy]: sortOrder },
        // Note: User relation would need to be added to schema if needed
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    const result: AuditLogResult = {
      logs,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };

    // Cache the result
    await this.redis.set(cacheKey, result, this.CACHE_TTL);

    return result;
  }

  /**
   * Get audit logs for a specific user
   */
  async getUserAuditLogs(
    userId: string,
    organizationId?: string,
    page: number = 1,
    limit: number = 50,
  ): Promise<AuditLogResult> {
    return this.queryLogs({
      filters: { userId, organizationId },
      page,
      limit,
    });
  }

  /**
   * Get audit logs for a specific organization
   */
  async getOrganizationAuditLogs(
    organizationId: string,
    page: number = 1,
    limit: number = 50,
  ): Promise<AuditLogResult> {
    return this.queryLogs({
      filters: { organizationId },
      page,
      limit,
    });
  }

  /**
   * Get security-related audit logs
   */
  async getSecurityAuditLogs(
    organizationId?: string,
    page: number = 1,
    limit: number = 50,
  ): Promise<AuditLogResult> {
    const securityActions = [
      AuditLogService.ACTIONS.LOGIN_FAILED,
      AuditLogService.ACTIONS.ACCOUNT_LOCKED,
      AuditLogService.ACTIONS.ACCOUNT_UNLOCKED,
      AuditLogService.ACTIONS.SUSPICIOUS_ACTIVITY,
      AuditLogService.ACTIONS.SECURITY_ALERT,
      AuditLogService.ACTIONS.BRUTE_FORCE_DETECTED,
    ];

    const where: any = {
      action: { in: securityActions },
    };

    if (organizationId) {
      where.organizationId = organizationId;
    }

    const skip = (page - 1) * limit;

    const [logs, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    return {
      logs,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * Get audit log statistics
   */
  async getAuditLogStats(
    organizationId?: string,
    startDate?: Date,
    endDate?: Date,
  ): Promise<{
    totalLogs: number;
    actionCounts: Record<string, number>;
    entityTypeCounts: Record<string, number>;
    dailyCounts: Array<{ date: string; count: number }>;
  }> {
    const cacheKey = `${this.CACHE_PREFIX}stats:${organizationId}:${startDate?.toISOString()}:${endDate?.toISOString()}`;
    
    const cached = await this.redis.get(cacheKey);
    if (cached) {
      return cached;
    }

    const where: any = {};
    if (organizationId) where.organizationId = organizationId;
    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = startDate;
      if (endDate) where.createdAt.lte = endDate;
    }

    // Get total count
    const totalLogs = await this.prisma.auditLog.count({ where });

    // Get action counts
    const actionCounts = await this.prisma.auditLog.groupBy({
      by: ['action'],
      where,
      _count: { action: true },
    });

    // Get entity type counts
    const entityTypeCounts = await this.prisma.auditLog.groupBy({
      by: ['entityType'],
      where,
      _count: { entityType: true },
    });

    // Get daily counts for the last 30 days
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const dailyCountsRaw = await this.prisma.$queryRaw`
      SELECT DATE(createdAt) as date, COUNT(*) as count
      FROM AuditLog
      WHERE createdAt >= ${thirtyDaysAgo}
      ${organizationId ? `AND organizationId = ${organizationId}` : ''}
      GROUP BY DATE(createdAt)
      ORDER BY date DESC
    ` as Array<{ date: Date; count: bigint }>;

    const dailyCounts = dailyCountsRaw.map(item => ({
      date: item.date.toISOString().split('T')[0],
      count: Number(item.count),
    }));

    const result = {
      totalLogs,
      actionCounts: actionCounts.reduce((acc, item) => {
        acc[item.action] = item._count.action;
        return acc;
      }, {} as Record<string, number>),
      entityTypeCounts: entityTypeCounts.reduce((acc, item) => {
        acc[item.entityType] = item._count.entityType;
        return acc;
      }, {} as Record<string, number>),
      dailyCounts,
    };

    // Cache for 10 minutes
    await this.redis.set(cacheKey, result, 600);

    return result;
  }

  /**
   * Clean up old audit logs
   */
  async cleanupOldLogs(retentionDays: number = 365): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

    const result = await this.prisma.auditLog.deleteMany({
      where: {
        createdAt: {
          lt: cutoffDate,
        },
      },
    });

    this.logger.log(`Cleaned up ${result.count} audit log entries older than ${retentionDays} days`);
    return result.count;
  }

  /**
   * Export audit logs to CSV
   */
  async exportToCsv(
    filters: AuditLogFilter = {},
    limit: number = 10000,
  ): Promise<string> {
    const logs = await this.prisma.auditLog.findMany({
      where: this.buildWhereClause(filters),
      take: limit,
      orderBy: { createdAt: 'desc' },
    });

    const headers = [
      'ID',
      'User ID',
      'Organization ID',
      'Action',
      'Entity Type',
      'Entity ID',
      'IP Address',
      'User Agent',
      'Created At',
    ];

    const csvRows = [
      headers.join(','),
      ...logs.map(log => [
        log.id,
        log.userId || '',
        log.organizationId || '',
        log.action,
        log.entityType,
        log.entityId,
        log.ipAddress || '',
        log.userAgent || '',
        log.createdAt.toISOString(),
      ].map(field => `"${field}"`).join(',')),
    ];

    return csvRows.join('\n');
  }

  // Private helper methods

  private extractIpAddress(request: Request): string {
    return (
      (request.headers['x-forwarded-for'] as string)?.split(',')[0] ||
      (request.headers['x-real-ip'] as string) ||
      request.connection.remoteAddress ||
      request.socket.remoteAddress ||
      'unknown'
    );
  }

  private buildWhereClause(filters: AuditLogFilter): any {
    const where: any = {};
    
    if (filters.userId) where.userId = filters.userId;
    if (filters.organizationId) where.organizationId = filters.organizationId;
    if (filters.action) where.action = filters.action;
    if (filters.entityType) where.entityType = filters.entityType;
    if (filters.entityId) where.entityId = filters.entityId;
    if (filters.ipAddress) where.ipAddress = filters.ipAddress;
    
    if (filters.startDate || filters.endDate) {
      where.createdAt = {};
      if (filters.startDate) where.createdAt.gte = filters.startDate;
      if (filters.endDate) where.createdAt.lte = filters.endDate;
    }

    return where;
  }
}