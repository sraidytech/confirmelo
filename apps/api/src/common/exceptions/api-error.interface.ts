/**
 * API Error Interface
 * Defines the structure for consistent error responses across the application
 */

export enum ErrorType {
  AUTHENTICATION_ERROR = 'AUTHENTICATION_ERROR',
  AUTHORIZATION_ERROR = 'AUTHORIZATION_ERROR',
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  RATE_LIMIT_ERROR = 'RATE_LIMIT_ERROR',
  SYSTEM_ERROR = 'SYSTEM_ERROR',
  NOT_FOUND_ERROR = 'NOT_FOUND_ERROR',
  CONFLICT_ERROR = 'CONFLICT_ERROR',
  FORBIDDEN_ERROR = 'FORBIDDEN_ERROR',
}

export interface ApiError {
  type: ErrorType;
  message: string;
  code: string;
  correlationId: string;
  details?: Record<string, any>;
  timestamp: string;
  path?: string;
}

export interface ErrorResponse {
  success: false;
  error: ApiError;
}

export interface ValidationErrorDetail {
  field: string;
  message: string;
  value?: any;
}