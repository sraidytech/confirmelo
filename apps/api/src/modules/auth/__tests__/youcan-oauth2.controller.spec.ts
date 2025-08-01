import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { YoucanOAuth2Controller } from '../controllers/youcan-oauth2.controller';
import { YoucanOAuth2Service } from '../services/youcan-oauth2.service';
import { AuthorizationService } from '../../../common/services/authorization.service';
import { UserRole } from '@prisma/client';

// Mock the YoucanOAuth2Service
const mockYoucanOAuth2Service = {
  initiateYoucanAuthorization: jest.fn(),
  completeYoucanAuthorization: jest.fn(),
  testYoucanConnection: jest.fn(),
  refreshYoucanToken: jest.fn(),
  getYoucanOrders: jest.fn(),
  updateYoucanOrderStatus: jest.fn(),
  getYoucanShopInfo: jest.fn(),
  getYoucanOrderSummary: jest.fn(),
  oauth2Service: {
    getAccessToken: jest.fn(),
  },
};

// Mock the AuthorizationService
const mockAuthorizationService = {
  checkUserPermissions: jest.fn().mockResolvedValue(true),
  checkResourcePermission: jest.fn().mockResolvedValue(true),
  checkResourceOwnership: jest.fn().mockResolvedValue(true),
  getUserPermissions: jest.fn().mockResolvedValue([]),
  invalidateUserPermissions: jest.fn().mockResolvedValue(undefined),
};

