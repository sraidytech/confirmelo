/**
 * Logging Service
 * Provides structured logging with Winston for comprehensive error tracking and monitoring
 */

import { Injectable, LoggerService } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as winston from 'winston';
import { ApiError } from '../exceptions/api-error.interface';

export interface LogContext {
  correlationId?: string;
  userId?: string;
  organizationId?: string;
  sessionId?: string;
  ipAddress?: string;
  userAgent?: string;
  method?: string;
  url?: string;
  [key: string]: any;
}

export interface ErrorLogData {
  correlationId: string;
  error: ApiError;
  request?: {
    method: string;
    url: string;
    userAgent?: string;
    ip: string;
    userId?: string;
    organizationId?: string;
  };
  exception?: {
    name: string;
    message: string;
    stack?: string;
  };
}

export interface SecurityLogData {
  event: string;
  userId?: string;
  organizationId?: string;
  ipAddress: string;
  userAgent?: string;
  success: boolean;
  details?: Record<string, any>;
  riskLevel?: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
}

export interface PerformanceLogData {
  operation: string;
  duration: number;
  success: boolean;
  userId?: string;
  organizationId?: string;
  details?: Record<string, any>;
}

@Injectable()
export class LoggingService implements LoggerService {
  private readonly logger: winston.Logger;
  private readonly securityLogger: winston.Logger;
  private readonly performanceLogger: winston.Logger;

  constructor(private readonly configService: ConfigService) {
    const logLevel = this.configService.get('LOG_LEVEL', 'info');
    const nodeEnv = this.configService.get('NODE_ENV', 'development');
    
    // Main application logger
    this.logger = winston.createLogger({
      level: logLevel,
      format: this.createLogFormat(),
      defaultMeta: { service: 'confirmelo-api' },
      transports: this.createTransports(nodeEnv, 'app'),
    });

    // Security-specific logger
    this.securityLogger = winston.createLogger({
      level: 'info',
      format: this.createLogFormat(),
      defaultMeta: { service: 'confirmelo-security' },
      transports: this.createTransports(nodeEnv, 'security'),
    });

    // Performance logger
    this.performanceLogger = winston.createLogger({
      level: 'info',
      format: this.createLogFormat(),
      defaultMeta: { service: 'confirmelo-performance' },
      transports: this.createTransports(nodeEnv, 'performance'),
    });
  }

  private createLogFormat(): winston.Logform.Format {
    return winston.format.combine(
      winston.format.timestamp(),
      winston.format.errors({ stack: true }),
      winston.format.json(),
      winston.format.printf(({ timestamp, level, message, service, ...meta }) => {
        return JSON.stringify({
          timestamp,
          level,
          service,
          message,
          ...meta,
        });
      })
    );
  }

  private createTransports(nodeEnv: string, logType: string): winston.transport[] {
    const transports: winston.transport[] = [];

    // Console transport for development
    if (nodeEnv === 'development') {
      transports.push(
        new winston.transports.Console({
          format: winston.format.combine(
            winston.format.colorize(),
            winston.format.simple(),
            winston.format.printf(({ timestamp, level, message, ...meta }) => {
              const metaStr = Object.keys(meta).length ? JSON.stringify(meta, null, 2) : '';
              return `${timestamp} [${level}]: ${message} ${metaStr}`;
            })
          ),
        })
      );
    }

    // File transports for production
    if (nodeEnv === 'production') {
      // Error logs
      transports.push(
        new winston.transports.File({
          filename: `logs/${logType}-error.log`,
          level: 'error',
          maxsize: 5242880, // 5MB
          maxFiles: 5,
        })
      );

      // Combined logs
      transports.push(
        new winston.transports.File({
          filename: `logs/${logType}-combined.log`,
          maxsize: 5242880, // 5MB
          maxFiles: 5,
        })
      );
    }

    return transports;
  }

  // Standard LoggerService interface methods
  log(message: any, context?: string): void {
    this.logger.info(message, { context });
  }

  error(message: any, trace?: string, context?: string): void {
    this.logger.error(message, { trace, context });
  }

  warn(message: any, context?: string): void {
    this.logger.warn(message, { context });
  }

  debug(message: any, context?: string): void {
    this.logger.debug(message, { context });
  }

  verbose(message: any, context?: string): void {
    this.logger.verbose(message, { context });
  }

  // Enhanced logging methods with context
  logWithContext(level: string, message: string, context: LogContext): void {
    this.logger.log(level, message, context);
  }

