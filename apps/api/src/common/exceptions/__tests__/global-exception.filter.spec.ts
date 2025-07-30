/**
 * Global Exception Filter Tests
 * Tests for comprehensive error handling and logging
 */

import { Test, TestingModule } from '@nestjs/testing';
import { HttpException, HttpStatus } from '@nestjs/common';
import { ArgumentsHost } from '@nestjs/common';
import { GlobalExceptionFilter } from '../global-exception.filter';
import { LoggingService } from '../../services/logging.service';
import { ErrorMonitoringService } from '../../services/error-monitoring.service';
import { ErrorType } from '../api-error.interface';
import { AuthenticationException, ValidationException } from '../custom-exceptions';

describe('GlobalExceptionFilter', () => {
  let filter: GlobalExceptionFilter;
  let loggingService: jest.Mocked<LoggingService>;
  let errorMonitoringService: jest.Mocked<ErrorMonitoringService>;
  let mockResponse: any;
  let mockRequest: any;
  let mockHost: ArgumentsHost;

  beforeEach(async () => {
    const mockLoggingService = {
      logError: jest.fn(),
    };

    const mockErrorMonitoringService = {
      trackError: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GlobalExceptionFilter,
        {
          provide: LoggingService,
          useValue: mockLoggingService,
        },
        {
          provide: ErrorMonitoringService,
          useValue: mockErrorMonitoringService,
        },
      ],
    }).compile();

    filter = module.get<GlobalExceptionFilter>(GlobalExceptionFilter);
    loggingService = module.get(LoggingService);
    errorMonitoringService = module.get(ErrorMonitoringService);

    // Mock response object
    mockResponse = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
      setHeader: jest.fn().mockReturnThis(),
    };

    // Mock request object
    mockRequest = {
      method: 'POST',
      url: '/api/auth/login',
      get: jest.fn((header: string) => {
        if (header === 'User-Agent') return 'test-agent';
        if (header === 'X-Correlation-ID') return 'test-correlation-id';
        return undefined;
      }),
      connection: { remoteAddress: '127.0.0.1' },
      user: {
        id: 'user-123',
        organizationId: 'org-456',
      },
    };

    // Mock ArgumentsHost
    mockHost = {
      switchToHttp: () => ({
        getResponse: () => mockResponse,
        getRequest: () => mockRequest,
      }),
    } as ArgumentsHost;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Custom Exception Handling', () => {
    it('should handle AuthenticationException correctly', () => {
      const exception = new AuthenticationException('Invalid credentials', 'AUTH_001');

      filter.catch(exception, mockHost);

      expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.UNAUTHORIZED);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        error: expect.objectContaining({
          type: ErrorType.AUTHENTICATION_ERROR,
          message: 'Invalid credentials',
          code: 'AUTH_001',
          correlationId: 'test-correlation-id',
          timestamp: expect.any(String),
          path: '/api/auth/login',
        }),
      });
    });

    it('should handle ValidationException with details', () => {
      const validationErrors = [
        { field: 'email', message: 'Email is required', value: '' },
        { field: 'password', message: 'Password is too weak', value: '123' },
      ];
      const exception = new ValidationException('Validation failed', 'VAL_001', validationErrors);

      filter.catch(exception, mockHost);

      expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        error: expect.objectContaining({
          type: ErrorType.VALIDATION_ERROR,
          message: 'Validation failed',
          code: 'VAL_001',
          details: { validationErrors },
        }),
      });
    });
  });

  describe('Standard HTTP Exception Handling', () => {
    it('should handle standard HttpException', () => {
      const exception = new HttpException('Not found', HttpStatus.NOT_FOUND);

      filter.catch(exception, mockHost);

      expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.NOT_FOUND);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        error: expect.objectContaining({
          type: ErrorType.NOT_FOUND_ERROR,
          message: 'Not found',
          code: 'NOT_FOUND_001',
        }),
      });
    });

    it('should handle HttpException with object response', () => {
      const exceptionResponse = {
        message: ['email must be an email', 'password is too weak'],
        error: 'Bad Request',
        statusCode: 400,
      };
      const exception = new HttpException(exceptionResponse, HttpStatus.BAD_REQUEST);

      filter.catch(exception, mockHost);

      expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        error: expect.objectContaining({
          type: ErrorType.VALIDATION_ERROR,
          message: 'email must be an email, password is too weak',
          code: 'VAL_001',
        }),
      });
    });
  });

  describe('Unexpected Error Handling', () => {
    it('should handle unexpected Error', () => {
      const exception = new Error('Database connection failed');

      filter.catch(exception, mockHost);

      expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        error: expect.objectContaining({
          type: ErrorType.SYSTEM_ERROR,
          message: 'An unexpected error occurred. Please try again later.',
          code: 'SYS_001',
        }),
      });
    });

    it('should handle non-Error exceptions', () => {
      const exception = 'String error';

      filter.catch(exception, mockHost);

      expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        error: expect.objectContaining({
          type: ErrorType.SYSTEM_ERROR,
          message: 'An unexpected error occurred. Please try again later.',
          code: 'SYS_001',
        }),
      });
    });
  });

  describe('Logging and Monitoring', () => {
    it('should log error with context', () => {
      const exception = new AuthenticationException('Invalid credentials');

      filter.catch(exception, mockHost);

      expect(loggingService.logError).toHaveBeenCalledWith({
        correlationId: 'test-correlation-id',
        error: expect.objectContaining({
          type: ErrorType.AUTHENTICATION_ERROR,
          message: 'Invalid credentials',
        }),
        request: {
          method: 'POST',
          url: '/api/auth/login',
          userAgent: 'test-agent',
          ip: '127.0.0.1',
          userId: 'user-123',
          organizationId: 'org-456',
        },
        exception: expect.objectContaining({
          name: 'AuthenticationException',
          message: 'Invalid credentials',
        }),
      });
    });

    it('should track error for monitoring', () => {
      const exception = new AuthenticationException('Invalid credentials');

      filter.catch(exception, mockHost);

      expect(errorMonitoringService.trackError).toHaveBeenCalledWith(
        expect.objectContaining({
          type: ErrorType.AUTHENTICATION_ERROR,
          message: 'Invalid credentials',
        }),
        '/api/auth/login',
        'user-123'
      );
    });

    it('should log exception details for unexpected errors', () => {
      const exception = new Error('Database connection failed');
      exception.stack = 'Error stack trace';

      filter.catch(exception, mockHost);

      expect(loggingService.logError).toHaveBeenCalledWith({
        correlationId: expect.any(String),
        error: expect.any(Object),
        request: expect.any(Object),
        exception: {
          name: 'Error',
          message: 'Database connection failed',
          stack: 'Error stack trace',
        },
      });
    });
  });

  describe('Correlation ID Handling', () => {
    it('should use correlation ID from request header', () => {
      const exception = new AuthenticationException('Invalid credentials');

      filter.catch(exception, mockHost);

      expect(mockResponse.setHeader).toHaveBeenCalledWith('X-Correlation-ID', 'test-correlation-id');
    });

    it('should generate correlation ID when not provided', () => {
      mockRequest.get = jest.fn().mockReturnValue(undefined);
      const exception = new AuthenticationException('Invalid credentials');

      filter.catch(exception, mockHost);

      expect(mockResponse.setHeader).toHaveBeenCalledWith('X-Correlation-ID', expect.any(String));
    });
  });

  describe('Message Sanitization', () => {
    it('should sanitize sensitive information from error messages', () => {
      const exception = new Error('Password validation failed for password: secret123');

      filter.catch(exception, mockHost);

      const errorResponse = mockResponse.json.mock.calls[0][0];
      // For unexpected errors, the message is sanitized to a generic message
      expect(errorResponse.error.message).toBe('An unexpected error occurred. Please try again later.');
      expect(errorResponse.error.message).not.toContain('secret123');
    });
  });

  describe('Client IP Detection', () => {
    it('should detect IP from X-Forwarded-For header', () => {
      mockRequest.get = jest.fn((header: string) => {
        if (header === 'X-Forwarded-For') return '192.168.1.1';
        return undefined;
      });
      const exception = new AuthenticationException('Invalid credentials');

      filter.catch(exception, mockHost);

      expect(loggingService.logError).toHaveBeenCalledWith(
        expect.objectContaining({
          request: expect.objectContaining({
            ip: '192.168.1.1',
          }),
        })
      );
    });

    it('should fallback to connection.remoteAddress', () => {
      mockRequest.get = jest.fn().mockReturnValue(undefined);
      mockRequest.connection = { remoteAddress: '10.0.0.1' };
      const exception = new AuthenticationException('Invalid credentials');

      filter.catch(exception, mockHost);

      expect(loggingService.logError).toHaveBeenCalledWith(
        expect.objectContaining({
          request: expect.objectContaining({
            ip: '10.0.0.1',
          }),
        })
      );
    });
  });
});