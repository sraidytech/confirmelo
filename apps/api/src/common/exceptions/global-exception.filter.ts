/**
 * Global Exception Filter
 * Handles all exceptions thrown in the application and formats them consistently
 */

import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { ErrorType, ApiError, ErrorResponse } from './api-error.interface';
import { LoggingService } from '../services/logging.service';
import { ErrorMonitoringService } from '../services/error-monitoring.service';

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  constructor(
    private readonly loggingService: LoggingService,
    private readonly errorMonitoringService: ErrorMonitoringService
  ) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    
    const correlationId = this.getCorrelationId(request);
    const timestamp = new Date().toISOString();
    const path = request.url;

    let status: HttpStatus;
    let apiError: ApiError;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const exceptionResponse = exception.getResponse();
      
      if (this.isCustomException(exceptionResponse)) {
        // Handle our custom exceptions
        apiError = {
          ...(exceptionResponse as any),
          correlationId,
          timestamp,
          path,
        } as ApiError;
      } else {
        // Handle standard NestJS exceptions
        apiError = this.createStandardApiError(
          exceptionResponse,
          status,
          correlationId,
          timestamp,
          path
        );
      }
    } else {
      // Handle unexpected errors
      status = HttpStatus.INTERNAL_SERVER_ERROR;
      apiError = this.createSystemError(correlationId, timestamp, path);
      
      // Log the full error for debugging
      this.logger.error(
        `Unexpected error: ${exception instanceof Error ? exception.message : 'Unknown error'}`,
        exception instanceof Error ? exception.stack : undefined,
        { correlationId, path }
      );
    }

    // Log the error with context
    this.loggingService.logError({
      correlationId,
      error: apiError,
      request: {
        method: request.method,
        url: request.url,
        userAgent: request.get('User-Agent'),
        ip: this.getClientIp(request),
        userId: (request as any).user?.id,
        organizationId: (request as any).user?.organizationId,
      },
      exception: exception instanceof Error ? {
        name: exception.name,
        message: exception.message,
        stack: exception.stack,
      } : undefined,
    });

    // Track error for monitoring and alerting
    this.errorMonitoringService.trackError(
      apiError,
      request.url,
      (request as any).user?.id
    );

    const errorResponse: ErrorResponse = {
      success: false,
      error: apiError,
    };

    // Set correlation ID header for client tracking
    response.setHeader('X-Correlation-ID', correlationId);
    response.status(status).json(errorResponse);
  }

  private getCorrelationId(request: Request): string {
    // Try to get correlation ID from header, otherwise generate new one
    return (request.get('X-Correlation-ID') as string) || uuidv4();
  }

  private getClientIp(request: Request): string {
    return (
      request.get('X-Forwarded-For') ||
      request.get('X-Real-IP') ||
      request.connection.remoteAddress ||
      request.socket.remoteAddress ||
      'unknown'
    );
  }

  private isCustomException(response: any): boolean {
    return (
      typeof response === 'object' &&
      response.type &&
      Object.values(ErrorType).includes(response.type)
    );
  }

  private createStandardApiError(
    exceptionResponse: any,
    status: HttpStatus,
    correlationId: string,
    timestamp: string,
    path: string
  ): ApiError {
    const message = typeof exceptionResponse === 'string' 
      ? exceptionResponse 
      : exceptionResponse.message || 'An error occurred';

    let errorType: ErrorType;
    let code: string;

    switch (status) {
      case HttpStatus.UNAUTHORIZED:
        errorType = ErrorType.AUTHENTICATION_ERROR;
        code = 'AUTH_001';
        break;
      case HttpStatus.FORBIDDEN:
        errorType = ErrorType.AUTHORIZATION_ERROR;
        code = 'AUTH_002';
        break;
      case HttpStatus.BAD_REQUEST:
        errorType = ErrorType.VALIDATION_ERROR;
        code = 'VAL_001';
        break;
      case HttpStatus.NOT_FOUND:
        errorType = ErrorType.NOT_FOUND_ERROR;
        code = 'NOT_FOUND_001';
        break;
      case HttpStatus.CONFLICT:
        errorType = ErrorType.CONFLICT_ERROR;
        code = 'CONFLICT_001';
        break;
      case HttpStatus.TOO_MANY_REQUESTS:
        errorType = ErrorType.RATE_LIMIT_ERROR;
        code = 'RATE_001';
        break;
      default:
        errorType = ErrorType.SYSTEM_ERROR;
        code = 'SYS_001';
    }

    return {
      type: errorType,
      message: this.sanitizeErrorMessage(message),
      code,
      correlationId,
      timestamp,
      path,
      details: this.extractErrorDetails(exceptionResponse),
    };
  }

  private createSystemError(
    correlationId: string,
    timestamp: string,
    path: string
  ): ApiError {
    return {
      type: ErrorType.SYSTEM_ERROR,
      message: 'An unexpected error occurred. Please try again later.',
      code: 'SYS_001',
      correlationId,
      timestamp,
      path,
    };
  }

  private sanitizeErrorMessage(message: string | string[]): string {
    // Handle validation error arrays
    if (Array.isArray(message)) {
      return message.join(', ');
    }

    // Remove sensitive information from error messages
    const sensitivePatterns = [
      /password/gi,
      /token/gi,
      /secret/gi,
      /key/gi,
      /credential/gi,
    ];

    let sanitized = message;
    sensitivePatterns.forEach(pattern => {
      sanitized = sanitized.replace(pattern, '[REDACTED]');
    });

    return sanitized;
  }

  private extractErrorDetails(exceptionResponse: any): Record<string, any> | undefined {
    if (typeof exceptionResponse === 'object' && exceptionResponse.details) {
      return exceptionResponse.details;
    }

    // Extract validation errors from class-validator
    if (typeof exceptionResponse === 'object' && exceptionResponse.message && Array.isArray(exceptionResponse.message)) {
      return {
        validationErrors: exceptionResponse.message,
      };
    }

    return undefined;
  }
}