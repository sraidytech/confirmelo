import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { JwtService } from '@nestjs/jwt';
import { AuthController } from '../auth.controller';
import { SessionManagementService } from '../services/session-management.service';
import { PrismaService } from '../../../common/database/prisma.service';
import { RedisService } from '../../../common/redis/redis.service';
import { RealtimeNotificationService } from '../../websocket/services/realtime-notification.service';
import { WebsocketGateway } from '../../websocket/websocket.gateway';
import { AuthorizationService } from '../../../common/services/authorization.service';
import { LoggingService } from '../../../common/services/logging.service';
import { RateLimitGuard } from '../../../common/validation/guards/rate-limit.guard';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { ValidationService } from '../../../common/validation/validation.service';
import { SanitizationService } from '../../../common/validation/sanitization.service';

describe('Session Management API (e2e)', () => {
  let app: INestApplication;
  let jwtService: JwtService;

  const mockUser = {
    id: 'test-user-1',
    email: 'test@example.com',
    firstName: 'Test',
    lastName: 'User',
    role: 'ADMIN',
    organizationId: 'test-org-1',
    status: 'ACTIVE',
  };

  const mockSessionManagementService = {
    getUserSessions: jest.fn(),
    getSessionStats: jest.fn(),
    getSessionActivity: jest.fn(),
    terminateSession: jest.fn(),
  };

  const mockPrismaService = {
    user: {
      findUnique: jest.fn().mockResolvedValue({
        ...mockUser,
        deletedAt: null,
        isOnline: true,
        lastActiveAt: new Date(),
        organization: {
          id: 'test-org-1',
          name: 'Test Org',
          code: 'TEST',
          deletedAt: null,
        },
        leadingTeams: [],
        teamMemberships: [],
      }),
      update: jest.fn(),
    },
  };

  const mockRedisService = {
    get: jest.fn(),
    set: jest.fn(),
    del: jest.fn(),
    exists: jest.fn().mockResolvedValue(false),
    deleteSession: jest.fn(),
    getClient: jest.fn().mockReturnValue({
      keys: jest.fn().mockResolvedValue([]),
      del: jest.fn(),
    }),
  };

  const mockRealtimeNotificationService = {
    broadcastSessionUpdate: jest.fn(),
  };

  const mockWebsocketGateway = {
    disconnectUser: jest.fn(),
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

  let authToken: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        {
          provide: PrismaService,
          useValue: {
            session: {
              findMany: jest.fn(),
              findFirst: jest.fn(),
              delete: jest.fn(),
              deleteMany: jest.fn(),
              count: jest.fn(),
            },
            user: {
              findUnique: jest.fn().mockResolvedValue(mockUser),
              update: jest.fn(),
            },
          },
        },
        {
          provide: JwtService,
          useValue: {
            sign: jest.fn().mockReturnValue('mock-jwt-token'),
            verify: jest.fn().mockReturnValue({
              sub: mockUser.id,
              email: mockUser.email,
              role: mockUser.role,
              organizationId: mockUser.organizationId,
            }),
            decode: jest.fn().mockReturnValue({
              sub: mockUser.id,
              exp: Math.floor(Date.now() / 1000) + 3600,
            }),
          },
        },
        { provide: RedisService, useValue: mockRedisService },
        { provide: LoggingService, useValue: mockLoggingService },
        { provide: ValidationService, useValue: mockValidationService },
        { provide: SanitizationService, useValue: mockSanitizationService },
        { provide: SessionManagementService, useValue: mockSessionManagementService },
        { provide: RealtimeNotificationService, useValue: mockRealtimeNotificationService },
        { provide: WebsocketGateway, useValue: mockWebsocketGateway },
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
        const authHeader = request.headers.authorization;
        
        // If no auth header, return false (401)
        if (!authHeader) {
          return false;
        }
        
        // If auth header present, set user and return true
        request.user = mockUser;
        return true;
      },
    })
    .compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    jwtService = moduleFixture.get<JwtService>(JwtService);
    authToken = 'Bearer mock-jwt-token';
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /auth/sessions', () => {
    it('should return user sessions successfully', async () => {
      const mockResponse = {
        sessions: [
          {
            id: 'session-1',
            sessionToken: 'tok***123',
            userId: 'test-user-1',
            deviceInfo: { browser: 'Chrome', os: 'Windows', isMobile: false },
            locationInfo: { country: 'Morocco', city: 'Casablanca' },
            isCurrent: true,
            isSuspicious: false,
          },
        ],
        total: 1,
        activeCount: 1,
        suspiciousCount: 0,
      };

      mockSessionManagementService.getUserSessions.mockResolvedValue(mockResponse);

      const response = await request(app.getHttpServer())
        .get('/auth/sessions')
        .set('Authorization', authToken)
        .expect(200);

      expect(response.body).toEqual(mockResponse);
      expect(mockSessionManagementService.getUserSessions).toHaveBeenCalledWith('test-user-1', undefined);
    });

    it('should require authentication', async () => {
      await request(app.getHttpServer())
        .get('/auth/sessions')
        .expect(403);
    });
  });

  describe('GET /auth/sessions/stats', () => {
    it('should return session statistics', async () => {
      const mockStats = {
        totalSessions: 2,
        activeSessions: 1,
        expiredSessions: 1,
        suspiciousSessions: 0,
        deviceBreakdown: { desktop: 1, mobile: 1, tablet: 0, unknown: 0 },
        locationBreakdown: { Morocco: 2 },
        recentActivityCount: 5,
      };

      mockSessionManagementService.getSessionStats.mockResolvedValue(mockStats);

      const response = await request(app.getHttpServer())
        .get('/auth/sessions/stats')
        .set('Authorization', authToken)
        .expect(200);

      expect(response.body).toEqual(mockStats);
    });
  });

  describe('GET /auth/sessions/activity', () => {
    it('should return session activities', async () => {
      const mockActivities = [
        {
          id: 'activity-1',
          sessionId: 'session-1',
          type: 'session_created',
          description: 'Session created',
          timestamp: new Date().toISOString(),
        },
      ];

      mockSessionManagementService.getSessionActivity.mockResolvedValue(mockActivities);

      const response = await request(app.getHttpServer())
        .get('/auth/sessions/activity')
        .set('Authorization', authToken)
        .expect(200);

      expect(response.body).toEqual(mockActivities);
    });
  });

  describe('DELETE /auth/sessions/:sessionId', () => {
    it('should terminate a session successfully', async () => {
      const mockResponse = {
        message: 'Session terminated successfully',
        sessionId: 'session-1',
        timestamp: new Date().toISOString(),
      };

      mockSessionManagementService.terminateSession.mockResolvedValue(mockResponse);

      const response = await request(app.getHttpServer())
        .delete('/auth/sessions/session-1')
        .set('Authorization', authToken)
        .send({ reason: 'Test termination' })
        .expect(200);

      expect(response.body).toEqual(mockResponse);
      expect(mockSessionManagementService.terminateSession).toHaveBeenCalledWith(
        'test-user-1',
        'session-1',
        'Test termination',
        'test-user-1'
      );
    });

    it('should require authentication', async () => {
      await request(app.getHttpServer())
        .delete('/auth/sessions/session-1')
        .expect(403);
    });
  });

  describe('POST /auth/sessions/terminate', () => {
    it('should terminate a session using POST method', async () => {
      const mockResponse = {
        message: 'Session terminated successfully',
        sessionId: 'session-1',
        timestamp: new Date().toISOString(),
      };

      mockSessionManagementService.terminateSession.mockResolvedValue(mockResponse);

      const response = await request(app.getHttpServer())
        .post('/auth/sessions/terminate')
        .set('Authorization', authToken)
        .send({
          sessionId: 'session-1',
          reason: 'Manual termination',
        })
        .expect(201);

      expect(response.body).toEqual(mockResponse);
    });
  });
});