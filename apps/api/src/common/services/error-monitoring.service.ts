/**
 * Error Monitoring Service
 * Provides error tracking, alerting, and monitoring capabilities
 */

import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LoggingService } from './logging.service';
import { ApiError, ErrorType } from '../exceptions/api-error.interface';

export interface ErrorMetrics {
  totalErrors: number;
  errorsByType: Record<ErrorType, number>;
  errorsByCode: Record<string, number>;
  errorsByEndpoint: Record<string, number>;
  criticalErrors: number;
  lastHourErrors: number;
}

export interface AlertThreshold {
  type: 'error_rate' | 'critical_error' | 'endpoint_errors' | 'authentication_failures';
  threshold: number;
  timeWindow: number; // in minutes
  enabled: boolean;
}

@Injectable()
export class ErrorMonitoringService {
  private errorCounts: Map<string, number> = new Map();
  private errorTimestamps: Map<string, number[]> = new Map();
  private alertThresholds: AlertThreshold[] = [];

  constructor(
    private readonly configService: ConfigService,
    private readonly loggingService: LoggingService
  ) {
    this.initializeAlertThresholds();
    this.startCleanupInterval();
  }

  private initializeAlertThresholds(): void {
    this.alertThresholds = [
      {
        type: 'error_rate',
        threshold: parseInt(this.configService.get('ALERT_ERROR_RATE_THRESHOLD', '50'), 10),
        timeWindow: parseInt(this.configService.get('ALERT_ERROR_RATE_WINDOW', '5'), 10),
        enabled: this.configService.get('ALERT_ERROR_RATE_ENABLED', 'true') === 'true',
      },
      {
        type: 'critical_error',
        threshold: parseInt(this.configService.get('ALERT_CRITICAL_ERROR_THRESHOLD', '5'), 10),
        timeWindow: parseInt(this.configService.get('ALERT_CRITICAL_ERROR_WINDOW', '1'), 10),
        enabled: this.configService.get('ALERT_CRITICAL_ERROR_ENABLED', 'true') === 'true',
      },
      {
        type: 'endpoint_errors',
        threshold: parseInt(this.configService.get('ALERT_ENDPOINT_ERROR_THRESHOLD', '20'), 10),
        timeWindow: parseInt(this.configService.get('ALERT_ENDPOINT_ERROR_WINDOW', '5'), 10),
        enabled: this.configService.get('ALERT_ENDPOINT_ERROR_ENABLED', 'true') === 'true',
      },
      {
        type: 'authentication_failures',
        threshold: parseInt(this.configService.get('ALERT_AUTH_FAILURE_THRESHOLD', '10'), 10),
        timeWindow: parseInt(this.configService.get('ALERT_AUTH_FAILURE_WINDOW', '5'), 10),
        enabled: this.configService.get('ALERT_AUTH_FAILURE_ENABLED', 'true') === 'true',
      },
    ];
  }

  /**
   * Track an error occurrence
   */
  trackError(error: ApiError, endpoint?: string, userId?: string): void {
    const now = Date.now();
    const errorKey = `${error.type}:${error.code}`;
    const endpointKey = endpoint ? `endpoint:${endpoint}` : null;
    const userKey = userId ? `user:${userId}` : null;

    // Track error counts
    this.incrementCounter(errorKey);
    this.addTimestamp(errorKey, now);

    if (endpointKey) {
      this.incrementCounter(endpointKey);
      this.addTimestamp(endpointKey, now);
    }

    if (userKey) {
      this.incrementCounter(userKey);
      this.addTimestamp(userKey, now);
    }

    // Check for alert conditions
    this.checkAlertThresholds(error, endpoint, userId);

    // Log error metrics
    this.loggingService.logWithContext('info', 'Error tracked', {
      errorType: error.type,
      errorCode: error.code,
      endpoint,
      userId,
      correlationId: error.correlationId,
    });
  }

  /**
   * Get current error metrics
   */
  getErrorMetrics(): ErrorMetrics {
    const now = Date.now();
    const oneHourAgo = now - (60 * 60 * 1000);

    const metrics: ErrorMetrics = {
      totalErrors: 0,
      errorsByType: {} as Record<ErrorType, number>,
      errorsByCode: {},
      errorsByEndpoint: {},
      criticalErrors: 0,
      lastHourErrors: 0,
    };

    // Initialize error type counters
    Object.values(ErrorType).forEach(type => {
      metrics.errorsByType[type] = 0;
    });

    // Calculate metrics from stored data
    for (const [key, count] of this.errorCounts.entries()) {
      if (key.startsWith('endpoint:')) {
        const endpoint = key.replace('endpoint:', '');
        metrics.errorsByEndpoint[endpoint] = count;
      } else if (key.includes(':')) {
        const [type, code] = key.split(':');
        if (Object.values(ErrorType).includes(type as ErrorType)) {
          metrics.errorsByType[type as ErrorType] += count;
          metrics.errorsByCode[code] = (metrics.errorsByCode[code] || 0) + count;
          metrics.totalErrors += count;

          // Count critical errors
          if (type === ErrorType.SYSTEM_ERROR || type === ErrorType.AUTHENTICATION_ERROR) {
            metrics.criticalErrors += count;
          }
        }
      }
    }

    // Calculate last hour errors
    for (const timestamps of this.errorTimestamps.values()) {
      metrics.lastHourErrors += timestamps.filter(ts => ts > oneHourAgo).length;
    }

    return metrics;
  }