  logInfo(message: string, context?: LogContext): void {
    this.logger.info(message, context);
  }

  logError(errorData: ErrorLogData): void {
    this.logger.error('API Error occurred', {
      correlationId: errorData.correlationId,
      errorType: errorData.error.type,
      errorCode: errorData.error.code,
      errorMessage: errorData.error.message,
      path: errorData.error.path,
      request: errorData.request,
      exception: errorData.exception,
      timestamp: errorData.error.timestamp,
    });
  }

  logSecurity(data: SecurityLogData): void {
    this.securityLogger.info('Security Event', {
      event: data.event,
      userId: data.userId,
      organizationId: data.organizationId,
      ipAddress: data.ipAddress,
      userAgent: data.userAgent,
      success: data.success,
      riskLevel: data.riskLevel || 'LOW',
      details: data.details,
      timestamp: new Date().toISOString(),
    });

    // Also log high-risk events to main logger
    if (data.riskLevel === 'HIGH' || data.riskLevel === 'CRITICAL') {
      this.logger.warn('High-risk security event', {
        event: data.event,
        userId: data.userId,
        riskLevel: data.riskLevel,
        ipAddress: data.ipAddress,
      });
    }
  }

  logPerformance(data: PerformanceLogData): void {
    this.performanceLogger.info('Performance Metric', {
      operation: data.operation,
      duration: data.duration,
      success: data.success,
      userId: data.userId,
      organizationId: data.organizationId,
      details: data.details,
      timestamp: new Date().toISOString(),
    });

    // Log slow operations to main logger
    const slowThreshold = parseInt(this.configService.get('SLOW_OPERATION_THRESHOLD', '5000'), 10);
    if (data.duration > slowThreshold) {
      this.logger.warn('Slow operation detected', {
        operation: data.operation,
        duration: data.duration,
        threshold: slowThreshold,
      });
    }
  }

  // Authentication-specific logging methods
  logAuthenticationAttempt(
    success: boolean,
    email: string,
    ipAddress: string,
    userAgent?: string,
    userId?: string,
    reason?: string
  ): void {
    this.logSecurity({
      event: 'AUTHENTICATION_ATTEMPT',
      userId,
      ipAddress,
      userAgent,
      success,
      riskLevel: success ? 'LOW' : 'MEDIUM',
      details: {
        email: this.maskEmail(email),
        reason,
      },
    });
  }

  logPasswordReset(
    email: string,
    ipAddress: string,
    userAgent?: string,
    success: boolean = true
  ): void {
    this.logSecurity({
      event: 'PASSWORD_RESET_REQUEST',
      ipAddress,
      userAgent,
      success,
      riskLevel: 'MEDIUM',
      details: {
        email: this.maskEmail(email),
      },
    });
  }

  logAccountLockout(
    userId: string,
    email: string,
    ipAddress: string,
    attemptCount: number
  ): void {
    this.logSecurity({
      event: 'ACCOUNT_LOCKOUT',
      userId,
      ipAddress,
      success: false,
      riskLevel: 'HIGH',
      details: {
        email: this.maskEmail(email),
        attemptCount,
      },
    });
  }

  logSuspiciousActivity(
    event: string,
    userId: string,
    ipAddress: string,
    details: Record<string, any>
  ): void {
    this.logSecurity({
      event: `SUSPICIOUS_${event}`,
      userId,
      ipAddress,
      success: false,
      riskLevel: 'HIGH',
      details,
    });
  }

  logRateLimitExceeded(
    identifier: string,
    ipAddress: string,
    endpoint: string,
    limit: number
  ): void {
    this.logSecurity({
      event: 'RATE_LIMIT_EXCEEDED',
      ipAddress,
      success: false,
      riskLevel: 'MEDIUM',
      details: {
        identifier,
        endpoint,
        limit,
      },
    });
  }

  // Utility methods
  private maskEmail(email: string): string {
    const [localPart, domain] = email.split('@');
    if (localPart.length <= 2) {
      return `${localPart[0]}***@${domain}`;
    }
    return `${localPart.substring(0, 2)}***@${domain}`;
  }

  // Method to create child logger with persistent context
  createChildLogger(context: LogContext): winston.Logger {
    return this.logger.child(context);
  }

  // Health check method
  isHealthy(): boolean {
    try {
      this.logger.info('Health check');
      return true;
    } catch (error) {
      return false;
    }
  }
}