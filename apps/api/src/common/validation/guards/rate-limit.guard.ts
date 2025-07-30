import {
  Injectable,
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { RedisService } from '../../redis/redis.service';
import { LoggingService } from '../../services/logging.service';
import { RATE_LIMIT_KEY, RateLimitOptions } from '../decorators/rate-limit.decorator';
import { ErrorType } from '../../exceptions/api-error.interface';

@Injectable()
export class RateLimitGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly redisService: RedisService,
    private readonly loggingService: LoggingService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const rateLimitOptions = this.reflector.get<RateLimitOptions>(
      RATE_LIMIT_KEY,
      context.getHandler(),
    );

    if (!rateLimitOptions) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
    const key = this.generateKey(request, rateLimitOptions);
    
    const current = await this.getCurrentCount(key);
    const isAllowed = current < rateLimitOptions.max;

    if (isAllowed) {
      await this.incrementCount(key, rateLimitOptions.windowMs);
    } else {
      // Log rate limit exceeded
      this.loggingService.logSecurity({
        event: 'RATE_LIMIT_EXCEEDED',
        userId: undefined,
        ipAddress: this.getClientIp(request),
        success: false,
        riskLevel: 'HIGH',
        details: {
          userAgent: request.headers['user-agent'],
          endpoint: request.url,
          method: request.method,
          key,
          current,
          max: rateLimitOptions.max,
          windowMs: rateLimitOptions.windowMs,
        },
      });

      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          message: rateLimitOptions.message || 'Too many requests',
          error: 'Too Many Requests',
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    return true;
  }

  private generateKey(request: Request, options: RateLimitOptions): string {
    if (options.keyGenerator) {
      return options.keyGenerator(request);
    }

    const ip = this.getClientIp(request);
    const endpoint = request.route?.path || request.url;
    return `rate_limit:${ip}:${endpoint}`;
  }

  private getClientIp(request: Request): string {
    return (
      request.headers['x-forwarded-for'] as string ||
      request.headers['x-real-ip'] as string ||
      request.socket.remoteAddress ||
      request.ip ||
      'unknown'
    );
  }

  private async getCurrentCount(key: string): Promise<number> {
    try {
      const count = await this.redisService.get(key);
      return count ? parseInt(count, 10) : 0;
    } catch (error) {
      this.loggingService.logError({
        correlationId: 'rate-limit-error',
        error: {
          type: ErrorType.SYSTEM_ERROR,
          message: `Failed to get rate limit count for key: ${key}`,
          code: 'RATE_LIMIT_001',
          correlationId: 'rate-limit-error',
          timestamp: new Date().toISOString(),
        },
      });
      return 0;
    }
  }

  private async incrementCount(key: string, windowMs: number): Promise<void> {
    try {
      const current = await this.getCurrentCount(key);
      const newCount = current + 1;
      await this.redisService.set(key, newCount.toString(), Math.ceil(windowMs / 1000));
    } catch (error) {
      this.loggingService.logError({
        correlationId: 'rate-limit-error',
        error: {
          type: ErrorType.SYSTEM_ERROR,
          message: `Failed to increment rate limit count for key: ${key}`,
          code: 'RATE_LIMIT_002',
          correlationId: 'rate-limit-error',
          timestamp: new Date().toISOString(),
        },
      });
    }
  }
}