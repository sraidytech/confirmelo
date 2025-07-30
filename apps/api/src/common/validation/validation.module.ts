import { Module } from '@nestjs/common';
import { ValidationService } from './validation.service';
import { SanitizationService } from './sanitization.service';
import { EnhancedValidationPipe, AuthValidationPipe } from './pipes/enhanced-validation.pipe';
import { RateLimitGuard } from './guards/rate-limit.guard';
import { RequestSizeMiddleware } from './middleware/request-size.middleware';
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
  providers: [
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
    ValidationService,
    SanitizationService,
    EnhancedValidationPipe,
    AuthValidationPipe,
    RateLimitGuard,
    RequestSizeMiddleware,
  ],
})
export class ValidationModule {}