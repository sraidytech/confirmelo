/**
 * Error Handling Integration Tests
 * Tests the complete error handling flow from exception to response
 */

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import * as request from 'supertest';
import { ExceptionsModule } from '../exceptions.module';
import { LoggingService } from '../../services/logging.service';
import { ErrorMonitoringService } from '../../services/error-monitoring.service';
import { Controller, Get, Post, Body } from '@nestjs/common';
import { AuthenticationException, ValidationException } from '../custom-exceptions';
import { JwtAuthGuard } from '../../guards/jwt-auth.guard';
import { RolesGuard } from '../../guards/roles.guard';

// Test controller to trigger different types of errors
@Controller('test-errors')
class TestErrorController {
  @Get('auth-error')
  authError() {
    throw new AuthenticationException('Test authentication error', 'AUTH_TEST_001');
  }

  @Get('validation-error')
  validationError() {
    throw new ValidationException('Test validation error', 'VAL_TEST_001', [
      { field: 'email', message: 'Email is required' },
    ]);
  }

  @Get('system-error')
  systemError() {
    throw new Error('Test system error');
  }

  @Post('validation-pipe-error')
  validationPipeError(@Body() body: any) {
    // This will trigger validation pipe errors
    return { success: true };
  }
}

describe('Error Handling Integration', () => {
  let app: INestApplication;
  let loggingService: LoggingService;
  let errorMonitoringService: ErrorMonitoringService;

  beforeAll(async () => {
    const mockAuthorizationService = {
      checkUserPermissions: jest.fn().mockResolvedValue(true),
      checkResourcePermission: jest.fn().mockResolvedValue(true),
      getUserPermissions: jest.fn().mockResolvedValue([]),
    };

    const mockPrismaService = {
      user: {
        findUnique: jest.fn(),
      },
    };

    const mockRedisService = {
      get: jest.fn(),
      set: jest.fn(),
      del: jest.fn(),
    };

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
        }),
        ExceptionsModule,
      ],
      controllers: [TestErrorController],
      providers: [
        { provide: 'AuthorizationService', useValue: mockAuthorizationService },
        { provide: 'PrismaService', useValue: mockPrismaService },
        { provide: 'RedisService', useValue: mockRedisService },
        { provide: ConfigService, useValue: { get: jest.fn().mockReturnValue('localhost') } },
        { provide: Reflector, useValue: { get: jest.fn(), getAll: jest.fn(), getAllAndOverride: jest.fn(), getAllAndMerge: jest.fn() } },
      ],
    })
    .overrideGuard(JwtAuthGuard)
    .useValue({ canActivate: jest.fn().mockReturnValue(true) })
    .overrideGuard(RolesGuard)
    .useValue({ canActivate: jest.fn().mockReturnValue(true) })
    .compile();

    app = moduleFixture.createNestApplication();
    loggingService = moduleFixture.get<LoggingService>(LoggingService);
    errorMonitoringService = moduleFixture.get<ErrorMonitoringService>(ErrorMonitoringService);

    // Mock console methods to avoid noise in tests
    jest.spyOn(console, 'log').mockImplementation();
    jest.spyOn(console, 'error').mockImplementation();
    jest.spyOn(console, 'warn').mockImplementation();

    await app.init();
  });

  afterAll(async () => {
    await app.close();
    jest.restoreAllMocks();
  });

  beforeEach(() => {
    // Reset error monitoring metrics
    errorMonitoringService.resetMetrics();
  });

  describe('Custom Exception Handling', () => {
    it('should handle AuthenticationException with proper response format', async () => {
      const response = await request(app.getHttpServer())
        .get('/test-errors/auth-error')
        .expect(401);

      expect(response.body).toEqual({
        success: false,
        error: {
          type: 'AUTHENTICATION_ERROR',
          message: 'Test authentication error',
          code: 'AUTH_TEST_001',
          correlationId: expect.any(String),
          timestamp: expect.any(String),
          path: '/test-errors/auth-error',
          details: undefined,
        },
      });

      expect(response.headers['x-correlation-id']).toBeDefined();
    });

    it('should handle ValidationException with validation details', async () => {
      const response = await request(app.getHttpServer())
        .get('/test-errors/validation-error')
        .expect(400);

      expect(response.body).toEqual({
        success: false,
        error: {
          type: 'VALIDATION_ERROR',
          message: 'Test validation error',
          code: 'VAL_TEST_001',
          correlationId: expect.any(String),
          timestamp: expect.any(String),
          path: '/test-errors/validation-error',
          details: {
            validationErrors: [
              { field: 'email', message: 'Email is required' },
            ],
          },
        },
      });
    });

    it('should handle unexpected errors with sanitized response', async () => {
      const response = await request(app.getHttpServer())
        .get('/test-errors/system-error')
        .expect(500);

      expect(response.body).toEqual({
        success: false,
        error: {
          type: 'SYSTEM_ERROR',
          message: 'An unexpected error occurred. Please try again later.',
          code: 'SYS_001',
          correlationId: expect.any(String),
          timestamp: expect.any(String),
          path: '/test-errors/system-error',
        },
      });
    });
  });

  describe('Error Monitoring Integration', () => {
    it('should track errors in monitoring service', async () => {
      // Trigger multiple errors
      await request(app.getHttpServer()).get('/test-errors/auth-error').expect(401);
      await request(app.getHttpServer()).get('/test-errors/validation-error').expect(400);
      await request(app.getHttpServer()).get('/test-errors/system-error').expect(500);

      // Check metrics
      const metrics = errorMonitoringService.getErrorMetrics();
      expect(metrics.totalErrors).toBe(3);
      expect(metrics.errorsByType['AUTHENTICATION_ERROR']).toBe(1);
      expect(metrics.errorsByType['VALIDATION_ERROR']).toBe(1);
      expect(metrics.errorsByType['SYSTEM_ERROR']).toBe(1);
    });

    it('should maintain correlation IDs across requests', async () => {
      const correlationId = 'test-correlation-123';

      const response = await request(app.getHttpServer())
        .get('/test-errors/auth-error')
        .set('X-Correlation-ID', correlationId)
        .expect(401);

      expect(response.headers['x-correlation-id']).toBe(correlationId);
      expect(response.body.error.correlationId).toBe(correlationId);
    });

    it('should generate correlation ID when not provided', async () => {
      const response = await request(app.getHttpServer())
        .get('/test-errors/auth-error')
        .expect(401);

      const correlationId = response.headers['x-correlation-id'];
      expect(correlationId).toBeDefined();
      expect(correlationId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
      expect(response.body.error.correlationId).toBe(correlationId);
    });
  });

  describe('Error Response Consistency', () => {
    it('should always return consistent error response structure', async () => {
      const endpoints = [
        '/test-errors/auth-error',
        '/test-errors/validation-error',
        '/test-errors/system-error',
      ];

      for (const endpoint of endpoints) {
        const response = await request(app.getHttpServer()).get(endpoint);

        expect(response.body).toHaveProperty('success', false);
        expect(response.body).toHaveProperty('error');
        expect(response.body.error).toHaveProperty('type');
        expect(response.body.error).toHaveProperty('message');
        expect(response.body.error).toHaveProperty('code');
        expect(response.body.error).toHaveProperty('correlationId');
        expect(response.body.error).toHaveProperty('timestamp');
        expect(response.body.error).toHaveProperty('path');
      }
    });

    it('should include proper HTTP status codes', async () => {
      const testCases = [
        { endpoint: '/test-errors/auth-error', expectedStatus: 401 },
        { endpoint: '/test-errors/validation-error', expectedStatus: 400 },
        { endpoint: '/test-errors/system-error', expectedStatus: 500 },
      ];

      for (const testCase of testCases) {
        await request(app.getHttpServer())
          .get(testCase.endpoint)
          .expect(testCase.expectedStatus);
      }
    });
  });

  describe('Health Status Integration', () => {
    it('should report healthy status initially', () => {
      const health = errorMonitoringService.getHealthStatus();
      expect(health.healthy).toBe(true);
      expect(health.metrics.totalErrors).toBe(0);
    });

    it('should report unhealthy status after many errors', async () => {
      // Trigger many system errors to exceed health threshold
      const promises = [];
      for (let i = 0; i < 15; i++) {
        promises.push(
          request(app.getHttpServer()).get('/test-errors/system-error').expect(500)
        );
      }
      await Promise.all(promises);

      const health = errorMonitoringService.getHealthStatus();
      expect(health.healthy).toBe(false);
      expect(health.metrics.criticalErrors).toBeGreaterThanOrEqual(15);
    });
  });
});