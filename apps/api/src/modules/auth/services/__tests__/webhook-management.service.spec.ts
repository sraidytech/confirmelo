import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { WebhookManagementService } from '../webhook-management.service';
import { PrismaService } from '../../../../common/database/prisma.service';
import { GoogleSheetsOAuth2Service } from '../google-sheets-oauth2.service';
import { OrderSyncService } from '../order-sync.service';
import { GoogleSheetsWebhookNotification } from '../../../../common/interfaces/google-sheets-order-sync.interface';
import { google } from 'googleapis';

// Mock Google APIs
jest.mock('googleapis');

describe('WebhookManagementService', () => {
  let service: WebhookManagementService;
  let prismaService: any;
  let googleSheetsOAuth2Service: jest.Mocked<GoogleSheetsOAuth2Service>;
  let orderSyncService: jest.Mocked<OrderSyncService>;
  let configService: jest.Mocked<ConfigService>;

  const mockDriveApi = {
    files: {
      watch: jest.fn(),
    },
    channels: {
      stop: jest.fn(),
    },
  };

  const mockOAuth2Client = {
    credentials: {
      access_token: 'mock-access-token',
      refresh_token: 'mock-refresh-token',
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WebhookManagementService,
        {
          provide: PrismaService,
          useValue: {
            spreadsheetConnection: {
              findUnique: jest.fn().mockResolvedValue(null),
              update: jest.fn().mockResolvedValue({}),
              updateMany: jest.fn().mockResolvedValue({ count: 0 }),
            },
            webhookSubscription: {
              create: jest.fn().mockResolvedValue({}),
              findFirst: jest.fn().mockResolvedValue(null),
              findUnique: jest.fn().mockResolvedValue(null),
              findMany: jest.fn().mockResolvedValue([]),
              update: jest.fn().mockResolvedValue({}),
            },
            syncOperation: {
              create: jest.fn().mockResolvedValue({}),
              updateMany: jest.fn().mockResolvedValue({ count: 0 }),
            },
          },
        },
        {
          provide: GoogleSheetsOAuth2Service,
          useValue: {
            getOAuth2Client: jest.fn(),
          },
        },
        {
          provide: OrderSyncService,
          useValue: {
            syncOrdersFromSheet: jest.fn(),
          },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<WebhookManagementService>(WebhookManagementService);
    prismaService = module.get(PrismaService);
    googleSheetsOAuth2Service = module.get(GoogleSheetsOAuth2Service);
    orderSyncService = module.get(OrderSyncService);
    configService = module.get(ConfigService);

    // Setup config service mocks
    configService.get.mockImplementation((key: string) => {
      switch (key) {
        case 'GOOGLE_SHEETS_WEBHOOK_URL':
          return 'https://api.example.com/api/google-sheets/webhook';
        case 'API_BASE_URL':
          return 'https://api.example.com';
        case 'GOOGLE_SHEETS_WEBHOOK_SECRET':
          return 'test-webhook-secret';
        default:
          return undefined;
      }
    });

    // Setup Google API mocks
    (google.drive as jest.Mock).mockReturnValue(mockDriveApi);
    googleSheetsOAuth2Service.getOAuth2Client.mockResolvedValue(mockOAuth2Client as any);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('setupWebhookForSheet', () => {
    const mockConnection = {
      id: 'conn-123',
      client: { id: 'client-123' },
    };

    const mockWatchResponse = {
      data: {
        id: 'webhook-123',
        resourceId: 'resource-123',
        expiration: String(Date.now() + 24 * 60 * 60 * 1000),
      },
    };

    const mockSubscription = {
      id: 'sub-123',
      connectionId: 'conn-123',
      spreadsheetId: 'sheet-123',
      subscriptionId: 'webhook-123',
      resourceId: 'resource-123',
      expiration: new Date(Date.now() + 24 * 60 * 60 * 1000),
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    beforeEach(() => {
      prismaService.spreadsheetConnection.findUnique.mockResolvedValue(mockConnection as any);
      mockDriveApi.files.watch.mockResolvedValue(mockWatchResponse);
      prismaService.webhookSubscription.create.mockResolvedValue(mockSubscription as any);
      prismaService.spreadsheetConnection.update.mockResolvedValue({} as any);
    });

    it('should successfully setup webhook subscription', async () => {
      const result = await service.setupWebhookForSheet('conn-123', 'sheet-123');

      expect(result).toEqual(mockSubscription);
      expect(prismaService.spreadsheetConnection.findUnique).toHaveBeenCalledWith({
        where: { id: 'conn-123' },
        include: { client: true },
      });
      expect(mockDriveApi.files.watch).toHaveBeenCalledWith({
        fileId: 'sheet-123',
        requestBody: {
          id: expect.stringMatching(/^webhook_conn-123_\d+$/),
          type: 'web_hook',
          address: 'https://api.example.com/api/google-sheets/webhook',
          token: expect.any(String),
        },
      });
      expect(prismaService.webhookSubscription.create).toHaveBeenCalled();
      expect(prismaService.spreadsheetConnection.update).toHaveBeenCalledWith({
        where: { id: 'conn-123' },
        data: { webhookSubscriptionId: 'sub-123' },
      });
    });

    it('should throw BadRequestException if connection not found', async () => {
      prismaService.spreadsheetConnection.findUnique.mockResolvedValue(null);

      await expect(service.setupWebhookForSheet('conn-123', 'sheet-123'))
        .rejects.toThrow(BadRequestException);
    });

    it('should throw InternalServerErrorException if Google API fails', async () => {
      mockDriveApi.files.watch.mockRejectedValue(new Error('Google API error'));

      await expect(service.setupWebhookForSheet('conn-123', 'sheet-123'))
        .rejects.toThrow(InternalServerErrorException);
    });

    it('should throw InternalServerErrorException if webhook response is invalid', async () => {
      mockDriveApi.files.watch.mockResolvedValue({ data: {} });

      await expect(service.setupWebhookForSheet('conn-123', 'sheet-123'))
        .rejects.toThrow(InternalServerErrorException);
    });
  });

  describe('handleWebhookNotification', () => {
    const mockNotification: GoogleSheetsWebhookNotification = {
      kind: 'api#channel',
      id: 'webhook-123',
      resourceId: 'resource-123',
      resourceUri: 'https://drive.google.com/file/123',
      resourceState: 'update',
      eventType: 'update',
      eventTime: new Date().toISOString(),
    };

    const mockSubscription = {
      id: 'sub-123',
      connectionId: 'conn-123',
      spreadsheetId: 'sheet-123',
      resourceId: 'resource-123',
      expiration: new Date(Date.now() + 24 * 60 * 60 * 1000),
      isActive: true,
      connection: {
        client: { id: 'client-123' },
      },
    };

    beforeEach(() => {
      prismaService.webhookSubscription.findFirst.mockResolvedValue(mockSubscription as any);
      prismaService.syncOperation.create.mockResolvedValue({
        id: 'sync-123',
        connectionId: 'conn-123',
        spreadsheetId: 'sheet-123',
        operationType: 'webhook',
        status: 'pending',
        ordersProcessed: 0,
        ordersCreated: 0,
        ordersSkipped: 0,
        errorCount: 0,
        startedAt: new Date(),
      } as any);
      orderSyncService.syncOrdersFromSheet.mockResolvedValue({} as any);
    });

    it('should successfully handle webhook notification', async () => {
      await service.handleWebhookNotification(mockNotification);

      expect(prismaService.webhookSubscription.findFirst).toHaveBeenCalledWith({
        where: {
          resourceId: 'resource-123',
          isActive: true,
        },
        include: {
          connection: {
            include: { client: true },
          },
        },
      });
      expect(prismaService.syncOperation.create).toHaveBeenCalled();
      expect(orderSyncService.syncOrdersFromSheet).toHaveBeenCalledWith(
        'conn-123',
        'sheet-123',
        'sync-123'
      );
    });

    it('should ignore non-update events', async () => {
      const nonUpdateNotification = {
        ...mockNotification,
        resourceState: 'sync' as any,
      };

      await service.handleWebhookNotification(nonUpdateNotification);

      expect(prismaService.syncOperation.create).not.toHaveBeenCalled();
      expect(orderSyncService.syncOrdersFromSheet).not.toHaveBeenCalled();
    });

    it('should handle webhook for non-existent subscription gracefully', async () => {
      prismaService.webhookSubscription.findFirst.mockResolvedValue(null);

      await expect(service.handleWebhookNotification(mockNotification))
        .resolves.not.toThrow();

      expect(prismaService.syncOperation.create).not.toHaveBeenCalled();
    });

    it('should handle expired subscription', async () => {
      const expiredSubscription = {
        ...mockSubscription,
        expiration: new Date(Date.now() - 1000), // Expired 1 second ago
      };
      prismaService.webhookSubscription.findFirst.mockResolvedValue(expiredSubscription as any);
      prismaService.webhookSubscription.update.mockResolvedValue({} as any);

      await service.handleWebhookNotification(mockNotification);

      expect(prismaService.webhookSubscription.update).toHaveBeenCalledWith({
        where: { id: 'sub-123' },
        data: { isActive: false },
      });
      expect(prismaService.syncOperation.create).not.toHaveBeenCalled();
    });

    it('should validate webhook signature when provided', async () => {
      const validSignature = 'valid-signature';
      
      // Mock the signature validation to return true
      jest.spyOn(service, 'validateWebhookSignature').mockReturnValue(true);

      await service.handleWebhookNotification(mockNotification, validSignature);

      expect(service.validateWebhookSignature).toHaveBeenCalledWith(
        JSON.stringify(mockNotification),
        validSignature
      );
    });

    it('should reject invalid webhook signature', async () => {
      const invalidSignature = 'invalid-signature';
      
      // Mock the signature validation to return false
      jest.spyOn(service, 'validateWebhookSignature').mockReturnValue(false);

      await expect(service.handleWebhookNotification(mockNotification, invalidSignature))
        .rejects.toThrow(BadRequestException);
    });
  });

  describe('renewWebhookSubscription', () => {
    const mockSubscription = {
      id: 'sub-123',
      connectionId: 'conn-123',
      spreadsheetId: 'sheet-123',
      subscriptionId: 'webhook-123',
      resourceId: 'resource-123',
      isActive: true,
      connection: {
        client: { id: 'client-123' },
      },
    };

    beforeEach(() => {
      prismaService.webhookSubscription.findUnique.mockResolvedValue(mockSubscription as any);
      jest.spyOn(service, 'removeWebhookSubscription').mockResolvedValue();
      jest.spyOn(service, 'setupWebhookForSheet').mockResolvedValue({
        id: 'new-sub-123',
      } as any);
    });

    it('should successfully renew webhook subscription', async () => {
      await service.renewWebhookSubscription('sub-123');

      expect(service.removeWebhookSubscription).toHaveBeenCalledWith('sub-123');
      expect(service.setupWebhookForSheet).toHaveBeenCalledWith('conn-123', 'sheet-123');
    });

    it('should throw BadRequestException if subscription not found', async () => {
      prismaService.webhookSubscription.findUnique.mockResolvedValue(null);

      await expect(service.renewWebhookSubscription('sub-123'))
        .rejects.toThrow(BadRequestException);
    });

    it('should skip renewal for inactive subscription', async () => {
      const inactiveSubscription = { ...mockSubscription, isActive: false };
      prismaService.webhookSubscription.findUnique.mockResolvedValue(inactiveSubscription as any);

      await service.renewWebhookSubscription('sub-123');

      expect(service.removeWebhookSubscription).not.toHaveBeenCalled();
      expect(service.setupWebhookForSheet).not.toHaveBeenCalled();
    });
  });

  describe('removeWebhookSubscription', () => {
    const mockSubscription = {
      id: 'sub-123',
      connectionId: 'conn-123',
      subscriptionId: 'webhook-123',
      resourceId: 'resource-123',
      connection: {
        client: { id: 'client-123' },
      },
    };

    beforeEach(() => {
      prismaService.webhookSubscription.findUnique.mockResolvedValue(mockSubscription as any);
      mockDriveApi.channels.stop.mockResolvedValue({});
      prismaService.webhookSubscription.update.mockResolvedValue({} as any);
      prismaService.spreadsheetConnection.updateMany.mockResolvedValue({} as any);
    });

    it('should successfully remove webhook subscription', async () => {
      await service.removeWebhookSubscription('sub-123');

      expect(mockDriveApi.channels.stop).toHaveBeenCalledWith({
        requestBody: {
          id: 'webhook-123',
          resourceId: 'resource-123',
        },
      });
      expect(prismaService.webhookSubscription.update).toHaveBeenCalledWith({
        where: { id: 'sub-123' },
        data: { 
          isActive: false,
          updatedAt: expect.any(Date),
        },
      });
      expect(prismaService.spreadsheetConnection.updateMany).toHaveBeenCalledWith({
        where: { webhookSubscriptionId: 'sub-123' },
        data: { webhookSubscriptionId: null },
      });
    });

    it('should handle non-existent subscription gracefully', async () => {
      prismaService.webhookSubscription.findUnique.mockResolvedValue(null);

      await expect(service.removeWebhookSubscription('sub-123'))
        .resolves.not.toThrow();

      expect(mockDriveApi.channels.stop).not.toHaveBeenCalled();
    });

    it('should continue even if Google API call fails', async () => {
      mockDriveApi.channels.stop.mockRejectedValue(new Error('Google API error'));

      await service.removeWebhookSubscription('sub-123');

      expect(prismaService.webhookSubscription.update).toHaveBeenCalled();
      expect(prismaService.spreadsheetConnection.updateMany).toHaveBeenCalled();
    });
  });

  describe('validateWebhookSignature', () => {
    it('should validate correct signature', () => {
      const payload = '{"test": "data"}';
      const secret = 'test-webhook-secret';
      
      // Calculate expected signature
      const crypto = require('crypto');
      const expectedSignature = crypto
        .createHmac('sha256', secret)
        .update(payload)
        .digest('hex');

      const result = service.validateWebhookSignature(payload, expectedSignature);

      expect(result).toBe(true);
    });

    it('should reject incorrect signature', () => {
      const payload = '{"test": "data"}';
      const wrongSignature = 'wrong-signature';

      const result = service.validateWebhookSignature(payload, wrongSignature);

      expect(result).toBe(false);
    });

    it('should handle signature validation errors gracefully', () => {
      const payload = '{"test": "data"}';
      const invalidSignature = 'not-hex';

      const result = service.validateWebhookSignature(payload, invalidSignature);

      expect(result).toBe(false);
    });
  });

  describe('getActiveWebhookSubscriptions', () => {
    const mockSubscriptions = [
      {
        id: 'sub-1',
        connectionId: 'conn-123',
        isActive: true,
        createdAt: new Date(),
      },
      {
        id: 'sub-2',
        connectionId: 'conn-123',
        isActive: true,
        createdAt: new Date(),
      },
    ];

    beforeEach(() => {
      prismaService.webhookSubscription.findMany.mockResolvedValue(mockSubscriptions as any);
    });

    it('should return active webhook subscriptions', async () => {
      const result = await service.getActiveWebhookSubscriptions('conn-123');

      expect(result).toEqual(mockSubscriptions);
      expect(prismaService.webhookSubscription.findMany).toHaveBeenCalledWith({
        where: {
          connectionId: 'conn-123',
          isActive: true,
        },
        orderBy: {
          createdAt: 'desc',
        },
      });
    });
  });

  describe('cleanupExpiredSubscriptions', () => {
    const mockExpiredSubscriptions = [
      { id: 'sub-1', expiration: new Date(Date.now() - 1000) },
      { id: 'sub-2', expiration: new Date(Date.now() - 2000) },
    ];

    beforeEach(() => {
      prismaService.webhookSubscription.findMany.mockResolvedValue(mockExpiredSubscriptions as any);
      jest.spyOn(service, 'removeWebhookSubscription').mockResolvedValue();
    });

    it('should cleanup expired subscriptions', async () => {
      await service.cleanupExpiredSubscriptions();

      expect(prismaService.webhookSubscription.findMany).toHaveBeenCalledWith({
        where: {
          isActive: true,
          expiration: {
            lt: expect.any(Date),
          },
        },
      });
      expect(service.removeWebhookSubscription).toHaveBeenCalledTimes(2);
      expect(service.removeWebhookSubscription).toHaveBeenCalledWith('sub-1');
      expect(service.removeWebhookSubscription).toHaveBeenCalledWith('sub-2');
    });

    it('should continue cleanup even if individual removal fails', async () => {
      jest.spyOn(service, 'removeWebhookSubscription')
        .mockRejectedValueOnce(new Error('Removal failed'))
        .mockResolvedValueOnce();

      await service.cleanupExpiredSubscriptions();

      expect(service.removeWebhookSubscription).toHaveBeenCalledTimes(2);
    });
  });

  describe('renewExpiringSubscriptions', () => {
    const mockExpiringSubscriptions = [
      { 
        id: 'sub-1', 
        expiration: new Date(Date.now() + 60 * 60 * 1000), // 1 hour from now
      },
      { 
        id: 'sub-2', 
        expiration: new Date(Date.now() + 30 * 60 * 1000), // 30 minutes from now
      },
    ];

    beforeEach(() => {
      prismaService.webhookSubscription.findMany.mockResolvedValue(mockExpiringSubscriptions as any);
      jest.spyOn(service, 'renewWebhookSubscription').mockResolvedValue();
    });

    it('should renew expiring subscriptions', async () => {
      await service.renewExpiringSubscriptions();

      expect(prismaService.webhookSubscription.findMany).toHaveBeenCalledWith({
        where: {
          isActive: true,
          expiration: {
            gte: expect.any(Date),
            lte: expect.any(Date), // 2 hours from now
          },
        },
      });
      expect(service.renewWebhookSubscription).toHaveBeenCalledTimes(2);
      expect(service.renewWebhookSubscription).toHaveBeenCalledWith('sub-1');
      expect(service.renewWebhookSubscription).toHaveBeenCalledWith('sub-2');
    });

    it('should continue renewal even if individual renewal fails', async () => {
      jest.spyOn(service, 'renewWebhookSubscription')
        .mockRejectedValueOnce(new Error('Renewal failed'))
        .mockResolvedValueOnce();

      await service.renewExpiringSubscriptions();

      expect(service.renewWebhookSubscription).toHaveBeenCalledTimes(2);
    });
  });
});