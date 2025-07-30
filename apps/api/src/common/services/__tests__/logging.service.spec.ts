/**
 * Logging Service Tests
 * Tests for structured logging functionality
 */

import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { LoggingService } from '../logging.service';
import { ErrorType } from '../../exceptions/api-error.interface';

// Mock Winston
jest.mock('winston', () => ({
  createLogger: jest.fn(() => ({
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
    verbose: jest.fn(),
    log: jest.fn(),
    child: jest.fn(() => ({
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
    })),
  })),
  format: {
    combine: jest.fn(),
    timestamp: jest.fn(),
    errors: jest.fn(),
    json: jest.fn(),
    printf: jest.fn(),
    colorize: jest.fn(),
    simple: jest.fn(),
  },
  transports: {
    Console: jest.fn(),
    File: jest.fn(),
  },
}));

describe('LoggingService', () => {
  let service: LoggingService;
  let configService: jest.Mocked<ConfigService>;
  let mockLogger: any;
  let mockSecurityLogger: any;
  let mockPerformanceLogger: any;

  beforeEach(async () => {
    const mockConfigService = {
      get: jest.fn((key: string, defaultValue?: any) => {
        const config = {
          LOG_LEVEL: 'info',
          NODE_ENV: 'test',
          SLOW_OPERATION_THRESHOLD: '5000',
        };
        return config[key] || defaultValue;
      }),
    };

    mockLogger = {
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
      verbose: jest.fn(),
      log: jest.fn(),
      child: jest.fn(() => ({
        info: jest.fn(),
        error: jest.fn(),
        warn: jest.fn(),
      })),
    };

    mockSecurityLogger = {
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
    };

    mockPerformanceLogger = {
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
    };

    const winston = require('winston');
    winston.createLogger.mockImplementation((config) => {
      if (config.defaultMeta?.service === 'confirmelo-security') {
        return mockSecurityLogger;
      }
      if (config.defaultMeta?.service === 'confirmelo-performance') {
        return mockPerformanceLogger;
      }
      return mockLogger;
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LoggingService,
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
      ],
    }).compile();

    service = module.get<LoggingService>(LoggingService);
    configService = module.get(ConfigService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Standard Logging Methods', () => {
    it('should log info messages', () => {
      service.log('Test message', 'TestContext');

      expect(mockLogger.info).toHaveBeenCalledWith('Test message', { context: 'TestContext' });
    });

    it('should log error messages', () => {
      service.error('Error message', 'Stack trace', 'ErrorContext');

      expect(mockLogger.error).toHaveBeenCalledWith('Error message', {
        trace: 'Stack trace',
        context: 'ErrorContext',
      });
    });

    it('should log warning messages', () => {
      service.warn('Warning message', 'WarnContext');

      expect(mockLogger.warn).toHaveBeenCalledWith('Warning message', { context: 'WarnContext' });
    });

    it('should log debug messages', () => {
      service.debug('Debug message', 'DebugContext');

      expect(mockLogger.debug).toHaveBeenCalledWith('Debug message', { context: 'DebugContext' });
    });

    it('should log verbose messages', () => {
      service.verbose('Verbose message', 'VerboseContext');

      expect(mockLogger.verbose).toHaveBeenCalledWith('Verbose message', { context: 'VerboseContext' });
    });
  });

  describe('Enhanced Logging Methods', () => {
    it('should log with context', () => {
      const context = {
        correlationId: 'test-123',
        userId: 'user-456',
        organizationId: 'org-789',
      };

      service.logWithContext('info', 'Test message', context);

      expect(mockLogger.log).toHaveBeenCalledWith('info', 'Test message', context);
    });

    it('should log info with context', () => {
      const context = { correlationId: 'test-123' };

      service.logInfo('Info message', context);

      expect(mockLogger.info).toHaveBeenCalledWith('Info message', context);
    });

    it('should log error data', () => {
      const errorData = {
        correlationId: 'test-123',
        error: {
          type: ErrorType.AUTHENTICATION_ERROR,
          message: 'Authentication failed',
          code: 'AUTH_001',
          correlationId: 'test-123',
          timestamp: '2024-01-01T00:00:00.000Z',
          path: '/api/auth/login',
        },
        request: {
          method: 'POST',
          url: '/api/auth/login',
          userAgent: 'test-agent',
          ip: '127.0.0.1',
          userId: 'user-123',
          organizationId: 'org-456',
        },
        exception: {
          name: 'Error',
          message: 'Test error',
          stack: 'Error stack',
        },
      };

      service.logError(errorData);

      expect(mockLogger.error).toHaveBeenCalledWith('API Error occurred', {
        correlationId: 'test-123',
        errorType: ErrorType.AUTHENTICATION_ERROR,
        errorCode: 'AUTH_001',
        errorMessage: 'Authentication failed',
        path: '/api/auth/login',
        request: errorData.request,
        exception: errorData.exception,
        timestamp: '2024-01-01T00:00:00.000Z',
      });
    });
  });

  describe('Security Logging', () => {
    it('should log security events', () => {
      const securityData = {
        event: 'LOGIN_ATTEMPT',
        userId: 'user-123',
        organizationId: 'org-456',
        ipAddress: '127.0.0.1',
        userAgent: 'test-agent',
        success: true,
        riskLevel: 'LOW' as const,
        details: { email: 'test@example.com' },
      };

      service.logSecurity(securityData);

      expect(mockSecurityLogger.info).toHaveBeenCalledWith('Security Event', {
        event: 'LOGIN_ATTEMPT',
        userId: 'user-123',
        organizationId: 'org-456',
        ipAddress: '127.0.0.1',
        userAgent: 'test-agent',
        success: true,
        riskLevel: 'LOW',
        details: { email: 'test@example.com' },
        timestamp: expect.any(String),
      });
    });

    it('should log high-risk events to main logger', () => {
      const securityData = {
        event: 'BRUTE_FORCE_ATTACK',
        userId: 'user-123',
        ipAddress: '127.0.0.1',
        success: false,
        riskLevel: 'HIGH' as const,
      };

      service.logSecurity(securityData);

      expect(mockSecurityLogger.info).toHaveBeenCalled();
      expect(mockLogger.warn).toHaveBeenCalledWith('High-risk security event', {
        event: 'BRUTE_FORCE_ATTACK',
        userId: 'user-123',
        riskLevel: 'HIGH',
        ipAddress: '127.0.0.1',
      });
    });

    it('should log critical events to main logger', () => {
      const securityData = {
        event: 'SYSTEM_BREACH',
        ipAddress: '127.0.0.1',
        success: false,
        riskLevel: 'CRITICAL' as const,
      };

      service.logSecurity(securityData);

      expect(mockLogger.warn).toHaveBeenCalledWith('High-risk security event', {
        event: 'SYSTEM_BREACH',
        userId: undefined,
        riskLevel: 'CRITICAL',
        ipAddress: '127.0.0.1',
      });
    });
  });

  describe('Performance Logging', () => {
    it('should log performance metrics', () => {
      const performanceData = {
        operation: 'database_query',
        duration: 150,
        success: true,
        userId: 'user-123',
        organizationId: 'org-456',
        details: { query: 'SELECT * FROM users' },
      };

      service.logPerformance(performanceData);

      expect(mockPerformanceLogger.info).toHaveBeenCalledWith('Performance Metric', {
        operation: 'database_query',
        duration: 150,
        success: true,
        userId: 'user-123',
        organizationId: 'org-456',
        details: { query: 'SELECT * FROM users' },
        timestamp: expect.any(String),
      });
    });

    it('should log slow operations to main logger', () => {
      const performanceData = {
        operation: 'slow_database_query',
        duration: 6000, // Above threshold
        success: true,
      };

      service.logPerformance(performanceData);

      expect(mockPerformanceLogger.info).toHaveBeenCalled();
      expect(mockLogger.warn).toHaveBeenCalledWith('Slow operation detected', {
        operation: 'slow_database_query',
        duration: 6000,
        threshold: 5000,
      });
    });
  });

  describe('Authentication-Specific Logging', () => {
    it('should log successful authentication attempts', () => {
      service.logAuthenticationAttempt(
        true,
        'test@example.com',
        '127.0.0.1',
        'test-agent',
        'user-123'
      );

      expect(mockSecurityLogger.info).toHaveBeenCalledWith('Security Event', {
        event: 'AUTHENTICATION_ATTEMPT',
        userId: 'user-123',
        ipAddress: '127.0.0.1',
        userAgent: 'test-agent',
        success: true,
        riskLevel: 'LOW',
        details: {
          email: 'te***@example.com',
          reason: undefined,
        },
        timestamp: expect.any(String),
      });
    });

    it('should log failed authentication attempts', () => {
      service.logAuthenticationAttempt(
        false,
        'test@example.com',
        '127.0.0.1',
        'test-agent',
        undefined,
        'Invalid password'
      );

      expect(mockSecurityLogger.info).toHaveBeenCalledWith('Security Event', {
        event: 'AUTHENTICATION_ATTEMPT',
        userId: undefined,
        ipAddress: '127.0.0.1',
        userAgent: 'test-agent',
        success: false,
        riskLevel: 'MEDIUM',
        details: {
          email: 'te***@example.com',
          reason: 'Invalid password',
        },
        timestamp: expect.any(String),
      });
    });

    it('should log password reset requests', () => {
      service.logPasswordReset('test@example.com', '127.0.0.1', 'test-agent');

      expect(mockSecurityLogger.info).toHaveBeenCalledWith('Security Event', {
        event: 'PASSWORD_RESET_REQUEST',
        ipAddress: '127.0.0.1',
        userAgent: 'test-agent',
        success: true,
        riskLevel: 'MEDIUM',
        details: {
          email: 'te***@example.com',
        },
        timestamp: expect.any(String),
      });
    });

    it('should log account lockouts', () => {
      service.logAccountLockout('user-123', 'test@example.com', '127.0.0.1', 5);

      expect(mockSecurityLogger.info).toHaveBeenCalledWith('Security Event', {
        event: 'ACCOUNT_LOCKOUT',
        userId: 'user-123',
        ipAddress: '127.0.0.1',
        success: false,
        riskLevel: 'HIGH',
        details: {
          email: 'te***@example.com',
          attemptCount: 5,
        },
        timestamp: expect.any(String),
      });
    });

    it('should log suspicious activities', () => {
      service.logSuspiciousActivity(
        'MULTIPLE_FAILED_LOGINS',
        'user-123',
        '127.0.0.1',
        { attemptCount: 10, timeWindow: '5 minutes' }
      );

      expect(mockSecurityLogger.info).toHaveBeenCalledWith('Security Event', {
        event: 'SUSPICIOUS_MULTIPLE_FAILED_LOGINS',
        userId: 'user-123',
        ipAddress: '127.0.0.1',
        success: false,
        riskLevel: 'HIGH',
        details: { attemptCount: 10, timeWindow: '5 minutes' },
        timestamp: expect.any(String),
      });
    });

    it('should log rate limit exceeded events', () => {
      service.logRateLimitExceeded('user-123', '127.0.0.1', '/api/auth/login', 10);

      expect(mockSecurityLogger.info).toHaveBeenCalledWith('Security Event', {
        event: 'RATE_LIMIT_EXCEEDED',
        ipAddress: '127.0.0.1',
        success: false,
        riskLevel: 'MEDIUM',
        details: {
          identifier: 'user-123',
          endpoint: '/api/auth/login',
          limit: 10,
        },
        timestamp: expect.any(String),
      });
    });
  });

  describe('Utility Methods', () => {
    it('should mask email addresses correctly', () => {
      service.logAuthenticationAttempt(true, 'test@example.com', '127.0.0.1');
      
      const call = mockSecurityLogger.info.mock.calls[0][1];
      expect(call.details.email).toBe('te***@example.com');
    });

    it('should mask short email addresses', () => {
      service.logAuthenticationAttempt(true, 'a@example.com', '127.0.0.1');
      
      const call = mockSecurityLogger.info.mock.calls[0][1];
      expect(call.details.email).toBe('a***@example.com');
    });

    it('should create child logger with context', () => {
      const context = { correlationId: 'test-123', userId: 'user-456' };
      
      service.createChildLogger(context);
      
      expect(mockLogger.child).toHaveBeenCalledWith(context);
    });

    it('should report healthy status', () => {
      const isHealthy = service.isHealthy();
      
      expect(isHealthy).toBe(true);
      expect(mockLogger.info).toHaveBeenCalledWith('Health check');
    });

    it('should report unhealthy status on error', () => {
      mockLogger.info.mockImplementation(() => {
        throw new Error('Logger error');
      });
      
      const isHealthy = service.isHealthy();
      
      expect(isHealthy).toBe(false);
    });
  });
});