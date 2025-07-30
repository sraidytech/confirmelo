/**
 * Custom Exception Classes
 * Provides domain-specific exceptions with proper error codes and types
 */

import { HttpException, HttpStatus } from '@nestjs/common';
import { ErrorType, ValidationErrorDetail } from './api-error.interface';

export class AuthenticationException extends HttpException {
  constructor(
    message: string = 'Authentication failed',
    code: string = 'AUTH_001',
    details?: Record<string, any>
  ) {
    super(
      {
        type: ErrorType.AUTHENTICATION_ERROR,
        message,
        code,
        details,
      },
      HttpStatus.UNAUTHORIZED
    );
  }
}

export class AuthorizationException extends HttpException {
  constructor(
    message: string = 'Access denied',
    code: string = 'AUTH_002',
    details?: Record<string, any>
  ) {
    super(
      {
        type: ErrorType.AUTHORIZATION_ERROR,
        message,
        code,
        details,
      },
      HttpStatus.FORBIDDEN
    );
  }
}

export class ValidationException extends HttpException {
  constructor(
    message: string = 'Validation failed',
    code: string = 'VAL_001',
    validationErrors?: ValidationErrorDetail[]
  ) {
    super(
      {
        type: ErrorType.VALIDATION_ERROR,
        message,
        code,
        details: { validationErrors },
      },
      HttpStatus.BAD_REQUEST
    );
  }
}

export class RateLimitException extends HttpException {
  constructor(
    message: string = 'Rate limit exceeded',
    code: string = 'RATE_001',
    retryAfter?: number
  ) {
    super(
      {
        type: ErrorType.RATE_LIMIT_ERROR,
        message,
        code,
        details: { retryAfter },
      },
      HttpStatus.TOO_MANY_REQUESTS
    );
  }
}

export class SystemException extends HttpException {
  constructor(
    message: string = 'Internal server error',
    code: string = 'SYS_001',
    details?: Record<string, any>
  ) {
    super(
      {
        type: ErrorType.SYSTEM_ERROR,
        message,
        code,
        details,
      },
      HttpStatus.INTERNAL_SERVER_ERROR
    );
  }
}

export class ResourceNotFoundException extends HttpException {
  constructor(
    resource: string,
    identifier?: string,
    code: string = 'NOT_FOUND_001'
  ) {
    const message = identifier 
      ? `${resource} with identifier '${identifier}' not found`
      : `${resource} not found`;
    
    super(
      {
        type: ErrorType.NOT_FOUND_ERROR,
        message,
        code,
        details: { resource, identifier },
      },
      HttpStatus.NOT_FOUND
    );
  }
}

export class ResourceConflictException extends HttpException {
  constructor(
    message: string,
    code: string = 'CONFLICT_001',
    details?: Record<string, any>
  ) {
    super(
      {
        type: ErrorType.CONFLICT_ERROR,
        message,
        code,
        details,
      },
      HttpStatus.CONFLICT
    );
  }
}

// Specific authentication error codes
export const AUTH_ERROR_CODES = {
  INVALID_CREDENTIALS: 'AUTH_001',
  TOKEN_EXPIRED: 'AUTH_002',
  TOKEN_INVALID: 'AUTH_003',
  ACCOUNT_LOCKED: 'AUTH_004',
  ACCOUNT_SUSPENDED: 'AUTH_005',
  SESSION_EXPIRED: 'AUTH_006',
  REFRESH_TOKEN_INVALID: 'AUTH_007',
  PASSWORD_RESET_REQUIRED: 'AUTH_008',
} as const;

// Specific validation error codes
export const VALIDATION_ERROR_CODES = {
  REQUIRED_FIELD: 'VAL_001',
  INVALID_FORMAT: 'VAL_002',
  PASSWORD_WEAK: 'VAL_003',
  EMAIL_INVALID: 'VAL_004',
  PHONE_INVALID: 'VAL_005',
  DUPLICATE_VALUE: 'VAL_006',
} as const;

// System error codes
export const SYSTEM_ERROR_CODES = {
  DATABASE_ERROR: 'SYS_001',
  REDIS_ERROR: 'SYS_002',
  EXTERNAL_SERVICE_ERROR: 'SYS_003',
  CONFIGURATION_ERROR: 'SYS_004',
} as const;