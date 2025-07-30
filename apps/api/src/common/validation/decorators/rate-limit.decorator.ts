import { SetMetadata } from '@nestjs/common';

export const RATE_LIMIT_KEY = 'rate_limit';

export interface RateLimitOptions {
  windowMs: number;
  max: number;
  message?: string;
  skipSuccessfulRequests?: boolean;
  skipFailedRequests?: boolean;
  keyGenerator?: (req: any) => string;
}

export const RateLimit = (options: RateLimitOptions) => 
  SetMetadata(RATE_LIMIT_KEY, options);

// Predefined rate limits for authentication endpoints
export const AuthRateLimit = () => RateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10, // 10 requests per minute
  message: 'Too many authentication attempts, please try again later',
  skipSuccessfulRequests: false,
  skipFailedRequests: false,
});

export const LoginRateLimit = () => RateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 5, // 5 login attempts per minute
  message: 'Too many login attempts, please try again later',
  skipSuccessfulRequests: true,
  skipFailedRequests: false,
});

export const RegisterRateLimit = () => RateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 3, // 3 registration attempts per minute
  message: 'Too many registration attempts, please try again later',
  skipSuccessfulRequests: true,
  skipFailedRequests: false,
});

export const PasswordResetRateLimit = () => RateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 2, // 2 password reset attempts per minute
  message: 'Too many password reset attempts, please try again later',
  skipSuccessfulRequests: true,
  skipFailedRequests: false,
});