describe('YoucanOAuth2Controller', () => {
  let controller: YoucanOAuth2Controller;
  let youcanOAuth2Service: typeof mockYoucanOAuth2Service;

  const mockUser = {
    id: 'user-123',
    organizationId: 'org-123',
    role: UserRole.ADMIN,
    email: 'admin@example.com',
  };

  const mockShopInfo = {
    id: 'shop-123',
    name: 'Test Store',
    domain: 'test-store.youcan.shop',
    email: 'test@example.com',
    currency: 'MAD',
    timezone: 'Africa/Casablanca',
    plan: 'premium',
    status: 'active',
  };

  const mockOrderSummary = {
    total_orders: 150,
    pending_orders: 25,
    confirmed_orders: 100,
    cancelled_orders: 25,
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [YoucanOAuth2Controller],
      providers: [
        {
          provide: YoucanOAuth2Service,
          useValue: mockYoucanOAuth2Service,
        },
        {
          provide: AuthorizationService,
          useValue: mockAuthorizationService,
        },
        Reflector,
      ],
    }).compile();

    controller = module.get<YoucanOAuth2Controller>(YoucanOAuth2Controller);
    youcanOAuth2Service = module.get(YoucanOAuth2Service);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('initiateYoucanOAuth2', () => {
    it('should initiate Youcan OAuth2 flow successfully', async () => {
      const dto = { shopDomain: 'test-store.youcan.shop' };
      const expectedResult = {
        authorizationUrl: 'https://youcan.shop/oauth/authorize?client_id=test&state=abc123',
        state: 'abc123',
      };

      mockYoucanOAuth2Service.initiateYoucanAuthorization.mockResolvedValue(expectedResult);

      const result = await controller.initiateYoucanOAuth2(dto, mockUser);

      expect(result).toEqual(expectedResult);
      expect(mockYoucanOAuth2Service.initiateYoucanAuthorization).toHaveBeenCalledWith(
        mockUser.id,
        mockUser.organizationId,
        dto.shopDomain,
      );
    });

    it('should handle service errors', async () => {
      const dto = { shopDomain: 'test-store.youcan.shop' };
      const error = new BadRequestException('Youcan OAuth2 not configured');

      mockYoucanOAuth2Service.initiateYoucanAuthorization.mockRejectedValue(error);

      await expect(controller.initiateYoucanOAuth2(dto, mockUser)).rejects.toThrow(error);
    });

    it('should work without shop domain', async () => {
      const dto = {};
      const expectedResult = {
        authorizationUrl: 'https://youcan.shop/oauth/authorize?client_id=test&state=abc123',
        state: 'abc123',
      };

      mockYoucanOAuth2Service.initiateYoucanAuthorization.mockResolvedValue(expectedResult);

      const result = await controller.initiateYoucanOAuth2(dto, mockUser);

      expect(result).toEqual(expectedResult);
      expect(mockYoucanOAuth2Service.initiateYoucanAuthorization).toHaveBeenCalledWith(
        mockUser.id,
        mockUser.organizationId,
        undefined,
      );
    });
  });

  describe('completeYoucanOAuth2', () => {
    it('should complete Youcan OAuth2 flow successfully', async () => {
      const dto = {
        code: 'auth-code-123',
        state: 'state-123',
      };
      const expectedResult = {
        connectionId: 'conn-123',
        shopInfo: mockShopInfo,
      };

      mockYoucanOAuth2Service.completeYoucanAuthorization.mockResolvedValue(expectedResult);

      const result = await controller.completeYoucanOAuth2(dto, mockUser);

      expect(result).toEqual(expectedResult);
      expect(mockYoucanOAuth2Service.completeYoucanAuthorization).toHaveBeenCalledWith(
        dto.code,
        dto.state,
        mockUser.id,
        mockUser.organizationId,
      );
    });

    it('should handle OAuth2 errors', async () => {
      const dto = {
        code: 'auth-code-123',
        state: 'state-123',
        error: 'access_denied',
        error_description: 'User denied access',
      };

      await expect(controller.completeYoucanOAuth2(dto, mockUser)).rejects.toThrow(
        'Youcan authorization failed: User denied access',
      );

      expect(mockYoucanOAuth2Service.completeYoucanAuthorization).not.toHaveBeenCalled();
    });

    it('should handle OAuth2 errors without description', async () => {
      const dto = {
        code: 'auth-code-123',
        state: 'state-123',
        error: 'server_error',
      };

      await expect(controller.completeYoucanOAuth2(dto, mockUser)).rejects.toThrow(
        'Youcan authorization failed: server_error',
      );
    });

    it('should handle service errors', async () => {
      const dto = {
        code: 'auth-code-123',
        state: 'state-123',
      };
      const error = new BadRequestException('Invalid state parameter');

      mockYoucanOAuth2Service.completeYoucanAuthorization.mockRejectedValue(error);

      await expect(controller.completeYoucanOAuth2(dto, mockUser)).rejects.toThrow(error);
    });
  });

  describe('testYoucanConnection', () => {
    it('should test connection successfully', async () => {
      const connectionId = 'conn-123';
      const testResult = {
        success: true,
        details: {
          platform: 'Youcan Shop',
          shop: mockShopInfo,
          orders: mockOrderSummary,
        },
      };

      mockYoucanOAuth2Service.testYoucanConnection.mockResolvedValue(testResult);

      const result = await controller.testYoucanConnection(connectionId, mockUser);

      expect(result.success).toBe(true);
      expect(result.details).toEqual(testResult.details);
      expect(result.testedAt).toBeInstanceOf(Date);
      expect(mockYoucanOAuth2Service.testYoucanConnection).toHaveBeenCalledWith(connectionId);
    });

    it('should handle test failures', async () => {
      const connectionId = 'conn-123';
      const error = new Error('Connection test failed');

      mockYoucanOAuth2Service.testYoucanConnection.mockRejectedValue(error);

      const result = await controller.testYoucanConnection(connectionId, mockUser);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Connection test failed');
      expect(result.testedAt).toBeInstanceOf(Date);
    });
  });

  describe('refreshYoucanToken', () => {
    it('should refresh token successfully', async () => {
      const connectionId = 'conn-123';

      mockYoucanOAuth2Service.refreshYoucanToken.mockResolvedValue(undefined);

      const result = await controller.refreshYoucanToken(connectionId, mockUser);

      expect(result.message).toBe('Token refreshed successfully');
      expect(result.refreshedAt).toBeInstanceOf(Date);
      expect(mockYoucanOAuth2Service.refreshYoucanToken).toHaveBeenCalledWith(connectionId);
    });

    it('should handle refresh errors', async () => {
      const connectionId = 'conn-123';
      const error = new BadRequestException('Token refresh failed');

      mockYoucanOAuth2Service.refreshYoucanToken.mockRejectedValue(error);

      await expect(controller.refreshYoucanToken(connectionId, mockUser)).rejects.toThrow(error);
    });
  });

  describe('getYoucanOrders', () => {
    it('should get orders with default parameters', async () => {
      const connectionId = 'conn-123';
      const query = {};
      const mockOrders = {
        success: true,
        data: {
          orders: [
            { id: 'order-1', status: 'pending' },
            { id: 'order-2', status: 'confirmed' },
          ],
          pagination: { page: 1, limit: 20, total: 2 },
        },
      };

      mockYoucanOAuth2Service.oauth2Service.getAccessToken.mockResolvedValue('access-token-123');
      mockYoucanOAuth2Service.getYoucanOrders.mockResolvedValue(mockOrders);

      const result = await controller.getYoucanOrders(connectionId, query, mockUser);

      expect(result).toEqual(mockOrders);
      expect(mockYoucanOAuth2Service.oauth2Service.getAccessToken).toHaveBeenCalledWith(connectionId);
      expect(mockYoucanOAuth2Service.getYoucanOrders).toHaveBeenCalledWith('access-token-123', {
        page: 1,
        limit: 20,
        status: undefined,
        dateFrom: undefined,
        dateTo: undefined,
      });
    });

    it('should get orders with custom parameters', async () => {
      const connectionId = 'conn-123';
      const query = {
        page: 2,
        limit: 50,
        status: 'pending',
        dateFrom: '2024-01-01',
        dateTo: '2024-01-31',
      };
      const mockOrders = {
        success: true,
        data: { orders: [], pagination: { page: 2, limit: 50, total: 0 } },
      };

      mockYoucanOAuth2Service.oauth2Service.getAccessToken.mockResolvedValue('access-token-123');
      mockYoucanOAuth2Service.getYoucanOrders.mockResolvedValue(mockOrders);

      const result = await controller.getYoucanOrders(connectionId, query, mockUser);

      expect(result).toEqual(mockOrders);
      expect(mockYoucanOAuth2Service.getYoucanOrders).toHaveBeenCalledWith('access-token-123', {
        page: 2,
        limit: 50,
        status: 'pending',
        dateFrom: '2024-01-01',
        dateTo: '2024-01-31',
      });
    });

    it('should limit page size to 100', async () => {
      const connectionId = 'conn-123';
      const query = { limit: 200 }; // Should be capped at 100

      mockYoucanOAuth2Service.oauth2Service.getAccessToken.mockResolvedValue('access-token-123');
      mockYoucanOAuth2Service.getYoucanOrders.mockResolvedValue({ success: true, data: [] });

      await controller.getYoucanOrders(connectionId, query, mockUser);

      expect(mockYoucanOAuth2Service.getYoucanOrders).toHaveBeenCalledWith('access-token-123', {
        page: 1,
        limit: 100,
        status: undefined,
        dateFrom: undefined,
        dateTo: undefined,
      });
    });

    it('should handle access token errors', async () => {
      const connectionId = 'conn-123';
      const query = {};
      const error = new NotFoundException('Connection not found');

      mockYoucanOAuth2Service.oauth2Service.getAccessToken.mockRejectedValue(error);

      await expect(controller.getYoucanOrders(connectionId, query, mockUser)).rejects.toThrow(error);
    });
  });

  describe('updateYoucanOrderStatus', () => {
    it('should update order status successfully', async () => {
      const connectionId = 'conn-123';
      const orderId = 'order-123';
      const dto = {
        status: 'confirmed',
        notes: 'Order confirmed by agent',
      };
      const mockResponse = {
        success: true,
        data: {
          id: orderId,
          status: dto.status,
          notes: dto.notes,
        },
      };

      mockYoucanOAuth2Service.oauth2Service.getAccessToken.mockResolvedValue('access-token-123');
      mockYoucanOAuth2Service.updateYoucanOrderStatus.mockResolvedValue(mockResponse);

      const result = await controller.updateYoucanOrderStatus(connectionId, orderId, dto, mockUser);

      expect(result).toEqual(mockResponse);
      expect(mockYoucanOAuth2Service.oauth2Service.getAccessToken).toHaveBeenCalledWith(connectionId);
      expect(mockYoucanOAuth2Service.updateYoucanOrderStatus).toHaveBeenCalledWith(
        'access-token-123',
        orderId,
        dto.status,
        dto.notes,
      );
    });

    it('should update order status without notes', async () => {
      const connectionId = 'conn-123';
      const orderId = 'order-123';
      const dto = { status: 'cancelled' };

      mockYoucanOAuth2Service.oauth2Service.getAccessToken.mockResolvedValue('access-token-123');
      mockYoucanOAuth2Service.updateYoucanOrderStatus.mockResolvedValue({
        success: true,
        data: { id: orderId, status: dto.status },
      });

      await controller.updateYoucanOrderStatus(connectionId, orderId, dto, mockUser);

      expect(mockYoucanOAuth2Service.updateYoucanOrderStatus).toHaveBeenCalledWith(
        'access-token-123',
        orderId,
        dto.status,
        undefined,
      );
    });

    it('should handle update errors', async () => {
      const connectionId = 'conn-123';
      const orderId = 'order-123';
      const dto = { status: 'confirmed' };
      const error = new BadRequestException('Order not found');

      mockYoucanOAuth2Service.oauth2Service.getAccessToken.mockResolvedValue('access-token-123');
      mockYoucanOAuth2Service.updateYoucanOrderStatus.mockRejectedValue(error);

      await expect(
        controller.updateYoucanOrderStatus(connectionId, orderId, dto, mockUser),
      ).rejects.toThrow(error);
    });
  });

  describe('getYoucanShopInfo', () => {
    it('should get shop info successfully', async () => {
      const connectionId = 'conn-123';

      mockYoucanOAuth2Service.oauth2Service.getAccessToken.mockResolvedValue('access-token-123');
      mockYoucanOAuth2Service.getYoucanShopInfo.mockResolvedValue(mockShopInfo);

      const result = await controller.getYoucanShopInfo(connectionId, mockUser);

      expect(result).toEqual({
        success: true,
        data: mockShopInfo,
      });
      expect(mockYoucanOAuth2Service.oauth2Service.getAccessToken).toHaveBeenCalledWith(connectionId);
      expect(mockYoucanOAuth2Service.getYoucanShopInfo).toHaveBeenCalledWith('access-token-123');
    });

    it('should handle shop info errors', async () => {
      const connectionId = 'conn-123';
      const error = new BadRequestException('Shop not found');

      mockYoucanOAuth2Service.oauth2Service.getAccessToken.mockResolvedValue('access-token-123');
      mockYoucanOAuth2Service.getYoucanShopInfo.mockRejectedValue(error);

      await expect(controller.getYoucanShopInfo(connectionId, mockUser)).rejects.toThrow(error);
    });
  });

  describe('getYoucanOrderSummary', () => {
    it('should get order summary successfully', async () => {
      const connectionId = 'conn-123';

      mockYoucanOAuth2Service.oauth2Service.getAccessToken.mockResolvedValue('access-token-123');
      mockYoucanOAuth2Service.getYoucanOrderSummary.mockResolvedValue(mockOrderSummary);

      const result = await controller.getYoucanOrderSummary(connectionId, mockUser);

      expect(result).toEqual({
        success: true,
        data: mockOrderSummary,
      });
      expect(mockYoucanOAuth2Service.oauth2Service.getAccessToken).toHaveBeenCalledWith(connectionId);
      expect(mockYoucanOAuth2Service.getYoucanOrderSummary).toHaveBeenCalledWith('access-token-123');
    });

    it('should handle order summary errors', async () => {
      const connectionId = 'conn-123';
      const error = new BadRequestException('Unable to fetch order summary');

      mockYoucanOAuth2Service.oauth2Service.getAccessToken.mockResolvedValue('access-token-123');
      mockYoucanOAuth2Service.getYoucanOrderSummary.mockRejectedValue(error);

      await expect(controller.getYoucanOrderSummary(connectionId, mockUser)).rejects.toThrow(error);
    });
  });
});