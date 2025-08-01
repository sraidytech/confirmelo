/**
 * Request Logging Middleware
 * Logs all incoming requests with performance metrics and context
 */

import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { LoggingService } from '../services/logging.service';
import { RequestWithCorrelationId } from './correlation-id.middleware';

interface RequestWithUser extends RequestWithCorrelationId {
  user?: {
    id: string;
    organizationId?: string;
    email: string;
    role: string;
  };
}

@Injectable()
export class RequestLoggingMiddleware implements NestMiddleware {
  constructor(private readonly loggingService: LoggingService) {}

  use(req: RequestWithUser, res: Response, next: NextFunction): void {
    const startTime = Date.now();
    const { method, originalUrl, ip } = req;
    const userAgent = req.get('User-Agent');
    const correlationId = req.correlationId;

    // Log request start
    this.loggingService.logWithContext('info', 'Request started', {
      correlationId,
      method,
      url: originalUrl,
      ip: this.getClientIp(req),
      userAgent,
      userId: req.user?.id,
      organizationId: req.user?.organizationId,
    });

    // Override res.end to capture response details
    const originalEnd = res.end;
    const loggingService = this.loggingService;
    const getClientIp = this.getClientIp.bind(this);
    
    res.end = function(chunk?: any, encoding?: any) {
      const duration = Date.now() - startTime;
      const { statusCode } = res;
      
      // Log request completion
      const logLevel = statusCode >= 400 ? 'warn' : 'info';
      const message = `Request completed - ${method} ${originalUrl} ${statusCode} - ${duration}ms`;
      
      loggingService.logWithContext(logLevel, message, {
        correlationId,
        method,
        url: originalUrl,
        statusCode,
        duration,
        ip: getClientIp(req),
        userAgent,
        userId: req.user?.id,
        organizationId: req.user?.organizationId,
        responseSize: res.get('Content-Length'),
      });

      // Log performance metrics
      loggingService.logPerformance({
        operation: `${method} ${originalUrl}`,
        duration,
        success: statusCode < 400,
        userId: req.user?.id,
        organizationId: req.user?.organizationId,
        details: {
          statusCode,
          method,
          url: originalUrl,
          correlationId,
        },
      });

      // Call original end method and return the result
      return originalEnd.call(this, chunk, encoding);
    };

    next();
  }

  private getClientIp(req: Request): string {
    return (
      req.get('X-Forwarded-For') ||
      req.get('X-Real-IP') ||
      req.connection.remoteAddress ||
      req.socket.remoteAddress ||
      req.ip ||
      'unknown'
    );
  }
}