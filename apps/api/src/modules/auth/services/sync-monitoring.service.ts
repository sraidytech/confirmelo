import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../../common/database/prisma.service';
import { SyncStatusService } from './sync-status.service';

export interface SyncAlert {
  type: 'stuck_operation' | 'high_error_rate' | 'performance_degradation' | 'webhook_failure';
  severity: 'low' | 'medium' | 'high' | 'critical';
  connectionId: string;
  spreadsheetId?: string;
  message: string;
  details: Record<string, any>;
  timestamp: Date;
}

export interface SyncMonitoringConfig {
  stuckOperationThresholdMinutes: number;
  errorRateThreshold: number;
  performanceDegradationThreshold: number;
  webhookFailureThreshold: number;
  alertingEnabled: boolean;
}

@Injectable()
export class SyncMonitoringService {
  private readonly logger = new Logger(SyncMonitoringService.name);
  
  private readonly config: SyncMonitoringConfig = {
    stuckOperationThresholdMinutes: 30,
    errorRateThreshold: 20, // 20% error rate
    performanceDegradationThreshold: 50, // 50% slower than average
    webhookFailureThreshold: 3, // 3 consecutive webhook failures
    alertingEnabled: true,
  };

  constructor(
    private readonly prismaService: PrismaService,
    private readonly syncStatusService: SyncStatusService,
  ) {}

  /**
   * Monitor sync operations every 5 minutes
   */
  @Cron(CronExpression.EVERY_5_MINUTES)
  async monitorSyncOperations(): Promise<void> {
    if (!this.config.alertingEnabled) {
      return;
    }

    this.logger.log('Starting sync operations monitoring');

    try {
      await Promise.all([
        this.checkStuckOperations(),
        this.checkErrorRates(),
        this.checkPerformanceDegradation(),
        this.checkWebhookFailures(),
      ]);

      this.logger.log('Sync operations monitoring completed');
    } catch (error) {
      this.logger.error('Error during sync operations monitoring', error);
    }
  }

  /**
   * Clean up old sync operations every day at 2 AM
   */
  @Cron(CronExpression.EVERY_DAY_AT_2AM)
  async cleanupOldOperations(): Promise<void> {
    this.logger.log('Starting cleanup of old sync operations');

    try {
      const deletedCount = await this.syncStatusService.cleanupOldOperations(30, 100);
      this.logger.log(`Cleaned up ${deletedCount} old sync operations`);
    } catch (error) {
      this.logger.error('Error during sync operations cleanup', error);
    }
  }

  /**
   * Generate daily sync report every day at 8 AM
   */
  @Cron(CronExpression.EVERY_DAY_AT_8AM)
  async generateDailySyncReport(): Promise<void> {
    this.logger.log('Generating daily sync report');

    try {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      yesterday.setHours(0, 0, 0, 0);

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      // Get all active connections
      const connections = await this.prismaService.platformConnection.findMany({
        where: {
          status: 'ACTIVE',
          platformType: 'GOOGLE_SHEETS',
        },
        select: {
          id: true,
          platformName: true,
          user: {
            select: {
              email: true,
              firstName: true,
              lastName: true,
              organization: {
                select: {
                  name: true,
                },
              },
            },
          },
        },
      });

      for (const connection of connections) {
        await this.generateConnectionReport(connection.id, yesterday, today);
      }

      this.logger.log('Daily sync report generation completed');
    } catch (error) {
      this.logger.error('Error generating daily sync report', error);
    }
  }

  /**
   * Check for stuck sync operations
   */
  private async checkStuckOperations(): Promise<void> {
    const thresholdTime = new Date();
    thresholdTime.setMinutes(thresholdTime.getMinutes() - this.config.stuckOperationThresholdMinutes);

    const stuckOperations = await this.prismaService.syncOperation.findMany({
      where: {
        status: { in: ['pending', 'processing'] },
        startedAt: { lt: thresholdTime },
      },
      include: {
        connection: {
          select: {
            id: true,
            platformName: true,
            user: {
              select: {
                email: true,
                firstName: true,
                lastName: true,
              },
            },
          },
        },
      },
    });

    for (const operation of stuckOperations) {
      const alert: SyncAlert = {
        type: 'stuck_operation',
        severity: 'high',
        connectionId: operation.connectionId,
        spreadsheetId: operation.spreadsheetId,
        message: `Sync operation has been ${operation.status} for over ${this.config.stuckOperationThresholdMinutes} minutes`,
        details: {
          operationId: operation.id,
          operationType: operation.operationType,
          startedAt: operation.startedAt,
          duration: Date.now() - operation.startedAt.getTime(),
        },
        timestamp: new Date(),
      };

      await this.handleAlert(alert);
    }
  }

