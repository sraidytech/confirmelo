import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { WebhookController } from '../webhook.controller';
import { WebhookManagementService } from '../../services/webhook-management.service';
import { GoogleSheetsWebhookNotification } from '../../../../common/interfaces/google-sheets-order-sync.interface';

describe('WebhookController', () => {
  let controller: WebhookController;
  let webhookManagementService: jest.Mocked<WebhookManagementService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [WebhookController],
      providers: [
        {
          provide: WebhookManagementService,
          useValue: {
            handleWebhookNotification: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get<WebhookController>(WebhookController);
    webhookManagementService = module.get(WebhookManagementService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('handleWebhookNotification', () => {
    const validHeaders = {
      channelId: 'webhook-123',
      channelToken: 'token-123',
      resourceId: 'resource-123',
      resourceState: 'update',
      resourceUri: 'https://drive.google.com/file/123',
      messageNumber: '1',
      signature: 'signature-123',
    };

    it('should successfully handle webhook notification', async () => {
      webhookManagementService.handleWebhookNotification.mockResolvedValue();

      const result = await controller.handleWebhookNotification(
        validHeaders.channelId,
        validHeaders.channelToken,
        validHeaders.resourceId,
        validHeaders.resourceState,
        validHeaders.resourceUri,
        validHeaders.messageNumber,
        validHeaders.signature,
        {}
      );

      expect(result).toEqual({
        success: true,
        message: 'Webhook notification processed successfully',
      });

      expect(webhookManagementService.handleWebhookNotification).toHaveBeenCalledWith(
        {
          kind: 'api#channel',
          id: 'webhook-123',
          resourceId: 'resource-123',
          resourceUri: 'https://drive.google.com/file/123',
          resourceState: 'update',
          eventType: 'update',
          eventTime: expect.any(String),
          token: 'token-123',
        },
        'signature-123'
      );
    });

    it('should throw BadRequestException for missing required headers', async () => {
      await expect(
        controller.handleWebhookNotification(
          '', // Missing channelId
          validHeaders.channelToken,
          validHeaders.resourceId,
          validHeaders.resourceState,
          validHeaders.resourceUri,
          validHeaders.messageNumber,
          validHeaders.signature,
          {}
        )
      ).rejects.toThrow(BadRequestException);

      expect(webhookManagementService.handleWebhookNotification).not.toHaveBeenCalled();
    });

    it('should throw BadRequestException for missing resourceId', async () => {
      await expect(
        controller.handleWebhookNotification(
          validHeaders.channelId,
          validHeaders.channelToken,
          '', // Missing resourceId
          validHeaders.resourceState,
          validHeaders.resourceUri,
          validHeaders.messageNumber,
          validHeaders.signature,
          {}
        )
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException for missing resourceState', async () => {
      await expect(
        controller.handleWebhookNotification(
          validHeaders.channelId,
          validHeaders.channelToken,
          validHeaders.resourceId,
          '', // Missing resourceState
          validHeaders.resourceUri,
          validHeaders.messageNumber,
          validHeaders.signature,
          {}
        )
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException for missing resourceUri', async () => {
      await expect(
        controller.handleWebhookNotification(
          validHeaders.channelId,
          validHeaders.channelToken,
          validHeaders.resourceId,
          validHeaders.resourceState,
          '', // Missing resourceUri
          validHeaders.messageNumber,
          validHeaders.signature,
          {}
        )
      ).rejects.toThrow(BadRequestException);
    });

    it('should handle webhook service BadRequestException', async () => {
      webhookManagementService.handleWebhookNotification.mockRejectedValue(
        new BadRequestException('Invalid signature')
      );

      await expect(
        controller.handleWebhookNotification(
          validHeaders.channelId,
          validHeaders.channelToken,
          validHeaders.resourceId,
          validHeaders.resourceState,
          validHeaders.resourceUri,
          validHeaders.messageNumber,
          validHeaders.signature,
          {}
        )
      ).rejects.toThrow(BadRequestException);
    });

    it('should return failure response for other webhook service errors', async () => {
      webhookManagementService.handleWebhookNotification.mockRejectedValue(
        new Error('Internal error')
      );

      const result = await controller.handleWebhookNotification(
        validHeaders.channelId,
        validHeaders.channelToken,
        validHeaders.resourceId,
        validHeaders.resourceState,
        validHeaders.resourceUri,
        validHeaders.messageNumber,
        validHeaders.signature,
        {}
      );

      expect(result).toEqual({
        success: false,
        message: 'Webhook notification processing failed',
      });
    });

    it('should handle webhook notification without optional headers', async () => {
      webhookManagementService.handleWebhookNotification.mockResolvedValue();

      const result = await controller.handleWebhookNotification(
        validHeaders.channelId,
        undefined, // No token
        validHeaders.resourceId,
        validHeaders.resourceState,
        validHeaders.resourceUri,
        validHeaders.messageNumber,
        undefined, // No signature
        {}
      );

      expect(result).toEqual({
        success: true,
        message: 'Webhook notification processed successfully',
      });

      expect(webhookManagementService.handleWebhookNotification).toHaveBeenCalledWith(
        {
          kind: 'api#channel',
          id: 'webhook-123',
          resourceId: 'resource-123',
          resourceUri: 'https://drive.google.com/file/123',
          resourceState: 'update',
          eventType: 'update',
          eventTime: expect.any(String),
          token: undefined,
        },
        undefined
      );
    });

    it('should create proper notification object with all fields', async () => {
      webhookManagementService.handleWebhookNotification.mockResolvedValue();

      await controller.handleWebhookNotification(
        validHeaders.channelId,
        validHeaders.channelToken,
        validHeaders.resourceId,
        validHeaders.resourceState,
        validHeaders.resourceUri,
        validHeaders.messageNumber,
        validHeaders.signature,
        {}
      );

      const expectedNotification: GoogleSheetsWebhookNotification = {
        kind: 'api#channel',
        id: 'webhook-123',
        resourceId: 'resource-123',
        resourceUri: 'https://drive.google.com/file/123',
        resourceState: 'update',
        eventType: 'update',
        eventTime: expect.any(String),
        token: 'token-123',
      };

      expect(webhookManagementService.handleWebhookNotification).toHaveBeenCalledWith(
        expectedNotification,
        'signature-123'
      );
    });
  });

  describe('healthCheck', () => {
    it('should return health status', async () => {
      const result = await controller.healthCheck();

      expect(result).toEqual({
        status: 'healthy',
        timestamp: expect.any(String),
      });

      // Verify timestamp is a valid ISO string
      expect(() => new Date(result.timestamp)).not.toThrow();
    });

    it('should return current timestamp', async () => {
      const beforeCall = new Date();
      const result = await controller.healthCheck();
      const afterCall = new Date();

      const resultTime = new Date(result.timestamp);
      expect(resultTime.getTime()).toBeGreaterThanOrEqual(beforeCall.getTime());
      expect(resultTime.getTime()).toBeLessThanOrEqual(afterCall.getTime());
    });
  });
});