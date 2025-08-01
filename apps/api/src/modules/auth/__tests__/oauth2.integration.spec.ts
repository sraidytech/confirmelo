import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as request from 'supertest';
import { OAuth2Controller } from '../controllers/oauth2.controller';
import { OAuth2Service } from '../services/oauth2.service';
import { OAuth2ConfigService } from '../services/oauth2-config.service';
import { PrismaService } from '../../../common/database/prisma.service';
import { RedisService } from '../../../common/redis/redis.service';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { PlatformType, ConnectionStatus, UserRole } from '@prisma/client';

describe('OAuth2Controller (Integration)', () => {
  let app: INestApplication;
  let prismaService: any;
  let oauth2Service: jest.Mocked<OAuth2Service>;
  let oauth2ConfigService: jest.Mocked<OAuth2ConfigService>;

  const mockUser = {
    id: 'user-123',
    organizationId: 'org-456',
    role: UserRole.ADMIN,
    email: 'admin@test.com',
  };

  const mockConfig = {
    clientId: 'test-client-id',
    clientSecret: 'test-client-secret',
    redirectUri: 'https://app.confirmelo.com/auth/callback',
    authorizationUrl: 'https://oauth.provider.com/authorize',
    tokenUrl: 'https://oauth.provider.com/token',
    scopes: ['read_orders', 'write_orders'],
    usePKCE: true,
  };

  const mockConnection = {
    id: 'conn-123',
    platformType: PlatformType.YOUCAN,
    platformName: 'My Youcan Store',
    status: ConnectionStatus.ACTIVE,
    scopes: ['read_orders', 'write_orders'],
    tokenExpiresAt: new Date(Date.now() + 3600000),
    lastSyncAt: new Date(),
    syncCount: 5,
    platformData: { storeId: 'store-123' },
    createdAt: new Date(),
    updatedAt: new Date(),
    user: {
      id: mockUser.id,
      firstName: 'John',
      lastName: 'Doe',
      email: mockUser.email,
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [OAuth2Controller],
      providers: [
        {
          provide: OAuth2Service,
          useValue: {
            generateAuthorizationUrl: jest.fn(),
            exchangeCodeForToken: jest.fn(),
            refreshAccessToken: jest.fn(),
            storeConnection: jest.fn(),
          },
        },
        {
          provide: OAuth2ConfigService,
          useValue: {
            getConfig: jest.fn(),
            testConnection: jest.fn(),
          },
        },
        {
          provide: PrismaService,
          useValue: {
            platformConnection: {
              findFirst: jest.fn().mockResolvedValue(null),
              findUnique: jest.fn().mockResolvedValue(null),
              findMany: jest.fn().mockResolvedValue([]),
              count: jest.fn().mockResolvedValue(0),
              create: jest.fn().mockResolvedValue({}),
              update: jest.fn().mockResolvedValue({}),
            },
          },
        },
        {
          provide: RedisService,
          useValue: {},
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn(),
          },
        },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate: jest.fn().mockImplementation((context) => {
          const request = context.switchToHttp().getRequest();
          request.user = mockUser;
          return true;
        }),
      })
      .overrideGuard(RolesGuard)
      .useValue({
        canActivate: jest.fn().mockReturnValue(true),
      })
      .compile();

    app = module.createNestApplication();
    await app.init();

    prismaService = module.get(PrismaService);
    oauth2Service = module.get(OAuth2Service);
    oauth2ConfigService = module.get(OAuth2ConfigService);
  });

  afterEach(async () => {
    await app.close();
    jest.clearAllMocks();
  });

  describe('POST /auth/oauth2/initiate', () => {
    const initiateDto = {
      platformType: PlatformType.YOUCAN,
      platformName: 'My Youcan Store',
      platformData: { storeId: 'store-123' },
    };

    it('should initiate OAuth2 flow successfully', async () => {
      const mockAuthRequest = {
        authorizationUrl: 'https://oauth.provider.com/authorize?client_id=123&state=abc',
        state: 'state-123',
      };

      oauth2ConfigService.getConfig.mockResolvedValue(mockConfig);
      prismaService.platformConnection.findFirst.mockResolvedValue(null);
      oauth2Service.generateAuthorizationUrl.mockResolvedValue(mockAuthRequest);

      const response = await request(app.getHttpServer())
        .post('/auth/oauth2/initiate')
        .send(initiateDto)
        .expect(200);

      expect(response.body).toEqual({
        authorizationUrl: mockAuthRequest.authorizationUrl,
        state: mockAuthRequest.state,
      });

      expect(oauth2ConfigService.getConfig).toHaveBeenCalledWith(PlatformType.YOUCAN);
      expect(oauth2Service.generateAuthorizationUrl).toHaveBeenCalledWith(
        PlatformType.YOUCAN,
        mockConfig,
        mockUser.id,
        mockUser.organizationId,
      );
    });

    it('should reject if platform not configured', async () => {
      oauth2ConfigService.getConfig.mockResolvedValue(null);

      await request(app.getHttpServer())
        .post('/auth/oauth2/initiate')
        .send(initiateDto)
        .expect(400);
    });

    it('should reject if active connection already exists', async () => {
      oauth2ConfigService.getConfig.mockResolvedValue(mockConfig);
      prismaService.platformConnection.findFirst.mockResolvedValue(mockConnection as any);

      await request(app.getHttpServer())
        .post('/auth/oauth2/initiate')
        .send(initiateDto)
        .expect(400);
    });

    it('should validate request body', async () => {
      await request(app.getHttpServer())
        .post('/auth/oauth2/initiate')
        .send({})
        .expect(400);

      await request(app.getHttpServer())
        .post('/auth/oauth2/initiate')
        .send({ platformType: 'INVALID' })
        .expect(400);
    });
  });

  describe('POST /auth/oauth2/complete', () => {
    const completeDto = {
      code: 'auth-code-123',
      state: 'state-456',
    };

    it('should complete OAuth2 flow successfully', async () => {
      const mockTokenResponse = {
        access_token: 'access-token',
        refresh_token: 'refresh-token',
        expires_in: 3600,
      };
      const mockStateData = {
        userId: mockUser.id,
        organizationId: mockUser.organizationId,
        platformType: PlatformType.YOUCAN,
      };

      oauth2Service.exchangeCodeForToken.mockResolvedValue({
        tokenResponse: mockTokenResponse,
        stateData: mockStateData,
      });
      oauth2ConfigService.getConfig.mockResolvedValue(mockConfig);
      oauth2Service.storeConnection.mockResolvedValue('conn-123');
      prismaService.platformConnection.findUnique.mockResolvedValue(mockConnection as any);

      const response = await request(app.getHttpServer())
        .post('/auth/oauth2/complete')
        .send(completeDto)
        .expect(200);

      expect(response.body).toMatchObject({
        id: mockConnection.id,
        platformType: mockConnection.platformType,
        platformName: mockConnection.platformName,
        status: mockConnection.status,
      });
    });

    it('should handle OAuth2 errors', async () => {
      const errorDto = {
        code: 'auth-code-123',
        state: 'state-456',
        error: 'access_denied',
        error_description: 'User denied access',
      };

      await request(app.getHttpServer())
        .post('/auth/oauth2/complete')
        .send(errorDto)
        .expect(400);
    });

    it('should handle user mismatch in state', async () => {
      const mockStateData = {
        userId: 'different-user',
        organizationId: mockUser.organizationId,
        platformType: PlatformType.YOUCAN,
      };

      oauth2Service.exchangeCodeForToken.mockResolvedValue({
        tokenResponse: { access_token: 'token' },
        stateData: mockStateData,
      });

      await request(app.getHttpServer())
        .post('/auth/oauth2/complete')
        .send(completeDto)
        .expect(403);
    });
  });

  describe('GET /auth/oauth2/connections', () => {
    it('should list connections successfully', async () => {
      const mockConnections = [mockConnection];
      const mockTotal = 1;

      prismaService.platformConnection.findMany.mockResolvedValue(mockConnections as any);
      prismaService.platformConnection.count.mockResolvedValue(mockTotal);

      const response = await request(app.getHttpServer())
        .get('/auth/oauth2/connections')
        .expect(200);

      expect(response.body).toMatchObject({
        connections: expect.arrayContaining([
          expect.objectContaining({
            id: mockConnection.id,
            platformType: mockConnection.platformType,
          }),
        ]),
        total: mockTotal,
        page: 1,
        limit: 10,
        totalPages: 1,
      });
    });

    it('should filter connections by platform type', async () => {
      prismaService.platformConnection.findMany.mockResolvedValue([]);
      prismaService.platformConnection.count.mockResolvedValue(0);

      await request(app.getHttpServer())
        .get('/auth/oauth2/connections')
        .query({ platformType: PlatformType.YOUCAN })
        .expect(200);

      expect(prismaService.platformConnection.findMany).toHaveBeenCalledWith({
        where: expect.objectContaining({
          platformType: PlatformType.YOUCAN,
        }),
        skip: 0,
        take: 10,
        orderBy: { createdAt: 'desc' },
        include: expect.any(Object),
      });
    });

    it('should handle pagination', async () => {
      prismaService.platformConnection.findMany.mockResolvedValue([]);
      prismaService.platformConnection.count.mockResolvedValue(0);

      await request(app.getHttpServer())
        .get('/auth/oauth2/connections')
        .query({ page: 2, limit: 5 })
        .expect(200);

      expect(prismaService.platformConnection.findMany).toHaveBeenCalledWith({
        where: expect.any(Object),
        skip: 5, // (page - 1) * limit
        take: 5,
        orderBy: { createdAt: 'desc' },
        include: expect.any(Object),
      });
    });
  });

  describe('GET /auth/oauth2/connections/:id', () => {
    it('should get connection details successfully', async () => {
      prismaService.platformConnection.findFirst.mockResolvedValue(mockConnection as any);

      const response = await request(app.getHttpServer())
        .get(`/auth/oauth2/connections/${mockConnection.id}`)
        .expect(200);

      expect(response.body).toMatchObject({
        id: mockConnection.id,
        platformType: mockConnection.platformType,
        platformName: mockConnection.platformName,
      });
    });

    it('should return 404 for non-existent connection', async () => {
      prismaService.platformConnection.findFirst.mockResolvedValue(null);

      await request(app.getHttpServer())
        .get('/auth/oauth2/connections/non-existent')
        .expect(404);
    });
  });

  describe('POST /auth/oauth2/connections/:id/refresh', () => {
    it('should refresh token successfully', async () => {
      prismaService.platformConnection.findFirst.mockResolvedValue(mockConnection as any);
      oauth2ConfigService.getConfig.mockResolvedValue(mockConfig);
      oauth2Service.refreshAccessToken.mockResolvedValue({
        access_token: 'new-token',
        expires_in: 3600,
      });
      prismaService.platformConnection.findUnique.mockResolvedValue(mockConnection as any);

      const response = await request(app.getHttpServer())
        .post(`/auth/oauth2/connections/${mockConnection.id}/refresh`)
        .expect(200);

      expect(response.body).toMatchObject({
        id: mockConnection.id,
        platformType: mockConnection.platformType,
      });

      expect(oauth2Service.refreshAccessToken).toHaveBeenCalledWith(
        mockConnection.id,
        mockConfig,
      );
    });

    it('should return 404 for non-existent connection', async () => {
      prismaService.platformConnection.findFirst.mockResolvedValue(null);

      await request(app.getHttpServer())
        .post('/auth/oauth2/connections/non-existent/refresh')
        .expect(404);
    });
  });

  describe('POST /auth/oauth2/connections/:id/test', () => {
    it('should test connection successfully', async () => {
      const mockTestResult = {
        success: true,
        details: { platform: 'Youcan Shop', responseTime: 150 },
      };

      prismaService.platformConnection.findFirst.mockResolvedValue(mockConnection as any);
      oauth2ConfigService.testConnection.mockResolvedValue(mockTestResult);

      const response = await request(app.getHttpServer())
        .post(`/auth/oauth2/connections/${mockConnection.id}/test`)
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        details: mockTestResult.details,
        testedAt: expect.any(String),
      });
    });

    it('should handle test failures gracefully', async () => {
      prismaService.platformConnection.findFirst.mockResolvedValue(mockConnection as any);
      oauth2ConfigService.testConnection.mockRejectedValue(new Error('API Error'));

      const response = await request(app.getHttpServer())
        .post(`/auth/oauth2/connections/${mockConnection.id}/test`)
        .expect(200);

      expect(response.body).toMatchObject({
        success: false,
        error: 'API Error',
        testedAt: expect.any(String),
      });
    });
  });

  describe('DELETE /auth/oauth2/connections/:id', () => {
    it('should revoke connection successfully', async () => {
      prismaService.platformConnection.findFirst.mockResolvedValue(mockConnection as any);
      prismaService.platformConnection.update.mockResolvedValue({} as any);

      const response = await request(app.getHttpServer())
        .delete(`/auth/oauth2/connections/${mockConnection.id}`)
        .expect(200);

      expect(response.body).toEqual({
        message: 'Connection revoked successfully',
      });

      expect(prismaService.platformConnection.update).toHaveBeenCalledWith({
        where: { id: mockConnection.id },
        data: expect.objectContaining({
          status: ConnectionStatus.REVOKED,
          lastErrorMessage: 'Connection revoked by user',
        }),
      });
    });

    it('should return 404 for non-existent connection', async () => {
      prismaService.platformConnection.findFirst.mockResolvedValue(null);

      await request(app.getHttpServer())
        .delete('/auth/oauth2/connections/non-existent')
        .expect(404);
    });
  });

  describe('Authorization', () => {
    it('should require authentication', async () => {
      // Override guard to simulate unauthenticated request
      const moduleWithoutAuth = await Test.createTestingModule({
        controllers: [OAuth2Controller],
        providers: [
          { provide: OAuth2Service, useValue: {} },
          { provide: OAuth2ConfigService, useValue: {} },
          { provide: PrismaService, useValue: {} },
          { provide: RedisService, useValue: {} },
          { provide: ConfigService, useValue: {} },
        ],
      })
        .overrideGuard(JwtAuthGuard)
        .useValue({
          canActivate: jest.fn().mockReturnValue(false),
        })
        .compile();

      const appWithoutAuth = moduleWithoutAuth.createNestApplication();
      await appWithoutAuth.init();

      await request(appWithoutAuth.getHttpServer())
        .get('/auth/oauth2/connections')
        .expect(403);

      await appWithoutAuth.close();
    });

    it('should enforce role-based access', async () => {
      // Override guard to simulate insufficient permissions
      const moduleWithoutRoles = await Test.createTestingModule({
        controllers: [OAuth2Controller],
        providers: [
          { provide: OAuth2Service, useValue: {} },
          { provide: OAuth2ConfigService, useValue: {} },
          { provide: PrismaService, useValue: {} },
          { provide: RedisService, useValue: {} },
          { provide: ConfigService, useValue: {} },
        ],
      })
        .overrideGuard(JwtAuthGuard)
        .useValue({
          canActivate: jest.fn().mockImplementation((context) => {
            const request = context.switchToHttp().getRequest();
            request.user = { ...mockUser, role: UserRole.CALL_CENTER_AGENT };
            return true;
          }),
        })
        .overrideGuard(RolesGuard)
        .useValue({
          canActivate: jest.fn().mockReturnValue(false),
        })
        .compile();

      const appWithoutRoles = moduleWithoutRoles.createNestApplication();
      await appWithoutRoles.init();

      await request(appWithoutRoles.getHttpServer())
        .post('/auth/oauth2/initiate')
        .send({
          platformType: PlatformType.YOUCAN,
          platformName: 'Test Store',
        })
        .expect(403);

      await appWithoutRoles.close();
    });
  });
});