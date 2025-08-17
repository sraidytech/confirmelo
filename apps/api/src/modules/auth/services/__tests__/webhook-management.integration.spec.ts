import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { WebhookManagementService } from '../webhook-management.service';
import { OrderSyncService } from '../order-sync.service';
import { PrismaService } from '../../../../common/database/prisma.service';
import { GoogleSheetsOAuth2Service } from '../google-sheets-oauth2.service';
import { GoogleSheetsWebhookNotification } from '../../../../common/interfaces/google-sheets-order-sync.interface';

describe('WebhookManagementService Integration', () => {
  let service: WebhookManagementService;
  let prismaService: PrismaService;
  let orderSyncService: OrderSyncService;

  // Mock data
  const mockClient = {
    id: 'client-123',
    name: 'Test Client',
    organizationId: 'org-123',
  };

  const mockConnection = {
    id: 'conn-123',
    clientId: 'client-123',
    spreadsheetId: 'sheet-123',
    isOrderSync: true,
    webhookSubscriptionId: null,
    client: mockClient,
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
    connection: {
      ...mockConnection,
      client: mockClient,
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WebhookManagementService,
        {
          provide: PrismaService,
          useFactory: () => ({
            spreadsheetConnection: {
              findUnique: jest.fn(),
              update: jest.fn(),
              updateMany: jest.fn(),
            },
            webhookSubscription: {
              create: jest.fn(),
              findFirst: jest.fn(),
              findUnique: jest.fn(),
              findMany: jest.fn(),
              update: jest.fn(),
            },
            syncOperation: {
              create: jest.fn(),
              updateMany: jest.fn(),
            },
            platformConnection: {
              findFirst: jest.fn(),
            },
          }),
        },
        {
          provide: GoogleSheetsOAuth2Service,
          useValue: {
            getOAuth2Client: jest.fn().mockResolvedValue({
              credentials: {
                access_token: 'mock-token',
                refresh_token: 'mock-refresh-token',
              },
            }),
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
            get: jest.fn().mockImplementation((key: string) => {
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
            }),
          },
        },
      ],
    }).compile();

    service = module.get<WebhookManagementService>(WebhookManagementService);
    prismaService = module.get<PrismaService>(PrismaService);
    orderSyncService = module.get<OrderSyncService>(OrderSyncService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('End-to-End Webhook Flow', () => {
    it('should handle complete webhook lifecycle', async () => {
      // Setup mocks
      (prismaService.spreadsheetConnection.findUnique as jest.Mock)
        .mockResolvedValue(mockConnection);
      (prismaService.webhookSubscription.create as jest.Mock)
        .mockResolvedValue(mockSubscription);
      (prismaService.spreadsheetConnection.update as jest.Mock)
        .mockResolvedValue({});
      (prismaService.webhookSubscription.findFirst as jest.Mock)
        .mockResolvedValue(mockSubscription);
      (prismaService.syncOperation.create as jest.Mock)
        .mockResolvedValue({
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
        });
      (orderSyncService.syncOrdersFromSheet as jest.Mock)
        .mockResolvedValue({
          success: true,
          ordersProcessed: 5,
          ordersCreated: 3,
          ordersSkipped: 2,
          errors: [],
        });

      // Mock Google Drive API
      const mockDriveApi = {
        files: {
          watch: jest.fn().mockResolvedValue({
            data: {
              id: 'webhook-123',
              resourceId: 'resource-123',
              expiration: String(Date.now() + 24 * 60 * 60 * 1000),
            },
          }),
        },
        channels: {
          stop: jest.fn().mockResolvedValue({}),
        },
      };

      // Mock googleapis
      jest.doMock('googleapis', () => ({
        google: {
          drive: jest.fn().mockReturnValue(mockDriveApi),
        },
      }));

      // Step 1: Setup webhook subscription
      const subscription = await service.setupWebhookForSheet('conn-123', 'sheet-123');
      expect(subscription).toBeDefined();
      expect(subscription.connectionId).toBe('conn-123');
      expect(subscription.spreadsheetId).toBe('sheet-123');

      // Step 2: Handle webhook notification
      const notification: GoogleSheetsWebhookNotification = {
        kind: 'api#channel',
        id: 'webhook-123',
        resourceId: 'resource-123',
        resourceUri: 'https://drive.google.com/file/sheet-123',
        resourceState: 'update',
        eventType: 'update',
        eventTime: new Date().toISOString(),
      };

      await service.handleWebhookNotification(notification);

      // Verify sync was triggered
      expect(prismaService.syncOperation.create).toHaveBeenCalledWith({
        data: {
          connectionId: 'conn-123',
          spreadsheetId: 'sheet-123',
          operationType: 'webhook',
          status: 'pending',
          ordersProcessed: 0,
          ordersCreated: 0,
          ordersSkipped: 0,
          errorCount: 0,
          startedAt: expect.any(Date),
        },
      });

      expect(orderSyncService.syncOrdersFromSheet).toHaveBeenCalledWith(
        'conn-123',
        'sheet-123',
        'sync-123'
      );

      // Step 3: Remove webhook subscription
      (prismaService.webhookSubscription.findUnique as jest.Mock)
        .mockResolvedValue(mockSubscription);
      (prismaService.webhookSubscription.update as jest.Mock)
        .mockResolvedValue({});
      (prismaService.spreadsheetConnection.updateMany as jest.Mock)
        .mockResolvedValue({});

      await service.removeWebhookSubscription('sub-123');

      expect(prismaService.webhookSubscription.update).toHaveBeenCalledWith({
        where: { id: 'sub-123' },
        data: { 
          isActive: false,
          updatedAt: expect.any(Date),
        },
      });
    });

    it('should handle webhook notification with signature validation', async () => {
      // Setup mocks
      (prismaService.webhookSubscription.findFirst as jest.Mock)
        .mockResolvedValue(mockSubscription);
      (prismaService.syncOperation.create as jest.Mock)
        .mockResolvedValue({
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
        });
      (orderSyncService.syncOrdersFromSheet as jest.Mock)
        .mockResolvedValue({});

      const notification: GoogleSheetsWebhookNotification = {
        kind: 'api#channel',
        id: 'webhook-123',
        resourceId: 'resource-123',
        resourceUri: 'https://drive.google.com/file/sheet-123',
        resourceState: 'update',
        eventType: 'update',
        eventTime: new Date().toISOString(),
      };

      // Calculate valid signature
      const crypto = require('crypto');
      const payload = JSON.stringify(notification);
      const validSignature = crypto
        .createHmac('sha256', 'test-webhook-secret')
        .update(payload)
        .digest('hex');

      // Test with valid signature
      await service.handleWebhookNotification(notification, validSignature);

      expect(orderSyncService.syncOrdersFromSheet).toHaveBeenCalled();
    });

    it('should handle webhook subscription renewal workflow', async () => {
      // Setup mocks for renewal
      (prismaService.webhookSubscription.findUnique as jest.Mock)
        .mockResolvedValue(mockSubscription);
      (prismaService.webhookSubscription.findMany as jest.Mock)
        .mockResolvedValue([mockSubscription]);

      // Mock removal and setup
      jest.spyOn(service, 'removeWebhookSubscription').mockResolvedValue();
      jest.spyOn(service, 'setupWebhookForSheet').mockResolvedValue({
        id: 'new-sub-123',
        connectionId: 'conn-123',
        spreadsheetId: 'sheet-123',
        subscriptionId: 'new-webhook-123',
        resourceId: 'new-resource-123',
        expiration: new Date(Date.now() + 24 * 60 * 60 * 1000),
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      // Test renewal of expiring subscriptions
      await service.renewExpiringSubscriptions();

      expect(service.removeWebhookSubscription).toHaveBeenCalledWith('sub-123');
      expect(service.setupWebhookForSheet).toHaveBeenCalledWith('conn-123', 'sheet-123');
    });

    it('should handle cleanup of expired subscriptions', async () => {
      const expiredSubscription = {
        ...mockSubscription,
        expiration: new Date(Date.now() - 1000), // Expired 1 second ago
      };

      (prismaService.webhookSubscription.findMany as jest.Mock)
        .mockResolvedValue([expiredSubscription]);

      jest.spyOn(service, 'removeWebhookSubscription').mockResolvedValue();

      await service.cleanupExpiredSubscriptions();

      expect(service.removeWebhookSubscription).toHaveBeenCalledWith('sub-123');
    });

    it('should handle error recovery in webhook processing', async () => {
      // Setup mocks
      (prismaService.webhookSubscription.findFirst as jest.Mock)
        .mockResolvedValue(mockSubscription);
      (prismaService.syncOperation.create as jest.Mock)
        .mockResolvedValue({
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
        });
      (orderSyncService.syncOrdersFromSheet as jest.Mock)
        .mockRejectedValue(new Error('Sync failed'));
      (prismaService.syncOperation.updateMany as jest.Mock)
        .mockResolvedValue({});

      const notification: GoogleSheetsWebhookNotification = {
        kind: 'api#channel',
        id: 'webhook-123',
        resourceId: 'resource-123',
        resourceUri: 'https://drive.google.com/file/sheet-123',
        resourceState: 'update',
        eventType: 'update',
        eventTime: new Date().toISOString(),
      };

      // Should not throw error even if sync fails
      await expect(service.handleWebhookNotification(notification))
        .resolves.not.toThrow();

      // Should update sync operation with error
      expect(prismaService.syncOperation.updateMany).toHaveBeenCalledWith({
        where: {
          connectionId: 'conn-123',
          spreadsheetId: 'sheet-123',
          status: 'pending',
        },
        data: {
          status: 'failed',
          errorCount: 1,
          errorDetails: [{
            rowNumber: 0,
            errorType: 'system',
            errorMessage: 'Webhook sync failed: Sync failed',
            orderData: {},
          }],
          completedAt: expect.any(Date),
        },
      });
    });

    it('should handle multiple active subscriptions for a connection', async () => {
      const multipleSubscriptions = [
        mockSubscription,
        {
          ...mockSubscription,
          id: 'sub-456',
          subscriptionId: 'webhook-456',
          resourceId: 'resource-456',
        },
      ];

      (prismaService.webhookSubscription.findMany as jest.Mock)
        .mockResolvedValue(multipleSubscriptions);

      const result = await service.getActiveWebhookSubscriptions('conn-123');

      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('sub-123');
      expect(result[1].id).toBe('sub-456');
    });
  });

  describe('Error Scenarios', () => {
    it('should handle database connection failures gracefully', async () => {
      (prismaService.spreadsheetConnection.findUnique as jest.Mock)
        .mockRejectedValue(new Error('Database connection failed'));

      await expect(service.setupWebhookForSheet('conn-123', 'sheet-123'))
        .rejects.toThrow('Failed to setup webhook subscription');
    });

    it('should handle Google API rate limiting', async () => {
      (prismaService.spreadsheetConnection.findUnique as jest.Mock)
        .mockResolvedValue(mockConnection);

      // Mock Google API rate limit error
      const mockDriveApi = {
        files: {
          watch: jest.fn().mockRejectedValue({
            code: 403,
            message: 'Rate limit exceeded',
          }),
        },
      };

      jest.doMock('googleapis', () => ({
        google: {
          drive: jest.fn().mockReturnValue(mockDriveApi),
        },
      }));

      await expect(service.setupWebhookForSheet('conn-123', 'sheet-123'))
        .rejects.toThrow('Failed to setup webhook subscription');
    });

    it('should handle webhook notification for non-existent subscription', async () => {
      (prismaService.webhookSubscription.findFirst as jest.Mock)
        .mockResolvedValue(null);

      const notification: GoogleSheetsWebhookNotification = {
        kind: 'api#channel',
        id: 'webhook-123',
        resourceId: 'non-existent-resource',
        resourceUri: 'https://drive.google.com/file/sheet-123',
        resourceState: 'update',
        eventType: 'update',
        eventTime: new Date().toISOString(),
      };

      // Should not throw error
      await expect(service.handleWebhookNotification(notification))
        .resolves.not.toThrow();

      // Should not trigger sync
      expect(orderSyncService.syncOrdersFromSheet).not.toHaveBeenCalled();
    });
  });
});