  /**
   * Check for high error rates
   */
  private async checkErrorRates(): Promise<void> {
    const last24Hours = new Date();
    last24Hours.setHours(last24Hours.getHours() - 24);

    // Get connections with recent activity
    const connections = await this.prismaService.syncOperation.groupBy({
      by: ['connectionId'],
      where: {
        startedAt: { gte: last24Hours },
      },
      _count: { id: true },
      having: {
        id: { _count: { gte: 5 } }, // At least 5 operations
      },
    });

    for (const connection of connections) {
      const operations = await this.prismaService.syncOperation.findMany({
        where: {
          connectionId: connection.connectionId,
          startedAt: { gte: last24Hours },
        },
        select: {
          status: true,
          errorCount: true,
          ordersProcessed: true,
        },
      });

      const totalOperations = operations.length;
      const failedOperations = operations.filter(op => op.status === 'failed').length;
      const errorRate = (failedOperations / totalOperations) * 100;

      if (errorRate > this.config.errorRateThreshold) {
        const totalOrders = operations.reduce((sum, op) => sum + op.ordersProcessed, 0);
        const totalErrors = operations.reduce((sum, op) => sum + op.errorCount, 0);

        const alert: SyncAlert = {
          type: 'high_error_rate',
          severity: errorRate > 50 ? 'critical' : 'high',
          connectionId: connection.connectionId,
          message: `High error rate detected: ${errorRate.toFixed(1)}% of sync operations failed in the last 24 hours`,
          details: {
            errorRate,
            failedOperations,
            totalOperations,
            totalOrders,
            totalErrors,
            threshold: this.config.errorRateThreshold,
          },
          timestamp: new Date(),
        };

        await this.handleAlert(alert);
      }
    }
  }

  /**
   * Check for performance degradation
   */
  private async checkPerformanceDegradation(): Promise<void> {
    const last24Hours = new Date();
    last24Hours.setHours(last24Hours.getHours() - 24);

    const last7Days = new Date();
    last7Days.setDate(last7Days.getDate() - 7);

    // Get connections with recent activity
    const connections = await this.prismaService.syncOperation.groupBy({
      by: ['connectionId'],
      where: {
        startedAt: { gte: last7Days },
        status: 'completed',
        completedAt: { not: null },
      },
      _count: { id: true },
      having: {
        id: { _count: { gte: 10 } }, // At least 10 completed operations
      },
    });

    for (const connection of connections) {
      // Get recent operations (last 24 hours)
      const recentOps = await this.prismaService.syncOperation.findMany({
        where: {
          connectionId: connection.connectionId,
          startedAt: { gte: last24Hours },
          status: 'completed',
          completedAt: { not: null },
        },
        select: {
          startedAt: true,
          completedAt: true,
        },
      });

      // Get baseline operations (last 7 days, excluding last 24 hours)
      const baselineOps = await this.prismaService.syncOperation.findMany({
        where: {
          connectionId: connection.connectionId,
          startedAt: { 
            gte: last7Days,
            lt: last24Hours,
          },
          status: 'completed',
          completedAt: { not: null },
        },
        select: {
          startedAt: true,
          completedAt: true,
        },
      });

      if (recentOps.length < 3 || baselineOps.length < 5) {
        continue; // Not enough data
      }

      const recentAvgDuration = this.calculateAverageDuration(recentOps);
      const baselineAvgDuration = this.calculateAverageDuration(baselineOps);

      const performanceChange = ((recentAvgDuration - baselineAvgDuration) / baselineAvgDuration) * 100;

      if (performanceChange > this.config.performanceDegradationThreshold) {
        const alert: SyncAlert = {
          type: 'performance_degradation',
          severity: performanceChange > 100 ? 'high' : 'medium',
          connectionId: connection.connectionId,
          message: `Performance degradation detected: sync operations are ${performanceChange.toFixed(1)}% slower than baseline`,
          details: {
            performanceChange,
            recentAvgDuration,
            baselineAvgDuration,
            recentOperations: recentOps.length,
            baselineOperations: baselineOps.length,
            threshold: this.config.performanceDegradationThreshold,
          },
          timestamp: new Date(),
        };

        await this.handleAlert(alert);
      }
    }
  }

