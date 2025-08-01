import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { Logger } from '@nestjs/common';
import { PrismaService } from '../../../common/database/prisma.service';
import { OAuth2Service } from '../services/oauth2.service';
import { OAuth2ConfigService } from '../services/oauth2-config.service';
import { YoucanOAuth2Service, YoucanShopInfo, YoucanOrderSummary } from '../services/youcan-oauth2.service';
import { PlatformType, ConnectionStatus } from '@prisma/client';
import axios from 'axios';

// Mock axios
jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

// Mock Prisma methods
const mockPrismaService = {
  platformConnection: {
    findFirst: jest.fn(),
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
};

// Mock OAuth2 service methods
const mockOAuth2Service = {
  generateAuthorizationUrl: jest.fn(),
  exchangeCodeForToken: jest.fn(),
  storeConnection: jest.fn(),
  getAccessToken: jest.fn(),
  refreshAccessToken: jest.fn(),
};

// Mock OAuth2 config service methods
const mockOAuth2ConfigService = {
  getConfig: jest.fn(),
};

// Mock config service
const mockConfigService = {
  get: jest.fn(),
};

describe('YoucanOAuth2Service', () => {
  let service: YoucanOAuth2Service;
  let prismaService: typeof mockPrismaService;
  let oauth2Service: typeof mockOAuth2Service;
  let oauth2ConfigService: typeof mockOAuth2ConfigService;
  let configService: typeof mockConfigService;

  const mockConnection = {
    id: 'conn-123',
    platformType: PlatformType.YOUCAN,
    platformName: 'Youcan Shop - Test Store',
    status: ConnectionStatus.ACTIVE,
    accessToken: 'encrypted-access-token',
    refreshToken: 'encrypted-refresh-token',
    tokenExpiresAt: new Date(Date.now() + 3600000), // 1 hour from now
    scopes: ['read_orders', 'write_orders', 'read_products'],
    userId: 'user-123',
    organizationId: 'org-123',
    platformData: {
      shop_id: 'shop-123',
      shop_name: 'Test Store',
      shop_domain: 'test-store.youcan.shop',
      shop_email: 'test@example.com',
      shop_currency: 'MAD',
      shop_timezone: 'Africa/Casablanca',
      shop_plan: 'premium',
      shop_status: 'active',
    },
    lastSyncAt: new Date(),
    syncCount: 5,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockShopInfo: YoucanShopInfo = {
    id: 'shop-123',
    name: 'Test Store',
    domain: 'test-store.youcan.shop',
    email: 'test@example.com',
    currency: 'MAD',
    timezone: 'Africa/Casablanca',
    plan: 'premium',
    status: 'active',
  };

  const mockOrderSummary: YoucanOrderSummary = {
    total_orders: 150,
    pending_orders: 25,
    confirmed_orders: 100,
    cancelled_orders: 25,
  };

  const mockOAuth2Config = {
    clientId: 'youcan-client-id',
    clientSecret: 'youcan-client-secret',
    redirectUri: 'http://localhost:3000/auth/oauth2/youcan/callback',
    authorizationUrl: 'https://youcan.shop/oauth/authorize',
    tokenUrl: 'https://youcan.shop/oauth/token',
    scopes: ['read_orders', 'write_orders', 'read_products', 'write_products'],
    usePKCE: true,
  };

  beforeEach(async () => {
    // Mock axios create BEFORE module compilation
    const mockAxiosInstance = {
      get: jest.fn(),
      post: jest.fn(),
      put: jest.fn(),
      interceptors: {
        request: { use: jest.fn() },
        response: { use: jest.fn() },
      },
    };
    mockedAxios.create.mockReturnValue(mockAxiosInstance as any);

    // Setup default mocks
    mockOAuth2ConfigService.getConfig.mockResolvedValue(mockOAuth2Config);
    mockConfigService.get.mockReturnValue('test-encryption-key');

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        YoucanOAuth2Service,
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
        {
          provide: OAuth2Service,
          useValue: mockOAuth2Service,
        },
        {
          provide: OAuth2ConfigService,
          useValue: mockOAuth2ConfigService,
        },
      ],
    }).compile();

    service = module.get<YoucanOAuth2Service>(YoucanOAuth2Service);
    prismaService = module.get(PrismaService);
    oauth2Service = module.get(OAuth2Service);
    oauth2ConfigService = module.get(OAuth2ConfigService);
    configService = module.get(ConfigService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('initiateYoucanAuthorization', () => {
    it('should generate authorization URL successfully', async () => {
      const userId = 'user-123';
      const organizationId = 'org-123';
      const shopDomain = 'test-store.youcan.shop';

      mockPrismaService.platformConnection.findFirst.mockResolvedValue(null);
      mockOAuth2Service.generateAuthorizationUrl.mockResolvedValue({
        authorizationUrl: 'https://youcan.shop/oauth/authorize?client_id=test&state=abc123',
        state: 'abc123',
        codeVerifier: 'code-verifier',
        codeChallenge: 'code-challenge',
      });

      const result = await service.initiateYoucanAuthorization(userId, organizationId, shopDomain);

      expect(result).toEqual({
        authorizationUrl: 'https://youcan.shop/oauth/authorize?client_id=test&state=abc123',
        state: 'abc123',
      });

      expect(mockOAuth2ConfigService.getConfig).toHaveBeenCalledWith(PlatformType.YOUCAN);
      expect(mockPrismaService.platformConnection.findFirst).toHaveBeenCalledWith({
        where: {
          userId,
          organizationId,
          platformType: PlatformType.YOUCAN,
          status: ConnectionStatus.ACTIVE,
          platformData: {
            path: ['shop_domain'],
            equals: shopDomain,
          },
        },
      });
      expect(mockOAuth2Service.generateAuthorizationUrl).toHaveBeenCalledWith(
        PlatformType.YOUCAN,
        mockOAuth2Config,
        userId,
        organizationId,
      );
    });

    it('should throw error if Youcan OAuth2 not configured', async () => {
      mockOAuth2ConfigService.getConfig.mockResolvedValue(null);

      await expect(
        service.initiateYoucanAuthorization('user-123', 'org-123'),
      ).rejects.toThrow('Youcan OAuth2 not configured');
    });

    it('should throw error if active connection already exists', async () => {
      mockPrismaService.platformConnection.findFirst.mockResolvedValue(mockConnection);

      await expect(
        service.initiateYoucanAuthorization('user-123', 'org-123'),
      ).rejects.toThrow('Active Youcan connection already exists');
    });
  });

  describe('completeYoucanAuthorization', () => {
    it('should complete authorization successfully', async () => {
      const code = 'auth-code-123';
      const state = 'state-123';
      const userId = 'user-123';
      const organizationId = 'org-123';

      const mockTokenResponse = {
        access_token: 'access-token-123',
        refresh_token: 'refresh-token-123',
        expires_in: 3600,
        token_type: 'Bearer',
      };

      const mockStateData = {
        userId,
        organizationId,
        platformType: PlatformType.YOUCAN,
        timestamp: Date.now(),
      };

      mockOAuth2Service.exchangeCodeForToken.mockResolvedValue({
        tokenResponse: mockTokenResponse,
        stateData: mockStateData,
      });

      // Mock the getYoucanShopInfo method
      const mockAxiosInstance = mockedAxios.create();
      mockAxiosInstance.get = jest.fn().mockResolvedValue({
        data: {
          success: true,
          data: mockShopInfo,
        },
      });

      mockOAuth2Service.storeConnection.mockResolvedValue('conn-123');

      const result = await service.completeYoucanAuthorization(code, state, userId, organizationId);

      expect(result.connectionId).toBe('conn-123');
      expect(result.shopInfo).toEqual(mockShopInfo);

      expect(mockOAuth2Service.exchangeCodeForToken).toHaveBeenCalledWith(
        code,
        state,
        mockOAuth2Config,
      );
      expect(mockOAuth2Service.storeConnection).toHaveBeenCalledWith(
        userId,
        organizationId,
        PlatformType.YOUCAN,
        `Youcan Shop - ${mockShopInfo.name}`,
        mockTokenResponse,
        mockOAuth2Config.scopes,
        expect.objectContaining({
          shop_id: mockShopInfo.id,
          shop_name: mockShopInfo.name,
          shop_domain: mockShopInfo.domain,
        }),
      );
    });

    it('should throw error if state validation fails', async () => {
      const mockStateData = {
        userId: 'different-user',
        organizationId: 'org-123',
        platformType: PlatformType.YOUCAN,
        timestamp: Date.now(),
      };

      mockOAuth2Service.exchangeCodeForToken.mockResolvedValue({
        tokenResponse: { access_token: 'token' },
        stateData: mockStateData,
      });

      await expect(
        service.completeYoucanAuthorization('code', 'state', 'user-123', 'org-123'),
      ).rejects.toThrow('State validation failed - user mismatch');
    });
  });

  describe('testYoucanConnection', () => {
    it('should test connection successfully', async () => {
      const connectionId = 'conn-123';

      mockPrismaService.platformConnection.findUnique.mockResolvedValue(mockConnection);
      mockOAuth2Service.getAccessToken.mockResolvedValue('access-token-123');

      // Mock API responses
      const mockAxiosInstance = mockedAxios.create();
      mockAxiosInstance.get = jest.fn()
        .mockResolvedValueOnce({
          data: { success: true, data: mockShopInfo },
        })
        .mockResolvedValueOnce({
          data: { success: true, data: mockOrderSummary },
        });

      mockPrismaService.platformConnection.update.mockResolvedValue(mockConnection);

      const result = await service.testYoucanConnection(connectionId);

      expect(result.success).toBe(true);
      expect(result.details.shop.name).toBe(mockShopInfo.name);
      expect(result.details.orders.total_orders).toBe(mockOrderSummary.total_orders);

      expect(mockPrismaService.platformConnection.findUnique).toHaveBeenCalledWith({
        where: { id: connectionId },
      });
      expect(mockOAuth2Service.getAccessToken).toHaveBeenCalledWith(connectionId);
      expect(mockPrismaService.platformConnection.update).toHaveBeenCalledWith({
        where: { id: connectionId },
        data: {
          lastSyncAt: expect.any(Date),
          syncCount: { increment: 1 },
        },
      });
    });

    it('should handle connection not found', async () => {
      mockPrismaService.platformConnection.findUnique.mockResolvedValue(null);

      const result = await service.testYoucanConnection('invalid-id');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Youcan connection not found');
    });

    it('should handle inactive connection', async () => {
      const inactiveConnection = {
        ...mockConnection,
        status: ConnectionStatus.EXPIRED,
      };

      mockPrismaService.platformConnection.findUnique.mockResolvedValue(inactiveConnection);

      const result = await service.testYoucanConnection('conn-123');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Connection is not active');
    });

    it('should handle API errors and update connection', async () => {
      mockPrismaService.platformConnection.findUnique.mockResolvedValue(mockConnection);
      mockOAuth2Service.getAccessToken.mockRejectedValue(new Error('Token expired'));

      mockPrismaService.platformConnection.update.mockResolvedValue(mockConnection);

      const result = await service.testYoucanConnection('conn-123');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Token expired');

      expect(mockPrismaService.platformConnection.update).toHaveBeenCalledWith({
        where: { id: 'conn-123' },
        data: {
          lastErrorAt: expect.any(Date),
          lastErrorMessage: 'Token expired',
        },
      });
    });
  });

  describe('getYoucanShopInfo', () => {
    it('should get shop info successfully', async () => {
      const accessToken = 'access-token-123';
      const mockAxiosInstance = mockedAxios.create();
      mockAxiosInstance.get = jest.fn().mockResolvedValue({
        data: {
          success: true,
          data: mockShopInfo,
        },
      });

      const result = await service.getYoucanShopInfo(accessToken);

      expect(result).toEqual(mockShopInfo);
      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/shop', {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });
    });

    it('should handle API error response', async () => {
      const accessToken = 'access-token-123';
      const mockAxiosInstance = mockedAxios.create();
      mockAxiosInstance.get = jest.fn().mockResolvedValue({
        data: {
          success: false,
          message: 'Shop not found',
        },
      });

      await expect(service.getYoucanShopInfo(accessToken)).rejects.toThrow(
        'Failed to get shop information: Youcan API error: Shop not found',
      );
    });

    it('should handle network error', async () => {
      const accessToken = 'access-token-123';
      const mockAxiosInstance = mockedAxios.create();
      mockAxiosInstance.get = jest.fn().mockRejectedValue(new Error('Network error'));

      await expect(service.getYoucanShopInfo(accessToken)).rejects.toThrow(
        'Failed to get shop information: Network error',
      );
    });
  });

  describe('getYoucanOrderSummary', () => {
    it('should get order summary successfully', async () => {
      const accessToken = 'access-token-123';
      const mockAxiosInstance = mockedAxios.create();
      mockAxiosInstance.get = jest.fn().mockResolvedValue({
        data: {
          success: true,
          data: mockOrderSummary,
        },
      });

      const result = await service.getYoucanOrderSummary(accessToken);

      expect(result).toEqual(mockOrderSummary);
      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/orders/summary', {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });
    });

    it('should return default summary on API error', async () => {
      const accessToken = 'access-token-123';
      const mockAxiosInstance = mockedAxios.create();
      mockAxiosInstance.get = jest.fn().mockRejectedValue(new Error('API error'));

      const result = await service.getYoucanOrderSummary(accessToken);

      expect(result).toEqual({
        total_orders: 0,
        pending_orders: 0,
        confirmed_orders: 0,
        cancelled_orders: 0,
      });
    });
  });

  describe('getYoucanOrders', () => {
    it('should get orders with pagination', async () => {
      const accessToken = 'access-token-123';
      const options = {
        page: 2,
        limit: 50,
        status: 'pending',
        dateFrom: '2024-01-01',
        dateTo: '2024-01-31',
      };

      const mockOrdersResponse = {
        success: true,
        data: {
          orders: [
            { id: 'order-1', status: 'pending' },
            { id: 'order-2', status: 'pending' },
          ],
          pagination: {
            page: 2,
            limit: 50,
            total: 100,
          },
        },
      };

      const mockAxiosInstance = mockedAxios.create();
      mockAxiosInstance.get = jest.fn().mockResolvedValue({
        data: mockOrdersResponse,
      });

      const result = await service.getYoucanOrders(accessToken, options);

      expect(result).toEqual(mockOrdersResponse);
      expect(mockAxiosInstance.get).toHaveBeenCalledWith(
        '/orders?page=2&limit=50&status=pending&date_from=2024-01-01&date_to=2024-01-31',
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        },
      );
    });

    it('should limit page size to 100', async () => {
      const accessToken = 'access-token-123';
      const options = { limit: 200 }; // Should be capped at 100

      const mockAxiosInstance = mockedAxios.create();
      mockAxiosInstance.get = jest.fn().mockResolvedValue({
        data: { success: true, data: [] },
      });

      await service.getYoucanOrders(accessToken, options);

      expect(mockAxiosInstance.get).toHaveBeenCalledWith(
        '/orders?limit=100',
        expect.any(Object),
      );
    });
  });

  describe('updateYoucanOrderStatus', () => {
    it('should update order status successfully', async () => {
      const accessToken = 'access-token-123';
      const orderId = 'order-123';
      const status = 'confirmed';
      const notes = 'Order confirmed by agent';

      const mockResponse = {
        success: true,
        data: {
          id: orderId,
          status,
          notes,
        },
      };

      const mockAxiosInstance = mockedAxios.create();
      mockAxiosInstance.put = jest.fn().mockResolvedValue({
        data: mockResponse,
      });

      const result = await service.updateYoucanOrderStatus(accessToken, orderId, status, notes);

      expect(result).toEqual(mockResponse);
      expect(mockAxiosInstance.put).toHaveBeenCalledWith(
        `/orders/${orderId}/status`,
        { status, notes },
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        },
      );
    });

    it('should handle update error', async () => {
      const accessToken = 'access-token-123';
      const orderId = 'order-123';
      const status = 'confirmed';

      const mockAxiosInstance = mockedAxios.create();
      mockAxiosInstance.put = jest.fn().mockRejectedValue(new Error('Update failed'));

      await expect(
        service.updateYoucanOrderStatus(accessToken, orderId, status),
      ).rejects.toThrow('Failed to update order status: Update failed');
    });
  });

  describe('refreshYoucanToken', () => {
    it('should refresh token successfully', async () => {
      const connectionId = 'conn-123';

      mockOAuth2Service.refreshAccessToken.mockResolvedValue({
        access_token: 'new-access-token',
        refresh_token: 'new-refresh-token',
        expires_in: 3600,
      });

      await service.refreshYoucanToken(connectionId);

      expect(mockOAuth2ConfigService.getConfig).toHaveBeenCalledWith(PlatformType.YOUCAN);
      expect(mockOAuth2Service.refreshAccessToken).toHaveBeenCalledWith(connectionId, mockOAuth2Config);
    });

    it('should throw error if config not found', async () => {
      mockOAuth2ConfigService.getConfig.mockResolvedValue(null);

      await expect(service.refreshYoucanToken('conn-123')).rejects.toThrow(
        'Youcan OAuth2 configuration not found',
      );
    });
  });

  describe('validateYoucanWebhook', () => {
    it('should validate webhook signature correctly', () => {
      const payload = '{"order_id":"123","status":"confirmed"}';
      const secret = 'webhook-secret';
      const crypto = require('crypto');
      const expectedSignature = crypto
        .createHmac('sha256', secret)
        .update(payload)
        .digest('hex');

      const isValid = service.validateYoucanWebhook(payload, expectedSignature, secret);

      expect(isValid).toBe(true);
    });

    it('should reject invalid webhook signature', () => {
      const payload = '{"order_id":"123","status":"confirmed"}';
      const secret = 'webhook-secret';
      const invalidSignature = 'invalid-signature';

      const isValid = service.validateYoucanWebhook(payload, invalidSignature, secret);

      expect(isValid).toBe(false);
    });

    it('should handle validation errors gracefully', () => {
      // Test with invalid inputs that might cause crypto errors
      const isValid = service.validateYoucanWebhook(null as any, null as any, null as any);

      expect(isValid).toBe(false);
    });
  });
});