  /**
   * Check if error rates exceed alert thresholds
   */
  private checkAlertThresholds(error: ApiError, endpoint?: string, userId?: string): void {
    for (const threshold of this.alertThresholds) {
      if (!threshold.enabled) continue;

      const shouldAlert = this.evaluateThreshold(threshold, error, endpoint, userId);
      if (shouldAlert) {
        this.triggerAlert(threshold, error, endpoint, userId);
      }
    }
  }

  private evaluateThreshold(
    threshold: AlertThreshold,
    error: ApiError,
    endpoint?: string,
    userId?: string
  ): boolean {
    const now = Date.now();
    const windowStart = now - (threshold.timeWindow * 60 * 1000);

    switch (threshold.type) {
      case 'error_rate':
        return this.getErrorCountInWindow('total', windowStart, now) >= threshold.threshold;

      case 'critical_error':
        const criticalTypes = [ErrorType.SYSTEM_ERROR, ErrorType.AUTHENTICATION_ERROR];
        return criticalTypes.includes(error.type) &&
               this.getErrorCountInWindow('critical', windowStart, now) >= threshold.threshold;

      case 'endpoint_errors':
        return endpoint &&
               this.getErrorCountInWindow(`endpoint:${endpoint}`, windowStart, now) >= threshold.threshold;

      case 'authentication_failures':
        return error.type === ErrorType.AUTHENTICATION_ERROR &&
               this.getErrorCountInWindow(ErrorType.AUTHENTICATION_ERROR, windowStart, now) >= threshold.threshold;

      default:
        return false;
    }
  }

  private getErrorCountInWindow(key: string, windowStart: number, windowEnd: number): number {
    if (key === 'total') {
      let count = 0;
      for (const timestamps of this.errorTimestamps.values()) {
        count += timestamps.filter(ts => ts >= windowStart && ts <= windowEnd).length;
      }
      return count;
    }

    if (key === 'critical') {
      let count = 0;
      const criticalKeys = [ErrorType.SYSTEM_ERROR, ErrorType.AUTHENTICATION_ERROR];
      for (const criticalKey of criticalKeys) {
        const timestamps = this.errorTimestamps.get(criticalKey) || [];
        count += timestamps.filter(ts => ts >= windowStart && ts <= windowEnd).length;
      }
      return count;
    }

    const timestamps = this.errorTimestamps.get(key) || [];
    return timestamps.filter(ts => ts >= windowStart && ts <= windowEnd).length;
  }

  private triggerAlert(
    threshold: AlertThreshold,
    error: ApiError,
    endpoint?: string,
    userId?: string
  ): void {
    const alertData = {
      type: threshold.type,
      threshold: threshold.threshold,
      timeWindow: threshold.timeWindow,
      error: {
        type: error.type,
        code: error.code,
        message: error.message,
        correlationId: error.correlationId,
      },
      endpoint,
      userId,
      timestamp: new Date().toISOString(),
    };

    // Log the alert
    this.loggingService.logSecurity({
      event: 'ERROR_THRESHOLD_EXCEEDED',
      userId,
      ipAddress: 'system',
      success: false,
      riskLevel: 'HIGH',
      details: alertData,
    });

    // In production, this would integrate with alerting systems like:
    // - Email notifications
    // - Slack/Teams webhooks
    // - PagerDuty
    // - SMS alerts
    this.sendAlert(alertData);
  }

  private sendAlert(alertData: any): void {
    // Placeholder for alert integration
    // In production, implement actual alerting mechanisms
    console.warn('🚨 ALERT TRIGGERED:', JSON.stringify(alertData, null, 2));
    
    // Example integrations:
    // await this.emailService.sendAlert(alertData);
    // await this.slackService.sendAlert(alertData);
    // await this.pagerDutyService.createIncident(alertData);
  }

  private incrementCounter(key: string): void {
    const current = this.errorCounts.get(key) || 0;
    this.errorCounts.set(key, current + 1);
  }

  private addTimestamp(key: string, timestamp: number): void {
    const timestamps = this.errorTimestamps.get(key) || [];
    timestamps.push(timestamp);
    this.errorTimestamps.set(key, timestamps);
  }

  /**
   * Clean up old timestamps to prevent memory leaks
   */
  private startCleanupInterval(): void {
    const cleanupInterval = parseInt(this.configService.get('ERROR_CLEANUP_INTERVAL', '300000'), 10); // 5 minutes
    const retentionPeriod = parseInt(this.configService.get('ERROR_RETENTION_PERIOD', '86400000'), 10); // 24 hours

    setInterval(() => {
      const cutoff = Date.now() - retentionPeriod;
      
      for (const [key, timestamps] of this.errorTimestamps.entries()) {
        const filteredTimestamps = timestamps.filter(ts => ts > cutoff);
        
        if (filteredTimestamps.length === 0) {
          this.errorTimestamps.delete(key);
          this.errorCounts.delete(key);
        } else {
          this.errorTimestamps.set(key, filteredTimestamps);
          this.errorCounts.set(key, filteredTimestamps.length);
        }
      }
    }, cleanupInterval);
  }

  /**
   * Reset all metrics (useful for testing)
   */
  resetMetrics(): void {
    this.errorCounts.clear();
    this.errorTimestamps.clear();
  }

  /**
   * Get health status of error monitoring
   */
  getHealthStatus(): { healthy: boolean; metrics: ErrorMetrics } {
    const metrics = this.getErrorMetrics();
    const healthy = metrics.criticalErrors < 10 && metrics.lastHourErrors < 100;
    
    return { healthy, metrics };
  }
}