  /**
   * Check for webhook failures
   */
  private async checkWebhookFailures(): Promise<void> {
    const last1Hour = new Date();
    last1Hour.setHours(last1Hour.getHours() - 1);

    // Get webhook operations that failed recently
    const failedWebhookOps = await this.prismaService.syncOperation.findMany({
      where: {
        operationType: 'webhook',
        status: 'failed',
        startedAt: { gte: last1Hour },
      },
      orderBy: {
        startedAt: 'desc',
      },
    });

    // Group by connection and check for consecutive failures
    const connectionFailures = new Map<string, number>();
    
    for (const operation of failedWebhookOps) {
      const count = connectionFailures.get(operation.connectionId) || 0;
      connectionFailures.set(operation.connectionId, count + 1);
    }

    for (const [connectionId, failureCount] of connectionFailures) {
      if (failureCount >= this.config.webhookFailureThreshold) {
        const alert: SyncAlert = {
          type: 'webhook_failure',
          severity: failureCount >= 5 ? 'critical' : 'high',
          connectionId,
          message: `Multiple webhook failures detected: ${failureCount} consecutive webhook sync operations failed in the last hour`,
          details: {
            failureCount,
            threshold: this.config.webhookFailureThreshold,
            timeWindow: '1 hour',
          },
          timestamp: new Date(),
        };

        await this.handleAlert(alert);
      }
    }
  }

  /**
   * Handle sync alert
   */
  private async handleAlert(alert: SyncAlert): Promise<void> {
    this.logger.warn('Sync alert generated', {
      type: alert.type,
      severity: alert.severity,
      connectionId: alert.connectionId,
      message: alert.message,
      details: alert.details,
    });

    // TODO: Implement alert handling (email, webhook, etc.)
    // For now, just log the alert
    
    // In a real implementation, you might:
    // 1. Send email notifications to administrators
    // 2. Send webhook notifications to external monitoring systems
    // 3. Create tickets in issue tracking systems
    // 4. Send Slack/Teams notifications
    // 5. Store alerts in database for dashboard display
  }

  /**
   * Generate connection report
   */
  private async generateConnectionReport(
    connectionId: string,
    startDate: Date,
    endDate: Date
  ): Promise<void> {
    try {
      const metrics = await this.syncStatusService.getSyncPerformanceMetrics(connectionId, {
        startDate,
        endDate,
      });

      const summary = await this.syncStatusService.getSyncSummary(connectionId);

      this.logger.log('Daily sync report for connection', {
        connectionId,
        date: startDate.toISOString().split('T')[0],
        metrics: {
          totalOperations: metrics.totalOperations,
          successRate: metrics.successRate,
          averageOrdersPerSync: metrics.averageOrdersPerSync,
          errorRate: metrics.errorRate,
        },
        summary: {
          totalOperations: summary.totalOperations,
          totalOrdersProcessed: summary.totalOrdersProcessed,
          totalOrdersCreated: summary.totalOrdersCreated,
        },
      });

      // TODO: Send report via email or store in database
    } catch (error) {
      this.logger.error(`Error generating report for connection ${connectionId}`, error);
    }
  }

  /**
   * Calculate average duration from operations
   */
  private calculateAverageDuration(operations: Array<{ startedAt: Date; completedAt: Date | null }>): number {
    const durations = operations
      .filter(op => op.completedAt)
      .map(op => op.completedAt!.getTime() - op.startedAt.getTime());

    if (durations.length === 0) {
      return 0;
    }

    return durations.reduce((sum, duration) => sum + duration, 0) / durations.length;
  }

  /**
   * Update monitoring configuration
   */
  updateConfig(newConfig: Partial<SyncMonitoringConfig>): void {
    Object.assign(this.config, newConfig);
    this.logger.log('Sync monitoring configuration updated', newConfig);
  }

  /**
   * Get current monitoring configuration
   */
  getConfig(): SyncMonitoringConfig {
    return { ...this.config };
  }

  /**
   * Get monitoring status
   */
  async getMonitoringStatus(): Promise<{
    isEnabled: boolean;
    config: SyncMonitoringConfig;
    lastMonitoringRun?: Date;
    activeAlerts: number;
  }> {
    // TODO: Implement active alerts tracking
    return {
      isEnabled: this.config.alertingEnabled,
      config: this.config,
      activeAlerts: 0, // Placeholder
    };
  }
}