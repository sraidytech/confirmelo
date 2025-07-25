import { Injectable } from '@nestjs/common';
import { RedisService } from '../redis/redis.service';

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetTime: number;
  retryAfter?: number;
}

export interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
  blockDurationMs?: number;
}

@Injectable()
export class RateLimitUtil {
  constructor(private redisService: RedisService) {}

  /**
   * Check rate limit for a specific key
   */
  async checkRateLimit(
    key: string,
    config: RateLimitConfig,
  ): Promise<RateLimitResult> {
    const windowKey = `rate_limit:${key}`;
    const blockKey = `rate_limit_block:${key}`;

    // Check if user is currently blocked
    const isBlocked = await this.redisService.exists(blockKey);
    if (isBlocked) {
      const blockTtl = await this.redisService.getClient().ttl(blockKey);
      return {
        allowed: false,
        remaining: 0,
        resetTime: blockTtl,
        retryAfter: blockTtl,
      };
    }

    // Get current request count
    const client = this.redisService.getClient();
    const current = await client.incr(windowKey);

    // Set expiration on first request
    if (current === 1) {
      await client.expire(windowKey, Math.ceil(config.windowMs / 1000));
    }

    const remaining = Math.max(0, config.maxRequests - current);
    const ttl = await client.ttl(windowKey);

    if (current <= config.maxRequests) {
      return {
        allowed: true,
        remaining,
        resetTime: ttl,
      };
    }

    // Rate limit exceeded - block if configured
    if (config.blockDurationMs) {
      await this.redisService.set(
        blockKey,
        'blocked',
        Math.ceil(config.blockDurationMs / 1000),
      );
    }

    return {
      allowed: false,
      remaining: 0,
      resetTime: ttl,
      retryAfter: config.blockDurationMs ? Math.ceil(config.blockDurationMs / 1000) : ttl,
    };
  }

  /**
   * Check login rate limit with progressive delays
   */
  async checkLoginRateLimit(identifier: string): Promise<RateLimitResult & { delay: number }> {
    const failedAttemptsKey = `login_attempts:${identifier}`;
    const client = this.redisService.getClient();

    // Get current failed attempts
    const attempts = await client.get(failedAttemptsKey);
    const failedCount = attempts ? parseInt(attempts) : 0;

    // Calculate progressive delay (1s, 2s, 4s, 8s, etc.)
    const delay = failedCount > 0 ? Math.min(Math.pow(2, failedCount - 1), 60) : 0;

    // Check if user should be delayed
    if (delay > 0) {
      const delayKey = `login_delay:${identifier}`;
      const isDelayed = await this.redisService.exists(delayKey);
      
      if (isDelayed) {
        const delayTtl = await client.ttl(delayKey);
        return {
          allowed: false,
          remaining: 0,
          resetTime: delayTtl,
          retryAfter: delayTtl,
          delay: delayTtl,
        };
      }
    }

    // Check basic rate limit (10 requests per minute)
    const rateLimitResult = await this.checkRateLimit(identifier, {
      windowMs: 60000, // 1 minute
      maxRequests: 10,
      blockDurationMs: 300000, // 5 minutes block after exceeding
    });

    return {
      ...rateLimitResult,
      delay,
    };
  }

  /**
   * Record failed login attempt
   */
  async recordFailedLogin(identifier: string): Promise<void> {
    const failedAttemptsKey = `login_attempts:${identifier}`;
    const client = this.redisService.getClient();

    // Increment failed attempts
    const attempts = await client.incr(failedAttemptsKey);
    
    // Set expiration for failed attempts (1 hour)
    if (attempts === 1) {
      await client.expire(failedAttemptsKey, 3600);
    }

    // Set progressive delay
    const delay = Math.min(Math.pow(2, attempts - 1), 60);
    if (delay > 0) {
      const delayKey = `login_delay:${identifier}`;
      await this.redisService.set(delayKey, 'delayed', delay);
    }

    // Lock account after 5 failed attempts
    if (attempts >= 5) {
      const lockKey = `account_lock:${identifier}`;
      await this.redisService.set(lockKey, 'locked', 1800); // 30 minutes lock
    }
  }

  /**
   * Clear failed login attempts (on successful login)
   */
  async clearFailedLogins(identifier: string): Promise<void> {
    const client = this.redisService.getClient();
    
    await Promise.all([
      client.del(`login_attempts:${identifier}`),
      client.del(`login_delay:${identifier}`),
      client.del(`account_lock:${identifier}`),
    ]);
  }

  /**
   * Check if account is locked
   */
  async isAccountLocked(identifier: string): Promise<{ locked: boolean; unlockTime?: number }> {
    const lockKey = `account_lock:${identifier}`;
    const isLocked = await this.redisService.exists(lockKey);
    
    if (isLocked) {
      const ttl = await this.redisService.getClient().ttl(lockKey);
      return { locked: true, unlockTime: ttl };
    }
    
    return { locked: false };
  }

  /**
   * Get rate limit statistics
   */
  async getRateLimitStats(identifier: string): Promise<{
    failedAttempts: number;
    isDelayed: boolean;
    delayRemaining: number;
    isLocked: boolean;
    lockRemaining: number;
  }> {
    const client = this.redisService.getClient();
    
    const [failedAttempts, isDelayed, delayTtl, isLocked, lockTtl] = await Promise.all([
      client.get(`login_attempts:${identifier}`).then(val => val ? parseInt(val) : 0),
      this.redisService.exists(`login_delay:${identifier}`),
      client.ttl(`login_delay:${identifier}`),
      this.redisService.exists(`account_lock:${identifier}`),
      client.ttl(`account_lock:${identifier}`),
    ]);

    return {
      failedAttempts,
      isDelayed,
      delayRemaining: isDelayed ? delayTtl : 0,
      isLocked,
      lockRemaining: isLocked ? lockTtl : 0,
    };
  }
}