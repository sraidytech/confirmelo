import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ValidationService } from './validation.service';
import { SanitizationService } from './sanitization.service';
import { EnhancedValidationPipe, AuthValidationPipe } from './pipes/enhanced-validation.pipe';
import { RateLimitGuard } from './guards/rate-limit.guard';
import { RequestSizeMiddleware } from './middleware/request-size.middleware';
import { LoggingService } from '../services/logging.service';
import { RedisModule } from '../redis/redis.module';
import {
  IsStrongPasswordConstraint,
  IsValidUsernameConstraint,
  IsSafeOrganizationNameConstraint,
  IsSafeUrlConstraint,
  IsValidPhoneNumberConstraint,
  NoSqlInjectionConstraint,
  NoXssConstraint,
} from './decorators/validation.decorators';

@Module({
  imports: [ConfigModule, RedisModule],
  providers: [
    LoggingService,
    ValidationService,
    SanitizationService,
    EnhancedValidationPipe,
    AuthValidationPipe,
    RateLimitGuard,
    RequestSizeMiddleware,
    // Validation constraint classes
    IsStrongPasswordConstraint,
    IsValidUsernameConstraint,
    IsSafeOrganizationNameConstraint,
    IsSafeUrlConstraint,
    IsValidPhoneNumberConstraint,
    NoSqlInjectionConstraint,
    NoXssConstraint,
  ],
  exports: [
    LoggingService,
    ValidationService,
    SanitizationService,
    EnhancedValidationPipe,
    AuthValidationPipe,
    RateLimitGuard,
    RequestSizeMiddleware,
  ],
})
export class ValidationModule {}