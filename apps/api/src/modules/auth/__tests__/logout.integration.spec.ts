import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as request from 'supertest';
import { AuthController } from '../auth.controller';
import { PrismaService } from '../../../common/database/prisma.service';
import { RedisService } from '../../../common/redis/redis.service';
import { RealtimeNotificationService } from '../../websocket/services/realtime-notification.service';
import { WebsocketGateway } from '../../websocket/websocket.gateway';
import { SessionManagementService } from '../services/session-management.service';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { LoggingService } from '../../../common/services/logging.service';
import { RateLimitGuard } from '../../../common/validation/guards/rate-limit.guard';
import { ValidationService } from '../../../common/validation/validation.service';
import { SanitizationService } from '../../../common/validation/sanitization.service';

describe('AuthController - Logout Integration Tests', () => {
  let app: INestApplication;
  let prismaService: PrismaService;
  let redisService: RedisService;
  let jwtService: JwtService;
  let authToken: string;

  const mockUser = {
    id: 'user-123',
    email: 'test@example.com',
    firstName: 'Test',
    lastName: 'User',
    role: 'ADMIN',
    status: 'ACTIVE',
    organizationId: 'org-123',
    isOnline: true,
    lastActiveAt: new Date(),
  };

  const mockSession = {
    id: 'session-123',
    sessionToken: 'session-token-123',
    userId: 'user-123',
    expiresAt: new Date(Date.now() + 3600000),
    ipAddress: '127.0.0.1',
    userAgent: 'test-agent',
    createdAt: new Date(),
  };

  const mockLoggingService = {
    log: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
    verbose: jest.fn(),
    logSecurity: jest.fn(),
    logError: jest.fn(),
    logPerformance: jest.fn(),
  };

  const mockValidationService = {
    validatePasswordStrength: jest.fn(),
    validateEmail: jest.fn(),
    validateUsername: jest.fn(),
    validatePhoneNumber: jest.fn(),
    validateOrganizationName: jest.fn(),
    validateUrl: jest.fn(),
    validateRequestSize: jest.fn().mockReturnValue({ isValid: true, sizeKB: 1 }),
    validateSessionId: jest.fn(),
  };

  const mockSanitizationService = {
    sanitizeString: jest.fn().mockImplementation((str) => str),
    sanitizeEmail: jest.fn().mockImplementation((email) => email),
    sanitizePhoneNumber: jest.fn().mockImplementation((phone) => phone),
    sanitizeUrl: jest.fn().mockImplementation((url) => url),
    sanitizeUsername: jest.fn().mockImplementation((username) => username),
    sanitizeOrganizationName: jest.fn().mockImplementation((name) => name),
    sanitizeAddress: jest.fn().mockImplementation((address) => address),
    sanitizeTaxId: jest.fn().mockImplementation((taxId) => taxId),
    sanitizeSessionId: jest.fn().mockImplementation((sessionId) => sessionId),
    sanitizeCorrelationId: jest.fn().mockImplementation((correlationId) => correlationId),
    sanitizeObject: jest.fn().mockImplementation((obj) => obj),
    sanitizeForLogging: jest.fn().mockImplementation((obj) => obj),
  };

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        {
          provide: PrismaService,
          useValue: {
            session: {
              findMany: jest.fn(),
              deleteMany: jest.fn(),
            },
            user: {
              findUnique: jest.fn(),
              update: jest.fn(),
            },
          },
        },
        {
          provide: RedisService,
          useValue: {
            deleteSession: jest.fn(),
            set: jest.fn(),
            del: jest.fn(),
            exists: jest.fn().mockResolvedValue(false),
            getClient: jest.fn().mockReturnValue({
              keys: jest.fn().mockResolvedValue([]),
              del: jest.fn(),
            }),
          },
        },
        {
          provide: JwtService,
          useValue: {
            sign: jest.fn(),
            verify: jest.fn(),
            decode: jest.fn(),
          },
        },
        {
          provide: LoggingService,
          useValue: mockLoggingService,
        },
        {
          provide: ValidationService,
          useValue: mockValidationService,
        },
        {
          provide: SanitizationService,
          useValue: mockSanitizationService,
        },
        {
          provide: RealtimeNotificationService,
          useValue: {
            broadcastSessionUpdate: jest.fn(),
          },
        },
        {
          provide: WebsocketGateway,
          useValue: {
            disconnectUser: jest.fn(),
          },
        },
        {
          provide: SessionManagementService,
          useValue: {
            getUserSessions: jest.fn(),
            terminateSession: jest.fn(),
            getSessionStats: jest.fn(),
            getSessionActivity: jest.fn(),
          },
        },
      ],
    })
      .overrideGuard(RateLimitGuard)
      .useValue({
        canActivate: jest.fn().mockReturnValue(true),
      })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate: (context) => {
          const request = context.switchToHttp().getRequest();
          request.user = mockUser;
          return true;
        },
      })
      .compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    prismaService = moduleFixture.get<PrismaService>(PrismaService);
    redisService = moduleFixture.get<RedisService>(RedisService);
    jwtService = moduleFixture.get<JwtService>(JwtService);
    authToken = 'Bearer mock-jwt-token';
  });

  afterEach(async () => {
    await app.close();
  });

  describe('POST /auth/logout', () => {
    it('should logout from current session successfully', async () => {
      jest.spyOn(prismaService.session, 'deleteMany').mockResolvedValue({ count: 1 });
      jest.spyOn(prismaService.user, 'update').mockResolvedValue(mockUser as any);
      jest.spyOn(prismaService.user, 'findUnique').mockResolvedValue(mockUser as any);
      jest.spyOn(jwtService, 'decode').mockReturnValue({ exp: Math.floor(Date.now() / 1000) + 3600 });

      const response = await request(app.getHttpServer())
        .post('/auth/logout')
        .send({ sessionId: 'session-123' })
        .expect(201);

      expect(response.body).toEqual({
        message: 'Logout successful',
        userId: mockUser.id,
        timestamp: expect.any(String),
      });

      expect(prismaService.session.deleteMany).toHaveBeenCalledWith({
        where: {
          userId: mockUser.id,
          sessionToken: 'session-123',
        },
      });
    });

    it('should logout from all sessions when logoutFromAll is true', async () => {
      const mockSessions = [
        { sessionToken: 'session-1' },
        { sessionToken: 'session-2' },
      ];

      jest.spyOn(prismaService.session, 'findMany').mockResolvedValue(mockSessions as any);
      jest.spyOn(prismaService.session, 'deleteMany').mockResolvedValue({ count: 2 });
      jest.spyOn(prismaService.user, 'update').mockResolvedValue(mockUser as any);
      jest.spyOn(prismaService.user, 'findUnique').mockResolvedValue(mockUser as any);
      jest.spyOn(jwtService, 'decode').mockReturnValue({ exp: Math.floor(Date.now() / 1000) + 3600 });

      const response = await request(app.getHttpServer())
        .post('/auth/logout')
        .send({ logoutFromAll: true })
        .expect(201);

      expect(response.body).toEqual({
        message: 'Successfully logged out from all devices',
        userId: mockUser.id,
        timestamp: expect.any(String),
      });

      expect(prismaService.session.findMany).toHaveBeenCalledWith({
        where: { userId: mockUser.id },
        select: { sessionToken: true },
      });
    });

    it('should reject invalid request body with unknown fields', async () => {
      const response = await request(app.getHttpServer())
        .post('/auth/logout')
        .set('Authorization', authToken)
        .send({ invalidField: 'invalid' })
        .expect(400); // Should reject unknown fields

      expect(response.body.message).toBe('Validation failed');
    });

    it('should require authentication', async () => {
      // Override guard to reject authentication
      const moduleFixture: TestingModule = await Test.createTestingModule({
        controllers: [AuthController],
        providers: [
          {
            provide: PrismaService,
            useValue: { session: {}, user: {} },
          },
          {
            provide: RedisService,
            useValue: {},
          },
          {
            provide: JwtService,
            useValue: {},
          },
          {
            provide: LoggingService,
            useValue: mockLoggingService,
          },
          {
            provide: ValidationService,
            useValue: mockValidationService,
          },
          {
            provide: SanitizationService,
            useValue: mockSanitizationService,
          },
          {
            provide: RealtimeNotificationService,
            useValue: {},
          },
          {
            provide: WebsocketGateway,
            useValue: {},
          },
          {
            provide: SessionManagementService,
            useValue: {},
          },
        ],
      })
        .overrideGuard(RateLimitGuard)
        .useValue({
          canActivate: jest.fn().mockReturnValue(true),
        })
        .overrideGuard(JwtAuthGuard)
        .useValue({
          canActivate: () => false,
        })
        .compile();

      const testApp = moduleFixture.createNestApplication();
      await testApp.init();

      await request(testApp.getHttpServer())
        .post('/auth/logout')
        .send({ sessionId: 'session-123' })
        .expect(403);

      await testApp.close();
    });
  });

  describe('POST /auth/logout-all', () => {
    it('should logout from all devices successfully', async () => {
      const mockSessions = [
        { sessionToken: 'session-1' },
        { sessionToken: 'session-2' },
      ];

      jest.spyOn(prismaService.session, 'findMany').mockResolvedValue(mockSessions as any);
      jest.spyOn(prismaService.session, 'deleteMany').mockResolvedValue({ count: 2 });
      jest.spyOn(prismaService.user, 'update').mockResolvedValue(mockUser as any);
      jest.spyOn(prismaService.user, 'findUnique').mockResolvedValue(mockUser as any);
      jest.spyOn(jwtService, 'decode').mockReturnValue({ exp: Math.floor(Date.now() / 1000) + 3600 });

      const response = await request(app.getHttpServer())
        .post('/auth/logout-all')
        .expect(201);

      expect(response.body).toEqual({
        message: 'Successfully logged out from all devices',
        userId: mockUser.id,
        timestamp: expect.any(String),
      });

      expect(prismaService.session.deleteMany).toHaveBeenCalledWith({
        where: { userId: mockUser.id },
      });
    });

    it('should require authentication', async () => {
      const moduleFixture: TestingModule = await Test.createTestingModule({
        controllers: [AuthController],
        providers: [
          {
            provide: PrismaService,
            useValue: {},
          },
          {
            provide: RedisService,
            useValue: {},
          },
          {
            provide: JwtService,
            useValue: {},
          },
          {
            provide: LoggingService,
            useValue: mockLoggingService,
          },
          {
            provide: ValidationService,
            useValue: mockValidationService,
          },
          {
            provide: SanitizationService,
            useValue: mockSanitizationService,
          },
          {
            provide: RealtimeNotificationService,
            useValue: {},
          },
          {
            provide: WebsocketGateway,
            useValue: {},
          },
          {
            provide: SessionManagementService,
            useValue: {},
          },
        ],
      })
        .overrideGuard(RateLimitGuard)
        .useValue({
          canActivate: jest.fn().mockReturnValue(true),
        })
        .overrideGuard(JwtAuthGuard)
        .useValue({
          canActivate: () => false,
        })
        .compile();

      const testApp = moduleFixture.createNestApplication();
      await testApp.init();

      await request(testApp.getHttpServer())
        .post('/auth/logout-all')
        .expect(403);

      await testApp.close();
    });
  });

  describe('Error handling', () => {
    it('should handle database errors gracefully', async () => {
      jest.spyOn(prismaService.session, 'deleteMany').mockRejectedValue(new Error('Database connection failed'));

      const response = await request(app.getHttpServer())
        .post('/auth/logout')
        .send({ sessionId: 'session-123' })
        .expect(500);

      expect(response.body.message).toContain('Internal server error');
    });

    it('should handle Redis errors gracefully', async () => {
      jest.spyOn(prismaService.session, 'deleteMany').mockResolvedValue({ count: 1 });
      jest.spyOn(redisService, 'deleteSession').mockRejectedValue(new Error('Redis connection failed'));
      jest.spyOn(prismaService.user, 'update').mockResolvedValue(mockUser as any);
      jest.spyOn(prismaService.user, 'findUnique').mockResolvedValue(mockUser as any);

      const response = await request(app.getHttpServer())
        .post('/auth/logout')
        .send({ sessionId: 'session-123' })
        .expect(500);

      expect(response.body.message).toContain('Internal server error');
    });
  });
});