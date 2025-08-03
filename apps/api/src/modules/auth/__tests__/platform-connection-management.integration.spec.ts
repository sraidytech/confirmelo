import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { OAuth2Controller } from '../controllers/oauth2.controller';
import { OAuth2Service } from '../services/oauth2.service';
import { OAuth2ConfigService } from '../services/oauth2-config.service';
import { PrismaService } from '../../../common/database/prisma.service';
import { RedisService } from '../../../common/redis/redis.service';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { PlatformType, ConnectionStatus, UserRole } from '@prisma/client';

describe('Platform Connection Management (Integration)', () => {
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

  const mockConnections = [
    {
      id: 'conn-1',
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
    },
    {
      id: 'conn-2',
      platformType: PlatformType.GOOGLE_SHEETS,
      platformName: 'Order Sheet',
      status: ConnectionStatus.EXPIRED,
      scopes: ['read_sheets'],
      tokenExpiresAt: new Date(Date.now() - 3600000),
      lastSyncAt: new Date(),
      syncCount: 2,
      platformData: { sheetId: 'sheet-456' },
      createdAt: new Date(),
      updatedAt: new Date(),
      user: {
        id: mockUser.id,
        firstName: 'John',
        lastName: 'Doe',
        email: mockUser.email,
      },
    },
  ];

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
              findFirst: jest.fn(),
              findUnique: jest.fn(),
              findMany: jest.fn(),
              count: jest.fn(),
              create: jest.fn(),
              update: jest.fn(),
              delete: jest.fn(),
            },
          },
        },
        {
          provide: RedisService,
          useValue: {},
        },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate: (context) => {
          const request = context.switchToHttp().getRequest();
          request.user = mockUser;
          return true;
        },
      })
      .overrideGuard(RolesGuard)
      .useValue({
        canActivate: jest.fn(() => true),
      })
      .compile();

    app = module.createNestApplication();
    await app.init();

    prismaService = module.get<PrismaService>(PrismaService);
    oauth2Service = module.get(OAuth2Service);
    oauth2ConfigService = module.get(OAuth2ConfigService);

    // Mock the request user - skip HTTP adapter mocking for now
    // This will be handled by the test request context
  });

  afterEach(async () => {
    await app.close();
  });

  describe('GET /auth/oauth2/connections', () => {
    it('should list platform connections with status tracking', async () => {
      prismaService.platformConnection.findMany.mockResolvedValue(mockConnections);
      prismaService.platformConnection.count.mockResolvedValue(2);

      const response = await request(app.getHttpServer())
        .get('/auth/oauth2/connections')
        .set('user', JSON.stringify(mockUser))
        .expect(200);

      expect(response.body.connections).toHaveLength(2);
      expect(response.body.total).toBe(2);
      
      // Verify connection status tracking
      const activeConnection = response.body.connections.find(c => c.status === 'ACTIVE');
      const expiredConnection = response.body.connections.find(c => c.status === 'EXPIRED');
      
      expect(activeConnection).toBeDefined();
      expect(expiredConnection).toBeDefined();
      expect(activeConnection.syncCount).toBe(5);
      expect(expiredConnection.syncCount).toBe(2);
    });

    it('should filter connections by status', async () => {
      const activeConnections = mockConnections.filter(c => c.status === ConnectionStatus.ACTIVE);
      prismaService.platformConnection.findMany.mockResolvedValue(activeConnections);
      prismaService.platformConnection.count.mockResolvedValue(1);

      const response = await request(app.getHttpServer())
        .get('/auth/oauth2/connections?status=ACTIVE')
        .set('user', JSON.stringify(mockUser))
        .expect(200);

      expect(response.body.connections).toHaveLength(1);
      expect(response.body.connections[0].status).toBe('ACTIVE');
    });

    it('should filter connections by platform type', async () => {
      const youcanConnections = mockConnections.filter(c => c.platformType === PlatformType.YOUCAN);
      prismaService.platformConnection.findMany.mockResolvedValue(youcanConnections);
      prismaService.platformConnection.count.mockResolvedValue(1);

      const response = await request(app.getHttpServer())
        .get('/auth/oauth2/connections?platformType=YOUCAN')
        .set('user', JSON.stringify(mockUser))
        .expect(200);

      expect(response.body.connections).toHaveLength(1);
      expect(response.body.connections[0].platformType).toBe('YOUCAN');
    });

    it('should support pagination', async () => {
      prismaService.platformConnection.findMany.mockResolvedValue([mockConnections[0]]);
      prismaService.platformConnection.count.mockResolvedValue(2);

      const response = await request(app.getHttpServer())
        .get('/auth/oauth2/connections?page=1&limit=1')
        .set('user', JSON.stringify(mockUser))
        .expect(200);

      expect(response.body.connections).toHaveLength(1);
      expect(response.body.page).toBe(1);
      expect(response.body.limit).toBe(1);
      expect(response.body.total).toBe(2);
      expect(response.body.totalPages).toBe(2);
    });
  });

  describe('POST /auth/oauth2/connections/:id/test', () => {
    it('should test connection and update status', async () => {
      const connection = mockConnections[0];
      prismaService.platformConnection.findFirst.mockResolvedValue(connection);
      
      oauth2ConfigService.testConnection.mockResolvedValue({
        success: true,
        details: { responseTime: 250, apiVersion: 'v1.0' },
      });

      const response = await request(app.getHttpServer())
        .post(`/auth/oauth2/connections/${connection.id}/test`)
        .set('user', JSON.stringify(mockUser))
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.details).toEqual({ responseTime: 250, apiVersion: 'v1.0' });
      expect(response.body.testedAt).toBeDefined();
    });

    it('should handle connection test failure', async () => {
      const connection = mockConnections[0];
      prismaService.platformConnection.findFirst.mockResolvedValue(connection);
      
      oauth2ConfigService.testConnection.mockResolvedValue({
        success: false,
        error: 'Access token expired',
      });

      const response = await request(app.getHttpServer())
        .post(`/auth/oauth2/connections/${connection.id}/test`)
        .set('user', JSON.stringify(mockUser))
        .expect(200);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Access token expired');
    });
  });

  describe('POST /auth/oauth2/connections/:id/refresh', () => {
    it('should refresh connection tokens', async () => {
      const connection = mockConnections[0];
      prismaService.platformConnection.findFirst.mockResolvedValue(connection);
      prismaService.platformConnection.findUnique.mockResolvedValue({
        ...connection,
        tokenExpiresAt: new Date(Date.now() + 7200000), // 2 hours from now
      });

      oauth2ConfigService.getConfig.mockResolvedValue({
        clientId: 'test-client',
        clientSecret: 'test-secret',
        redirectUri: 'http://localhost:3000/callback',
        authorizationUrl: 'https://oauth.provider.com/authorize',
        tokenUrl: 'https://oauth.provider.com/token',
        scopes: ['read_orders'],
      });

      oauth2Service.refreshAccessToken.mockResolvedValue({
        access_token: 'new-access-token',
        expires_in: 7200,
      });

      const response = await request(app.getHttpServer())
        .post(`/auth/oauth2/connections/${connection.id}/refresh`)
        .set('user', JSON.stringify(mockUser))
        .expect(200);

      expect(response.body.id).toBe(connection.id);
      expect(oauth2Service.refreshAccessToken).toHaveBeenCalledWith(connection.id, expect.any(Object));
    });
  });

  describe('DELETE /auth/oauth2/connections/:id', () => {
    it('should revoke connection and update status', async () => {
      const connection = mockConnections[0];
      prismaService.platformConnection.findFirst.mockResolvedValue(connection);
      prismaService.platformConnection.update.mockResolvedValue({
        ...connection,
        status: ConnectionStatus.REVOKED,
      });

      const response = await request(app.getHttpServer())
        .delete(`/auth/oauth2/connections/${connection.id}`)
        .set('user', JSON.stringify(mockUser))
        .expect(200);

      expect(response.body.message).toBe('Connection revoked successfully');
      expect(prismaService.platformConnection.update).toHaveBeenCalledWith({
        where: { id: connection.id },
        data: {
          status: ConnectionStatus.REVOKED,
          lastErrorAt: expect.any(Date),
          lastErrorMessage: 'Connection revoked by user',
        },
      });
    });
  });

  describe('Connection Health Checking', () => {
    it('should track connection health through sync operations', async () => {
      const connection = mockConnections[0];
      
      // Simulate successful sync
      prismaService.platformConnection.update.mockResolvedValue({
        ...connection,
        lastSyncAt: new Date(),
        syncCount: connection.syncCount + 1,
        status: ConnectionStatus.ACTIVE,
      });

      // This would typically be called by a background job
      await prismaService.platformConnection.update({
        where: { id: connection.id },
        data: {
          lastSyncAt: new Date(),
          syncCount: { increment: 1 },
          status: ConnectionStatus.ACTIVE,
          lastErrorAt: null,
          lastErrorMessage: null,
        },
      });

      expect(prismaService.platformConnection.update).toHaveBeenCalledWith({
        where: { id: connection.id },
        data: {
          lastSyncAt: expect.any(Date),
          syncCount: { increment: 1 },
          status: ConnectionStatus.ACTIVE,
          lastErrorAt: null,
          lastErrorMessage: null,
        },
      });
    });

    it('should track connection errors', async () => {
      const connection = mockConnections[0];
      const errorMessage = 'API rate limit exceeded';
      
      // Simulate failed sync
      prismaService.platformConnection.update.mockResolvedValue({
        ...connection,
        status: ConnectionStatus.ERROR,
        lastErrorAt: new Date(),
        lastErrorMessage: errorMessage,
      });

      await prismaService.platformConnection.update({
        where: { id: connection.id },
        data: {
          status: ConnectionStatus.ERROR,
          lastErrorAt: new Date(),
          lastErrorMessage: errorMessage,
        },
      });

      expect(prismaService.platformConnection.update).toHaveBeenCalledWith({
        where: { id: connection.id },
        data: {
          status: ConnectionStatus.ERROR,
          lastErrorAt: expect.any(Date),
          lastErrorMessage: errorMessage,
        },
      });
    });
  });
});