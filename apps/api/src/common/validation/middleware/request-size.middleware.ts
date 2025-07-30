import { Injectable, NestMiddleware, BadRequestException } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { LoggingService } from '../../services/logging.service';

@Injectable()
export class RequestSizeMiddleware implements NestMiddleware {
  constructor(private readonly loggingService: LoggingService) {}

  use(req: Request, res: Response, next: NextFunction) {
    const maxSizeKB = this.getMaxSizeForEndpoint(req.path);
    const contentLength = parseInt(req.headers['content-length'] || '0', 10);
    const sizeKB = contentLength / 1024;

    if (sizeKB > maxSizeKB) {
      this.loggingService.logSecurity({
        event: 'REQUEST_SIZE_EXCEEDED',
        userId: undefined,
        ipAddress: this.getClientIp(req),
        success: false,
        riskLevel: 'MEDIUM',
        details: {
          path: req.path,
          method: req.method,
          sizeKB,
          maxSizeKB,
          userAgent: req.headers['user-agent'],
        },
      });

      throw new BadRequestException(
        `Request size (${sizeKB.toFixed(2)}KB) exceeds maximum allowed size (${maxSizeKB}KB)`
      );
    }

    next();
  }

  private getMaxSizeForEndpoint(path: string): number {
    // Different size limits for different endpoints
    if (path.includes('/auth/register')) {
      return 50; // 50KB for registration
    }
    
    if (path.includes('/auth/login')) {
      return 10; // 10KB for login
    }
    
    if (path.includes('/auth/')) {
      return 20; // 20KB for other auth endpoints
    }
    
    if (path.includes('/users/profile') && path.includes('avatar')) {
      return 5120; // 5MB for avatar uploads
    }
    
    return 100; // 100KB default
  }

  private getClientIp(request: Request): string {
    return (
      request.headers['x-forwarded-for'] as string ||
      request.headers['x-real-ip'] as string ||
      request.connection.remoteAddress ||
      request.socket.remoteAddress ||
      'unknown'
    );
  }
}