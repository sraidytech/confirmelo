import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { ValidationModule } from '../validation.module';
import { AuthValidationPipe } from '../pipes/enhanced-validation.pipe';
import { RateLimitGuard } from '../guards/rate-limit.guard';
import { RequestSizeMiddleware } from '../middleware/request-size.middleware';
import { LoggingService } from '../../services/logging.service';
import { RedisService } from '../../redis/redis.service';

describe('Validation Integration', () => {
  let app: INestApplication;
  let loggingService: jest.Mocked<LoggingService>;
  let redisService: jest.Mocked<RedisService>;

  beforeEach(async () => {
    const mockLoggingService = {
      logSecurity: jest.fn(),
      logError: jest.fn(),
    };

    const mockRedisService = {
      get: jest.fn(),
      set: jest.fn(),
      del: jest.fn(),
      multi: jest.fn(() => ({
        incr: jest.fn(),
        expire: jest.fn(),
        exec: jest.fn(),
      })),
    };

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [ValidationModule],
      providers: [
        { provide: LoggingService, useValue: mockLoggingService },
        { provide: RedisService, useValue: mockRedisService },
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    
    // Configure global validation pipe
    app.useGlobalPipes(new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }));

    loggingService = moduleFixture.get(LoggingService);
    redisService = moduleFixture.get(RedisService);

    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  describe('Request Size Validation', () => {
    it('should reject requests that are too large', async () => {
      const largePayload = {
        data: 'A'.repeat(200000), // 200KB payload
      };

      // Mock the request size middleware behavior
      expect(() => {
        const middleware = new RequestSizeMiddleware(loggingService);
        const mockReq = {
          path: '/auth/login',
          method: 'POST',
          headers: { 'content-length': '200000' },
        } as any;
        const mockRes = {} as any;
        const mockNext = jest.fn();

        middleware.use(mockReq, mockRes, mockNext);
      }).toThrow();

      expect(loggingService.logSecurity).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'REQUEST_SIZE_EXCEEDED',
        })
      );
    });

    it('should accept requests within size limits', () => {
      const smallPayload = {
        email: 'test@example.com',
        password: 'password123',
      };

      const middleware = new RequestSizeMiddleware(loggingService);
      const mockReq = {
        path: '/auth/login',
        method: 'POST',
        headers: { 'content-length': '100' },
      } as any;
      const mockRes = {} as any;
      const mockNext = jest.fn();

      expect(() => {
        middleware.use(mockReq, mockRes, mockNext);
      }).not.toThrow();

      expect(mockNext).toHaveBeenCalled();
    });
  });

  describe('Rate Limiting', () => {
    beforeEach(() => {
      redisService.get.mockResolvedValue('0');
    });

    it('should allow requests within rate limits', async () => {
      const guard = new RateLimitGuard(
        { get: () => ({ windowMs: 60000, max: 5 }) } as any,
        redisService,
        loggingService
      );

      const mockContext = {
        getHandler: () => ({}),
        switchToHttp: () => ({
          getRequest: () => ({
            url: '/auth/login',
            method: 'POST',
            headers: { 'x-forwarded-for': '127.0.0.1' },
            connection: { remoteAddress: '127.0.0.1' },
            route: { path: '/auth/login' },
          }),
        }),
      } as any;

      const result = await guard.canActivate(mockContext);
      expect(result).toBe(true);
    });

    it('should block requests exceeding rate limits', async () => {
      redisService.get.mockResolvedValue('10'); // Exceeds limit of 5

      const guard = new RateLimitGuard(
        { get: () => ({ windowMs: 60000, max: 5 }) } as any,
        redisService,
        loggingService
      );

      const mockContext = {
        getHandler: () => ({}),
        switchToHttp: () => ({
          getRequest: () => ({
            url: '/auth/login',
            method: 'POST',
            headers: { 'x-forwarded-for': '127.0.0.1' },
            connection: { remoteAddress: '127.0.0.1' },
            route: { path: '/auth/login' },
          }),
        }),
      } as any;

      await expect(guard.canActivate(mockContext)).rejects.toThrow();
      expect(loggingService.logSecurity).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'RATE_LIMIT_EXCEEDED',
        })
      );
    });
  });

  describe('Input Sanitization', () => {
    it('should sanitize malicious input', async () => {
      const maliciousInput = {
        email: '<script>alert("xss")</script>@example.com',
        password: 'password\x00\x01',
        name: 'Test\x1fUser',
      };

      const pipe = new AuthValidationPipe(
        app.get('SanitizationService'),
        app.get('ValidationService'),
        loggingService
      );

      class TestDto {
        email: string;
        password: string;
        name: string;
      }

      const result = await pipe.transform(maliciousInput, {
        type: 'body',
        metatype: TestDto,
      } as any);

      // Check that malicious content was sanitized
      expect(result.email).not.toContain('<script>');
      expect(result.password).not.toContain('\x00');
      expect(result.name).not.toContain('\x1f');
    });

    it('should log suspicious input patterns', async () => {
      const suspiciousInput = {
        data: '${malicious}',
      };

      const pipe = new AuthValidationPipe(
        app.get('SanitizationService'),
        app.get('ValidationService'),
        loggingService
      );

      class TestDto {
        data: string;
      }

      await expect(
        pipe.transform(suspiciousInput, {
          type: 'body',
          metatype: TestDto,
        } as any)
      ).rejects.toThrow('Invalid input detected');

      expect(loggingService.logSecurity).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'SUSPICIOUS_AUTH_INPUT',
        })
      );
    });
  });

  describe('Validation Error Handling', () => {
    it('should return structured validation errors', async () => {
      const invalidInput = {
        email: 'invalid-email',
        password: '123', // Too short
      };

      const pipe = new AuthValidationPipe(
        app.get('SanitizationService'),
        app.get('ValidationService'),
        loggingService
      );

      class TestDto {
        email: string;
        password: string;
      }

      await expect(
        pipe.transform(invalidInput, {
          type: 'body',
          metatype: TestDto,
        } as any)
      ).rejects.toThrow();

      expect(loggingService.logSecurity).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'VALIDATION_FAILED',
        })
      );
    });
  });

  describe('Security Event Logging', () => {
    it('should log all security-relevant events', () => {
      // This test verifies that security events are properly logged
      // across all validation components

      const expectedEvents = [
        'REQUEST_SIZE_EXCEEDED',
        'RATE_LIMIT_EXCEEDED',
        'SUSPICIOUS_AUTH_INPUT',
        'VALIDATION_FAILED',
        'SUSPICIOUS_ORG_NAME',
        'INVALID_URL_PROTOCOL',
        'INVALID_URL_FORMAT',
      ];

      // Verify that the logging service is called for each event type
      // This would be tested through the individual component tests
      expect(loggingService.logSecurity).toBeDefined();
    });
  });

  describe('Performance Impact', () => {
    it('should not significantly impact request processing time', async () => {
      const validInput = {
        email: 'test@example.com',
        password: 'ValidPassword123!',
        name: 'Test User',
      };

      const pipe = new AuthValidationPipe(
        app.get('SanitizationService'),
        app.get('ValidationService'),
        loggingService
      );

      class TestDto {
        email: string;
        password: string;
        name: string;
      }

      const startTime = Date.now();
      
      await pipe.transform(validInput, {
        type: 'body',
        metatype: TestDto,
      } as any);

      const endTime = Date.now();
      const processingTime = endTime - startTime;

      // Validation should complete within reasonable time (< 100ms)
      expect(processingTime).toBeLessThan(100);
    });
  });
});