import { WebhookManagementService } from '../webhook-management.service';
import { GoogleSheetsWebhookNotification } from '../../../../common/interfaces/google-sheets-order-sync.interface';

describe('WebhookManagementService - Core Logic', () => {
  let service: WebhookManagementService;

  // Mock dependencies
  const mockPrismaService = {
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
  };

  const mockGoogleSheetsOAuth2Service = {
    getOAuth2Client: jest.fn(),
  };

  const mockOrderSyncService = {
    syncOrdersFromSheet: jest.fn(),
  };

  const mockConfigService = {
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
  };

  beforeEach(() => {
    // Create service instance with mocked dependencies
    service = new WebhookManagementService(
      mockPrismaService as any,
      mockGoogleSheetsOAuth2Service as any,
      mockOrderSyncService as any,
      mockConfigService as any,
    );

    // Reset all mocks
    jest.clearAllMocks();
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

  describe('handleWebhookNotification - Basic Logic', () => {
    it('should ignore non-update events', async () => {
      const notification: GoogleSheetsWebhookNotification = {
        kind: 'api#channel',
        id: 'webhook-123',
        resourceId: 'resource-123',
        resourceUri: 'https://drive.google.com/file/sheet-123',
        resourceState: 'sync', // Non-update event
        eventType: 'sync',
        eventTime: new Date().toISOString(),
      };

      mockPrismaService.webhookSubscription.findFirst.mockResolvedValue({
        id: 'sub-123',
        connectionId: 'conn-123',
        spreadsheetId: 'sheet-123',
        resourceId: 'resource-123',
        expiration: new Date(Date.now() + 24 * 60 * 60 * 1000),
        isActive: true,
        connection: {
          client: { id: 'client-123' },
        },
      });

      await service.handleWebhookNotification(notification);

      // Should not create sync operation for non-update events
      expect(mockPrismaService.syncOperation.create).not.toHaveBeenCalled();
      expect(mockOrderSyncService.syncOrdersFromSheet).not.toHaveBeenCalled();
    });

    it('should handle webhook for non-existent subscription gracefully', async () => {
      const notification: GoogleSheetsWebhookNotification = {
        kind: 'api#channel',
        id: 'webhook-123',
        resourceId: 'non-existent-resource',
        resourceUri: 'https://drive.google.com/file/sheet-123',
        resourceState: 'update',
        eventType: 'update',
        eventTime: new Date().toISOString(),
      };

      mockPrismaService.webhookSubscription.findFirst.mockResolvedValue(null);

      // Should not throw error
      await expect(service.handleWebhookNotification(notification))
        .resolves.not.toThrow();

      // Should not trigger sync
      expect(mockOrderSyncService.syncOrdersFromSheet).not.toHaveBeenCalled();
    });

    it('should handle expired subscription', async () => {
      const notification: GoogleSheetsWebhookNotification = {
        kind: 'api#channel',
        id: 'webhook-123',
        resourceId: 'resource-123',
        resourceUri: 'https://drive.google.com/file/sheet-123',
        resourceState: 'update',
        eventType: 'update',
        eventTime: new Date().toISOString(),
      };

      const expiredSubscription = {
        id: 'sub-123',
        connectionId: 'conn-123',
        spreadsheetId: 'sheet-123',
        resourceId: 'resource-123',
        expiration: new Date(Date.now() - 1000), // Expired 1 second ago
        isActive: true,
        connection: {
          client: { id: 'client-123' },
        },
      };

      mockPrismaService.webhookSubscription.findFirst.mockResolvedValue(expiredSubscription);
      mockPrismaService.webhookSubscription.update.mockResolvedValue({});

      await service.handleWebhookNotification(notification);

      expect(mockPrismaService.webhookSubscription.update).toHaveBeenCalledWith({
        where: { id: 'sub-123' },
        data: { isActive: false },
      });
      expect(mockPrismaService.syncOperation.create).not.toHaveBeenCalled();
    });
  });

  describe('Configuration and Setup', () => {
    it('should initialize with correct webhook URL from config', () => {
      // Create a new service to test initialization with no WEBHOOK_URL
      const configSpy = jest.fn().mockImplementation((key: string) => {
        switch (key) {
          case 'GOOGLE_SHEETS_WEBHOOK_URL':
            return undefined; // Force fallback to API_BASE_URL
          case 'API_BASE_URL':
            return 'https://api.example.com';
          case 'GOOGLE_SHEETS_WEBHOOK_SECRET':
            return 'test-webhook-secret';
          default:
            return undefined;
        }
      });

      const testConfigService = { get: configSpy };
      
      new WebhookManagementService(
        mockPrismaService as any,
        mockGoogleSheetsOAuth2Service as any,
        mockOrderSyncService as any,
        testConfigService as any,
      );

      // Config should be called during service initialization
      expect(configSpy).toHaveBeenCalledWith('GOOGLE_SHEETS_WEBHOOK_URL');
      expect(configSpy).toHaveBeenCalledWith('API_BASE_URL');
      expect(configSpy).toHaveBeenCalledWith('GOOGLE_SHEETS_WEBHOOK_SECRET');
    });

    it('should use default values when config is not provided', () => {
      const configServiceWithDefaults = {
        get: jest.fn().mockReturnValue(undefined),
      };

      const serviceWithDefaults = new WebhookManagementService(
        mockPrismaService as any,
        mockGoogleSheetsOAuth2Service as any,
        mockOrderSyncService as any,
        configServiceWithDefaults as any,
      );

      // Service should still be created with default values
      expect(serviceWithDefaults).toBeDefined();
    });
  });

  describe('Error Handling', () => {
    it('should handle webhook notification processing errors gracefully', async () => {
      const notification: GoogleSheetsWebhookNotification = {
        kind: 'api#channel',
        id: 'webhook-123',
        resourceId: 'resource-123',
        resourceUri: 'https://drive.google.com/file/sheet-123',
        resourceState: 'update',
        eventType: 'update',
        eventTime: new Date().toISOString(),
      };

      // Mock database error
      mockPrismaService.webhookSubscription.findFirst.mockRejectedValue(
        new Error('Database connection failed')
      );

      // Should not throw error even if processing fails
      await expect(service.handleWebhookNotification(notification))
        .resolves.not.toThrow();
    });

    it('should validate webhook signature when provided', async () => {
      const notification: GoogleSheetsWebhookNotification = {
        kind: 'api#channel',
        id: 'webhook-123',
        resourceId: 'resource-123',
        resourceUri: 'https://drive.google.com/file/sheet-123',
        resourceState: 'update',
        eventType: 'update',
        eventTime: new Date().toISOString(),
      };

      const invalidSignature = 'invalid-signature';
      
      // Mock a subscription to be found so signature validation is triggered
      mockPrismaService.webhookSubscription.findFirst.mockResolvedValue({
        id: 'sub-123',
        connectionId: 'conn-123',
        spreadsheetId: 'sheet-123',
        resourceId: 'resource-123',
        expiration: new Date(Date.now() + 24 * 60 * 60 * 1000),
        isActive: true,
        connection: {
          client: { id: 'client-123' },
        },
      });
      
      // Should handle invalid signature gracefully (logs error but doesn't throw)
      await expect(service.handleWebhookNotification(notification, invalidSignature))
        .resolves.not.toThrow();
        
      // Should not trigger sync for invalid signature
      expect(mockOrderSyncService.syncOrdersFromSheet).not.toHaveBeenCalled();
    });
  });

  describe('Token Generation', () => {
    it('should generate consistent webhook tokens', () => {
      const connectionId = 'conn-123';
      const spreadsheetId = 'sheet-123';

      // Access private method through any cast for testing
      const token1 = (service as any).generateWebhookToken(connectionId, spreadsheetId);
      const token2 = (service as any).generateWebhookToken(connectionId, spreadsheetId);

      expect(token1).toBe(token2);
      expect(token1).toMatch(/^[a-f0-9]{64}$/); // Should be a 64-character hex string
    });

    it('should generate different tokens for different inputs', () => {
      const token1 = (service as any).generateWebhookToken('conn-123', 'sheet-123');
      const token2 = (service as any).generateWebhookToken('conn-456', 'sheet-456');

      expect(token1).not.toBe(token2);
    });
  });
});