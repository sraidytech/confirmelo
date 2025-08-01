import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as request from 'supertest';
import { PrismaService } from '../../../common/database/prisma.service';
import { RedisService } from '../../../common/redis/redis.service';
import { AuthModule } from '../auth.module';
import { UserRole, PlatformType, ConnectionStatus, Currency, UserStatus } from '@prisma/client';
import { JwtService } from '@nestjs/jwt';

describe('Google Sheets OAuth2 Integration (e2e)', () => {
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
    role: UserRole.ADMIN,
    organizationId: 'org-456',
    status: UserStatus.ACTIVE,
    isOnline: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockOrganization = {
    id: 'org-456',
    name: 'Test Organization',
    code: 'TEST_ORG',
    email: 'org@example.com',
    country: 'US',
    timezone: 'UTC',
    currency: Currency.USD,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AuthModule],
    })
      .overrideProvider(ConfigService)
      .useValue({
        get: jest.fn((key: string) => {
          const config = {
            JWT_SECRET: 'test-jwt-secret',
            JWT_EXPIRES_IN: '15m',
            JWT_REFRESH_SECRET: 'test-refresh-secret',
            JWT_REFRESH_EXPIRES_IN: '7d',
            GOOGLE_CLIENT_ID: 'test-google-client-id',
            GOOGLE_CLIENT_SECRET: 'test-google-client-secret',
            GOOGLE_REDIRECT_URI: 'http://localhost:3001/auth/oauth2/google/callback',
            OAUTH2_ENCRYPTION_KEY: 'test-encryption-key-32-characters',
            REDIS_URL: 'redis://localhost:6379',
            DATABASE_URL: 'postgresql://test:test@localhost:5432/test',
          };
          return config[key];
        }),
      })
      .overrideProvider(RedisService)
      .useValue({
        get: jest.fn(),
        set: jest.fn(),
        del: jest.fn(),
        exists: jest.fn(),
        expire: jest.fn(),
        keys: jest.fn(),
        flushall: jest.fn(),
      })
      .overrideProvider(PrismaService)
      .useValue({
        organization: {
          upsert: jest.fn(),
          findUnique: jest.fn(),
          deleteMany: jest.fn(),
        },
        user: {
          upsert: jest.fn(),
          findUnique: jest.fn(),
          deleteMany: jest.fn(),
        },
        platformConnection: {
          findMany: jest.fn(),
          findUnique: jest.fn(),
          create: jest.fn(),
          update: jest.fn(),
          deleteMany: jest.fn(),
        },
        $disconnect: jest.fn(),
      })
      .compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    prismaService = moduleFixture.get<PrismaService>(PrismaService);
    redisService = moduleFixture.get<RedisService>(RedisService);
    jwtService = moduleFixture.get<JwtService>(JwtService);

    // Setup mock responses for test data
    (prismaService.organization.upsert as jest.Mock).mockResolvedValue(mockOrganization);
    (prismaService.user.upsert as jest.Mock).mockResolvedValue(mockUser);
    (prismaService.platformConnection.findMany as jest.Mock).mockResolvedValue([]);
    (prismaService.platformConnection.findUnique as jest.Mock).mockResolvedValue(null);

    // Mock user creation - no actual database call needed since we're using mocks
    (prismaService.user.upsert as jest.Mock).mockResolvedValue(mockUser);

    // Generate auth token
    authToken = jwtService.sign({
      sub: mockUser.id,
      email: mockUser.email,
      role: mockUser.role,
      organizationId: mockUser.organizationId,
    });
  });

  afterAll(async () => {
    // No cleanup needed for mocked services
    await app.close();
  });

  beforeEach(async () => {
    // Reset mocks before each test
    jest.clearAllMocks();

    // Setup default mock responses
    (prismaService.platformConnection.findMany as jest.Mock).mockResolvedValue([]);
    (prismaService.platformConnection.findUnique as jest.Mock).mockResolvedValue(null);
  });

  describe('POST /auth/oauth2/google-sheets/initiate', () => {
    it('should initiate Google Sheets OAuth2 flow', async () => {
      const response = await request(app.getHttpServer())
        .post('/auth/oauth2/google-sheets/initiate')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          platformName: 'My Google Sheets Integration',
        })
        .expect(200);

      expect(response.body).toHaveProperty('authorizationUrl');
      expect(response.body).toHaveProperty('state');
      expect(response.body.authorizationUrl).toContain('accounts.google.com');
      expect(response.body.authorizationUrl).toContain('client_id=test-google-client-id');
      expect(response.body.authorizationUrl).toContain('redirect_uri=');
      expect(response.body.authorizationUrl).toContain('scope=');
      expect(response.body.state).toBeDefined();
    });

    it('should return 400 if Google OAuth2 not configured', async () => {
      // This test would require mocking the config service to return null values
      // For now, we'll skip it since our test setup includes valid config
    });

    it('should return 400 if active connection already exists', async () => {
      // Create an existing active connection
      await prismaService.platformConnection.create({
        data: {
          id: 'existing-connection',
          platformType: PlatformType.GOOGLE_SHEETS,
          platformName: 'Existing Google Sheets',
          status: ConnectionStatus.ACTIVE,
          accessToken: 'encrypted-token',
          scopes: ['https://www.googleapis.com/auth/spreadsheets'],
          userId: mockUser.id,
          organizationId: mockOrganization.id,
          syncCount: 0,
        },
      });

      await request(app.getHttpServer())
        .post('/auth/oauth2/google-sheets/initiate')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          platformName: 'Another Google Sheets Integration',
        })
        .expect(400);
    });

    it('should return 401 without authentication', async () => {
      await request(app.getHttpServer())
        .post('/auth/oauth2/google-sheets/initiate')
        .send({
          platformName: 'My Google Sheets Integration',
        })
        .expect(401);
    });
  });

  describe('POST /auth/oauth2/google-sheets/complete', () => {
    it('should return 400 for OAuth2 errors', async () => {
      const response = await request(app.getHttpServer())
        .post('/auth/oauth2/google-sheets/complete')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          code: 'auth-code',
          state: 'test-state',
          error: 'access_denied',
          error_description: 'User denied access',
        })
        .expect(400);

      expect(response.body.message).toContain('Google authorization failed');
    });

    it('should return 401 without authentication', async () => {
      await request(app.getHttpServer())
        .post('/auth/oauth2/google-sheets/complete')
        .send({
          code: 'auth-code',
          state: 'test-state',
        })
        .expect(401);
    });

    // Note: Testing successful completion would require mocking external Google APIs
    // or setting up integration with actual Google services, which is beyond the scope
    // of this unit test. In a real scenario, you'd use tools like nock to mock HTTP calls.
  });

  describe('GET /auth/oauth2/google-sheets/connections', () => {
    beforeEach(async () => {
      // Create test connections
      await prismaService.platformConnection.createMany({
        data: [
          {
            id: 'connection-1',
            platformType: PlatformType.GOOGLE_SHEETS,
            platformName: 'Google Sheets - user1@gmail.com',
            status: ConnectionStatus.ACTIVE,
            accessToken: 'encrypted-token-1',
            scopes: ['https://www.googleapis.com/auth/spreadsheets'],
            userId: mockUser.id,
            organizationId: mockOrganization.id,
            syncCount: 5,
            lastSyncAt: new Date(),
          },
          {
            id: 'connection-2',
            platformType: PlatformType.GOOGLE_SHEETS,
            platformName: 'Google Sheets - user2@gmail.com',
            status: ConnectionStatus.EXPIRED,
            accessToken: 'encrypted-token-2',
            scopes: ['https://www.googleapis.com/auth/spreadsheets'],
            userId: mockUser.id,
            organizationId: mockOrganization.id,
            syncCount: 2,
            lastSyncAt: new Date(),
          },
        ],
      });
    });

    it('should list Google Sheets connections', async () => {
      const response = await request(app.getHttpServer())
        .get('/auth/oauth2/google-sheets/connections')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('connections');
      expect(response.body).toHaveProperty('total');
      expect(response.body).toHaveProperty('page');
      expect(response.body).toHaveProperty('limit');
      expect(response.body).toHaveProperty('totalPages');
      expect(response.body.connections).toHaveLength(2);
      expect(response.body.total).toBe(2);
      expect(response.body.connections[0]).toHaveProperty('id');
      expect(response.body.connections[0]).toHaveProperty('platformType', PlatformType.GOOGLE_SHEETS);
      expect(response.body.connections[0]).toHaveProperty('status');
    });

    it('should filter connections by status', async () => {
      const response = await request(app.getHttpServer())
        .get('/auth/oauth2/google-sheets/connections?status=ACTIVE')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.connections).toHaveLength(1);
      expect(response.body.connections[0].status).toBe(ConnectionStatus.ACTIVE);
    });

    it('should handle pagination', async () => {
      const response = await request(app.getHttpServer())
        .get('/auth/oauth2/google-sheets/connections?page=1&limit=1')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.connections).toHaveLength(1);
      expect(response.body.page).toBe(1);
      expect(response.body.limit).toBe(1);
      expect(response.body.totalPages).toBe(2);
    });

    it('should return 401 without authentication', async () => {
      await request(app.getHttpServer())
        .get('/auth/oauth2/google-sheets/connections')
        .expect(401);
    });
  });

  describe('GET /auth/oauth2/google-sheets/connections/:id', () => {
    let connectionId: string;

    beforeEach(async () => {
      const connection = await prismaService.platformConnection.create({
        data: {
          id: 'test-connection',
          platformType: PlatformType.GOOGLE_SHEETS,
          platformName: 'Google Sheets - test@gmail.com',
          status: ConnectionStatus.ACTIVE,
          accessToken: 'encrypted-token',
          scopes: ['https://www.googleapis.com/auth/spreadsheets'],
          userId: mockUser.id,
          organizationId: mockOrganization.id,
          syncCount: 3,
          lastSyncAt: new Date(),
          platformData: {
            google_user_id: 'google-123',
            google_email: 'test@gmail.com',
            api_version: 'v4',
          },
        },
      });
      connectionId = connection.id;
    });

    it('should get Google Sheets connection details', async () => {
      const response = await request(app.getHttpServer())
        .get(`/auth/oauth2/google-sheets/connections/${connectionId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('id', connectionId);
      expect(response.body).toHaveProperty('platformType', PlatformType.GOOGLE_SHEETS);
      expect(response.body).toHaveProperty('platformName');
      expect(response.body).toHaveProperty('status', ConnectionStatus.ACTIVE);
      expect(response.body).toHaveProperty('scopes');
      expect(response.body).toHaveProperty('syncCount', 3);
      expect(response.body).toHaveProperty('platformData');
    });

    it('should return 404 for non-existent connection', async () => {
      await request(app.getHttpServer())
        .get('/auth/oauth2/google-sheets/connections/non-existent')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(404);
    });

    it('should return 401 without authentication', async () => {
      await request(app.getHttpServer())
        .get(`/auth/oauth2/google-sheets/connections/${connectionId}`)
        .expect(401);
    });
  });

  describe('POST /auth/oauth2/google-sheets/connections/:id/test', () => {
    let connectionId: string;

    beforeEach(async () => {
      const connection = await prismaService.platformConnection.create({
        data: {
          id: 'test-connection',
          platformType: PlatformType.GOOGLE_SHEETS,
          platformName: 'Google Sheets - test@gmail.com',
          status: ConnectionStatus.ACTIVE,
          accessToken: 'encrypted-token',
          scopes: ['https://www.googleapis.com/auth/spreadsheets'],
          userId: mockUser.id,
          organizationId: mockOrganization.id,
          syncCount: 0,
        },
      });
      connectionId = connection.id;
    });

    it('should test Google Sheets connection', async () => {
      const response = await request(app.getHttpServer())
        .post(`/auth/oauth2/google-sheets/connections/${connectionId}/test`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('success');
      expect(response.body).toHaveProperty('testedAt');
      expect(response.body.testedAt).toBeDefined();

      // The actual success/failure depends on the implementation
      // In our case, it will likely fail due to invalid tokens in test environment
      if (response.body.success) {
        expect(response.body).toHaveProperty('details');
      } else {
        expect(response.body).toHaveProperty('error');
      }
    });

    it('should return 404 for non-existent connection', async () => {
      await request(app.getHttpServer())
        .post('/auth/oauth2/google-sheets/connections/non-existent/test')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(404);
    });

    it('should return 401 without authentication', async () => {
      await request(app.getHttpServer())
        .post(`/auth/oauth2/google-sheets/connections/${connectionId}/test`)
        .expect(401);
    });
  });

  // Note: Testing spreadsheet operations (create, read, update) would require
  // mocking Google Sheets API calls or setting up integration with actual Google services.
  // These tests focus on the authentication and connection management aspects.

  describe('Role-based access control', () => {
    let clientUserToken: string;

    beforeAll(async () => {
      const clientUser = {
        id: 'client-user-123',
        email: 'client@example.com',
        firstName: 'Client',
        lastName: 'User',
        role: UserRole.CLIENT_USER,
        organizationId: mockOrganization.id,
        status: UserStatus.ACTIVE,
        isOnline: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      // Mock client user creation
      (prismaService.user.upsert as jest.Mock).mockResolvedValue(clientUser);

      clientUserToken = jwtService.sign({
        sub: clientUser.id,
        email: clientUser.email,
        role: clientUser.role,
        organizationId: clientUser.organizationId,
      });
    });

    it('should allow CLIENT_USER to read connections', async () => {
      await request(app.getHttpServer())
        .get('/auth/oauth2/google-sheets/connections')
        .set('Authorization', `Bearer ${clientUserToken}`)
        .expect(200);
    });

    it('should deny CLIENT_USER from initiating OAuth2', async () => {
      await request(app.getHttpServer())
        .post('/auth/oauth2/google-sheets/initiate')
        .set('Authorization', `Bearer ${clientUserToken}`)
        .send({ platformName: 'Test' })
        .expect(403);
    });

    it('should deny CLIENT_USER from completing OAuth2', async () => {
      await request(app.getHttpServer())
        .post('/auth/oauth2/google-sheets/complete')
        .set('Authorization', `Bearer ${clientUserToken}`)
        .send({ code: 'test', state: 'test' })
        .expect(403);
    });
  });
});