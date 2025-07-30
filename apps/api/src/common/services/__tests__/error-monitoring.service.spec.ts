/**
 * Error Monitoring Service Tests
 * Tests for error tracking, metrics, and alerting
 */

import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { ErrorMonitoringService } from '../error-monitoring.service';
import { LoggingService } from '../logging.service';
import { ErrorType } from '../../exceptions/api-error.interface';

describe('ErrorMonitoringService', () => {
  let service: ErrorMonitoringService;
  let configService: jest.Mocked<ConfigService>;
  let loggingService: jest.Mocked<LoggingService>;

  beforeEach(async () => {
    const mockConfigService = {
      get: jest.fn((key: string, defaultValue?: any) => {
        const config = {
          ALERT_ERROR_RATE_THRESHOLD: '10',
          ALERT_ERROR_RATE_WINDOW: '5',
          ALERT_ERROR_RATE_ENABLED: 'true',
          ALERT_CRITICAL_ERROR_THRESHOLD: '3',
          ALERT_CRITICAL_ERROR_WINDOW: '1',
          ALERT_CRITICAL_ERROR_ENABLED: 'true',
          ALERT_ENDPOINT_ERROR_THRESHOLD: '5',
          ALERT_ENDPOINT_ERROR_WINDOW: '5',
          ALERT_ENDPOINT_ERROR_ENABLED: 'true',
          ALERT_AUTH_FAILURE_THRESHOLD: '5',
          ALERT_AUTH_FAILURE_WINDOW: '5',
          ALERT_AUTH_FAILURE_ENABLED: 'true',
          ERROR_CLEANUP_INTERVAL: '1000', // 1 second for testing
          ERROR_RETENTION_PERIOD: '5000', // 5 seconds for testing
        };
        return config[key] || defaultValue;
      }),
    };

    const mockLoggingService = {
      logWithContext: jest.fn(),
      logSecurity: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ErrorMonitoringService,
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
        {
          provide: LoggingService,
          useValue: mockLoggingService,
        },
      ],
    }).compile();

    service = module.get<ErrorMonitoringService>(ErrorMonitoringService);
    configService = module.get(ConfigService);
    loggingService = module.get(LoggingService);

    // Clear any existing data
    service.resetMetrics();
  });

  afterEach(() => {
    jest.clearAllMocks();
    service.resetMetrics();
  });

  describe('Error Tracking', () => {
    it('should track error occurrences', () => {
      const error = {
        type: ErrorType.AUTHENTICATION_ERROR,
        message: 'Invalid credentials',
        code: 'AUTH_001',
        correlationId: 'test-123',
        timestamp: new Date().toISOString(),
      };

      service.trackError(error, '/api/auth/login', 'user-123');

      const metrics = service.getErrorMetrics();
      expect(metrics.totalErrors).toBe(1);
      expect(metrics.errorsByType[ErrorType.AUTHENTICATION_ERROR]).toBe(1);
      expect(metrics.errorsByCode['AUTH_001']).toBe(1);
      expect(metrics.errorsByEndpoint['/api/auth/login']).toBe(1);
    });

    it('should track multiple errors correctly', () => {
      const authError = {
        type: ErrorType.AUTHENTICATION_ERROR,
        message: 'Invalid credentials',
        code: 'AUTH_001',
        correlationId: 'test-123',
        timestamp: new Date().toISOString(),
      };

      const validationError = {
        type: ErrorType.VALIDATION_ERROR,
        message: 'Validation failed',
        code: 'VAL_001',
        correlationId: 'test-456',
        timestamp: new Date().toISOString(),
      };

      service.trackError(authError, '/api/auth/login', 'user-123');
      service.trackError(validationError, '/api/users/create', 'user-456');
      service.trackError(authError, '/api/auth/login', 'user-789');

      const metrics = service.getErrorMetrics();
      expect(metrics.totalErrors).toBe(3);
      expect(metrics.errorsByType[ErrorType.AUTHENTICATION_ERROR]).toBe(2);
      expect(metrics.errorsByType[ErrorType.VALIDATION_ERROR]).toBe(1);
      expect(metrics.errorsByCode['AUTH_001']).toBe(2);
      expect(metrics.errorsByCode['VAL_001']).toBe(1);
    });

    it('should log error tracking', () => {
      const error = {
        type: ErrorType.SYSTEM_ERROR,
        message: 'Database error',
        code: 'SYS_001',
        correlationId: 'test-123',
        timestamp: new Date().toISOString(),
      };

      service.trackError(error, '/api/users/list', 'user-123');

      expect(loggingService.logWithContext).toHaveBeenCalledWith('info', 'Error tracked', {
        errorType: ErrorType.SYSTEM_ERROR,
        errorCode: 'SYS_001',
        endpoint: '/api/users/list',
        userId: 'user-123',
        correlationId: 'test-123',
      });
    });
  });

  describe('Error Metrics', () => {
    it('should return correct error metrics', () => {
      // Track various errors
      const errors = [
        { type: ErrorType.AUTHENTICATION_ERROR, code: 'AUTH_001' },
        { type: ErrorType.AUTHENTICATION_ERROR, code: 'AUTH_002' },
        { type: ErrorType.VALIDATION_ERROR, code: 'VAL_001' },
        { type: ErrorType.SYSTEM_ERROR, code: 'SYS_001' },
      ];

      errors.forEach((error, index) => {
        service.trackError({
          ...error,
          message: 'Test error',
          correlationId: `test-${index}`,
          timestamp: new Date().toISOString(),
        }, `/api/endpoint${index}`, `user-${index}`);
      });

      const metrics = service.getErrorMetrics();

      expect(metrics.totalErrors).toBe(4);
      expect(metrics.errorsByType[ErrorType.AUTHENTICATION_ERROR]).toBe(2);
      expect(metrics.errorsByType[ErrorType.VALIDATION_ERROR]).toBe(1);
      expect(metrics.errorsByType[ErrorType.SYSTEM_ERROR]).toBe(1);
      expect(metrics.criticalErrors).toBe(3); // AUTH + SYSTEM errors
      expect(metrics.errorsByCode['AUTH_001']).toBe(1);
      expect(metrics.errorsByCode['AUTH_002']).toBe(1);
      expect(metrics.errorsByCode['VAL_001']).toBe(1);
      expect(metrics.errorsByCode['SYS_001']).toBe(1);
    });

    it('should calculate last hour errors correctly', () => {
      const now = Date.now();
      const twoHoursAgo = now - (2 * 60 * 60 * 1000);
      const thirtyMinutesAgo = now - (30 * 60 * 1000);

      // Mock timestamps for testing
      const service_any = service as any;
      service_any.errorTimestamps.set('test-key', [twoHoursAgo, thirtyMinutesAgo, now]);

      const metrics = service.getErrorMetrics();
      expect(metrics.lastHourErrors).toBe(2); // Only last two timestamps
    });
  });

  describe('Alert Thresholds', () => {
    beforeEach(() => {
      // Mock console.warn to avoid noise in tests
      jest.spyOn(console, 'warn').mockImplementation();
    });

    afterEach(() => {
      jest.restoreAllMocks();
    });

    it('should trigger error rate alert', () => {
      // Track enough errors to exceed threshold
      for (let i = 0; i < 15; i++) {
        service.trackError({
          type: ErrorType.VALIDATION_ERROR,
          message: 'Test error',
          code: 'VAL_001',
          correlationId: `test-${i}`,
          timestamp: new Date().toISOString(),
        });
      }

      expect(loggingService.logSecurity).toHaveBeenCalledWith({
        event: 'ERROR_THRESHOLD_EXCEEDED',
        userId: undefined,
        ipAddress: 'system',
        success: false,
        riskLevel: 'HIGH',
        details: expect.objectContaining({
          type: 'error_rate',
          threshold: 10,
        }),
      });
    });

    it('should trigger critical error alert', () => {
      // Track critical errors
      for (let i = 0; i < 5; i++) {
        service.trackError({
          type: ErrorType.SYSTEM_ERROR,
          message: 'Critical error',
          code: 'SYS_001',
          correlationId: `test-${i}`,
          timestamp: new Date().toISOString(),
        });
      }

      expect(loggingService.logSecurity).toHaveBeenCalledWith({
        event: 'ERROR_THRESHOLD_EXCEEDED',
        userId: undefined,
        ipAddress: 'system',
        success: false,
        riskLevel: 'HIGH',
        details: expect.objectContaining({
          type: 'critical_error',
          threshold: 3,
        }),
      });
    });

    it('should trigger endpoint error alert', () => {
      const endpoint = '/api/test/endpoint';

      // Track errors for specific endpoint
      for (let i = 0; i < 7; i++) {
        service.trackError({
          type: ErrorType.VALIDATION_ERROR,
          message: 'Endpoint error',
          code: 'VAL_001',
          correlationId: `test-${i}`,
          timestamp: new Date().toISOString(),
        }, endpoint);
      }

      expect(loggingService.logSecurity).toHaveBeenCalledWith({
        event: 'ERROR_THRESHOLD_EXCEEDED',
        userId: undefined,
        ipAddress: 'system',
        success: false,
        riskLevel: 'HIGH',
        details: expect.objectContaining({
          type: 'endpoint_errors',
          threshold: 5,
          endpoint,
        }),
      });
    });

    it('should trigger authentication failure alert', () => {
      // Track authentication failures
      for (let i = 0; i < 7; i++) {
        service.trackError({
          type: ErrorType.AUTHENTICATION_ERROR,
          message: 'Auth failed',
          code: 'AUTH_001',
          correlationId: `test-${i}`,
          timestamp: new Date().toISOString(),
        });
      }

      expect(loggingService.logSecurity).toHaveBeenCalledWith({
        event: 'ERROR_THRESHOLD_EXCEEDED',
        userId: undefined,
        ipAddress: 'system',
        success: false,
        riskLevel: 'HIGH',
        details: expect.objectContaining({
          type: 'authentication_failures',
          threshold: 5,
        }),
      });
    });

    it('should not trigger alerts when disabled', async () => {
      configService.get.mockImplementation((key: string, defaultValue?: any) => {
        if (key === 'ALERT_ERROR_RATE_ENABLED') return 'false';
        return defaultValue;
      });

      // Recreate service with disabled alerts
      const module = await Test.createTestingModule({
        providers: [
          ErrorMonitoringService,
          { provide: ConfigService, useValue: configService },
          { provide: LoggingService, useValue: loggingService },
        ],
      }).compile();

      const newService = module.get<ErrorMonitoringService>(ErrorMonitoringService);

      // Track many errors
      for (let i = 0; i < 20; i++) {
        newService.trackError({
          type: ErrorType.VALIDATION_ERROR,
          message: 'Test error',
          code: 'VAL_001',
          correlationId: `test-${i}`,
          timestamp: new Date().toISOString(),
        });
      }

      // Should not trigger alert
      expect(loggingService.logSecurity).not.toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'ERROR_THRESHOLD_EXCEEDED',
        })
      );
    });
  });

  describe('Health Status', () => {
    it('should return healthy status with low error counts', () => {
      // Track a few errors
      for (let i = 0; i < 3; i++) {
        service.trackError({
          type: ErrorType.VALIDATION_ERROR,
          message: 'Test error',
          code: 'VAL_001',
          correlationId: `test-${i}`,
          timestamp: new Date().toISOString(),
        });
      }

      const health = service.getHealthStatus();
      expect(health.healthy).toBe(true);
      expect(health.metrics.totalErrors).toBe(3);
    });

    it('should return unhealthy status with high critical error counts', () => {
      // Track many critical errors
      for (let i = 0; i < 15; i++) {
        service.trackError({
          type: ErrorType.SYSTEM_ERROR,
          message: 'Critical error',
          code: 'SYS_001',
          correlationId: `test-${i}`,
          timestamp: new Date().toISOString(),
        });
      }

      const health = service.getHealthStatus();
      expect(health.healthy).toBe(false);
      expect(health.metrics.criticalErrors).toBe(15);
    });

    it('should return unhealthy status with high hourly error rate', () => {
      // Track many errors in the last hour
      for (let i = 0; i < 150; i++) {
        service.trackError({
          type: ErrorType.VALIDATION_ERROR,
          message: 'Test error',
          code: 'VAL_001',
          correlationId: `test-${i}`,
          timestamp: new Date().toISOString(),
        });
      }

      const health = service.getHealthStatus();
      expect(health.healthy).toBe(false);
      expect(health.metrics.lastHourErrors).toBe(150);
    });
  });

  describe('Metrics Reset', () => {
    it('should reset all metrics', () => {
      // Track some errors
      service.trackError({
        type: ErrorType.AUTHENTICATION_ERROR,
        message: 'Test error',
        code: 'AUTH_001',
        correlationId: 'test-123',
        timestamp: new Date().toISOString(),
      });

      let metrics = service.getErrorMetrics();
      expect(metrics.totalErrors).toBe(1);

      // Reset metrics
      service.resetMetrics();

      metrics = service.getErrorMetrics();
      expect(metrics.totalErrors).toBe(0);
      expect(metrics.errorsByType[ErrorType.AUTHENTICATION_ERROR]).toBe(0);
    });
  });
});