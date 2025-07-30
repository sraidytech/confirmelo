import {
  PipeTransform,
  Injectable,
  ArgumentMetadata,
  BadRequestException,
} from '@nestjs/common';
import { validate } from 'class-validator';
import { plainToClass } from 'class-transformer';
import { SanitizationService } from '../sanitization.service';
import { ValidationService } from '../validation.service';
import { LoggingService } from '../../services/logging.service';

@Injectable()
export class EnhancedValidationPipe implements PipeTransform<any> {
  constructor(
    protected readonly sanitizationService: SanitizationService,
    protected readonly validationService: ValidationService,
    protected readonly loggingService: LoggingService,
  ) { }

  async transform(value: any, { metatype }: ArgumentMetadata) {
    if (!metatype || !this.toValidate(metatype)) {
      return value;
    }

    // Check request size
    const sizeValidation = this.validationService.validateRequestSize(value, 100);
    if (!sizeValidation.isValid) {
      this.loggingService.logSecurity({
        event: 'REQUEST_SIZE_EXCEEDED',
        userId: undefined,
        ipAddress: 'system',
        success: false,
        riskLevel: 'MEDIUM',
        details: {
          size: sizeValidation.sizeKB,
          error: sizeValidation.error,
        },
      });
      throw new BadRequestException(sizeValidation.error);
    }

    // Sanitize input data
    const sanitizedValue = this.sanitizationService.sanitizeObject(value);

    // Transform to class instance
    const object = plainToClass(metatype, sanitizedValue);

    // Validate the object
    const errors = await validate(object, {
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      validateCustomDecorators: true,
    });

    if (errors.length > 0) {
      const errorMessages = this.formatValidationErrors(errors);

      this.loggingService.logSecurity({
        event: 'VALIDATION_FAILED',
        userId: undefined,
        ipAddress: 'system',
        success: false,
        riskLevel: 'MEDIUM',
        details: {
          errors: errorMessages,
          sanitizedInput: this.sanitizationService.sanitizeForLogging(sanitizedValue),
        },
      });

      throw new BadRequestException({
        message: 'Validation failed',
        errors: errorMessages,
      });
    }

    return object;
  }

  private toValidate(metatype: Function): boolean {
    const types: Function[] = [String, Boolean, Number, Array, Object];
    return !types.includes(metatype);
  }

  private formatValidationErrors(errors: any[]): any[] {
    return errors.map(error => ({
      property: error.property,
      value: error.value,
      constraints: error.constraints,
      children: error.children?.length > 0 ? this.formatValidationErrors(error.children) : undefined,
    }));
  }
}

@Injectable()
export class AuthValidationPipe extends EnhancedValidationPipe {
  constructor(
    sanitizationService: SanitizationService,
    validationService: ValidationService,
    loggingService: LoggingService,
  ) {
    super(sanitizationService, validationService, loggingService);
  }

  async transform(value: any, metadata: ArgumentMetadata) {
    // Additional security checks for authentication endpoints
    if (value && typeof value === 'object') {
      // Check for suspicious patterns in authentication data
      const suspiciousPatterns = [
        /\$\{.*\}/,  // Template injection
        /<%.*%>/,    // Template injection
        /{{.*}}/,    // Template injection
        /__proto__/, // Prototype pollution
        /constructor/, // Constructor pollution
      ];

      const jsonString = JSON.stringify(value);
      const hasSuspiciousPattern = suspiciousPatterns.some(pattern =>
        pattern.test(jsonString)
      );

      if (hasSuspiciousPattern) {
        this.loggingService.logSecurity({
          event: 'SUSPICIOUS_AUTH_INPUT',
          userId: undefined,
          ipAddress: 'system',
          success: false,
          riskLevel: 'HIGH',
          details: {
            input: this.sanitizationService.sanitizeForLogging(value),
          },
        });
        throw new BadRequestException('Invalid input detected');
      }
    }

    return super.transform(value, metadata);
  }
}