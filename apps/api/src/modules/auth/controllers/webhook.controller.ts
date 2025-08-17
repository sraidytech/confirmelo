import { Controller, Post, Body, Headers, Logger, HttpCode, HttpStatus, Get, BadRequestException } from '@nestjs/common';
import { OrderSyncService } from '../services/order-sync.service';
import { PrismaService } from '../../../common/database/prisma.service';
import { WebhookManagementService } from '../services/webhook-management.service';
import { GoogleSheetsWebhookNotification } from '../../../common/interfaces/google-sheets-order-sync.interface';

@Controller('api/webhooks')
export class WebhookController {
  private readonly logger = new Logger(WebhookController.name);

  constructor(
    private readonly orderSyncService: OrderSyncService,
    private readonly prismaService: PrismaService,
    private readonly webhookManagementService: WebhookManagementService,
  ) {}

  /**
   * Handle Google Drive webhook notifications
   */
  @Post('google-drive')
  @HttpCode(HttpStatus.OK)
  async handleGoogleDriveWebhook(
    @Headers() headers: any,
    @Body() body: any,
  ): Promise<{ success: boolean }> {
    try {
      const resourceId = headers['x-goog-resource-id'];
      const resourceState = headers['x-goog-resource-state'];
      const channelId = headers['x-goog-channel-id'];

      this.logger.log('Received Google Drive webhook', {
        resourceId,
        resourceState,
        channelId,
        headers: {
          'x-goog-resource-uri': headers['x-goog-resource-uri'],
          'x-goog-changed': headers['x-goog-changed'],
        },
      });

      // Only process 'update' events (when spreadsheet is modified)
      if (resourceState !== 'update') {
        this.logger.debug('Ignoring non-update webhook event', { resourceState });
        return { success: true };
      }

      // Find the webhook subscription
      const subscription = await this.prismaService.webhookSubscription.findFirst({
        where: {
          resourceId: resourceId,
          isActive: true,
        },
        include: {
          connection: {
            include: {
              spreadsheetConnections: {
                where: {
                  isOrderSync: true,
                  isActive: true,
                },
              },
            },
          },
        },
      });

      if (!subscription) {
        this.logger.warn('No active subscription found for webhook', { resourceId, channelId });
        return { success: true };
      }

      // Find the spreadsheet connection for this webhook
      const spreadsheetConnection = subscription.connection.spreadsheetConnections.find(
        sc => sc.spreadsheetId === subscription.spreadsheetId
      );

      if (!spreadsheetConnection) {
        this.logger.warn('No spreadsheet connection found for webhook', {
          resourceId,
          spreadsheetId: subscription.spreadsheetId,
        });
        return { success: true };
      }

      this.logger.log('Triggering automatic order sync from webhook', {
        connectionId: subscription.connectionId,
        spreadsheetId: subscription.spreadsheetId,
        spreadsheetConnectionId: spreadsheetConnection.id,
      });

      // Trigger automatic sync (don't await to avoid webhook timeout)
      this.triggerAutoSync(
        subscription.connectionId,
        subscription.spreadsheetId,
        'webhook'
      ).catch(error => {
        this.logger.error('Auto-sync failed after webhook trigger', {
          error: error.message,
          connectionId: subscription.connectionId,
          spreadsheetId: subscription.spreadsheetId,
        });
      });

      return { success: true };
    } catch (error) {
      this.logger.error('Error processing Google Drive webhook', {
        error: error.message,
        headers,
        body,
      });
      
      // Return success to avoid Google retrying the webhook
      return { success: true };
    }
  }

  /**
   * Handle webhook notification with proper validation and service delegation
   */
  @Post('notification')
  @HttpCode(HttpStatus.OK)
  async handleWebhookNotification(
    channelId: string,
    channelToken: string | undefined,
    resourceId: string,
    resourceState: string,
    resourceUri: string,
    messageNumber: string,
    signature: string | undefined,
    body: any,
  ): Promise<{ success: boolean; message: string }> {
    try {
      // Validate required parameters
      if (!channelId || !resourceId || !resourceState || !resourceUri) {
        throw new BadRequestException('Missing required webhook headers');
      }

      // Validate and normalize resourceState
      const validResourceStates = ['sync', 'exists', 'not_exists', 'update'] as const;
      const normalizedResourceState = validResourceStates.includes(resourceState as any) 
        ? resourceState as 'sync' | 'exists' | 'not_exists' | 'update'
        : 'update'; // Default to 'update' for unknown states

      // Create notification object
      const notification: GoogleSheetsWebhookNotification = {
        kind: 'api#channel',
        id: channelId,
        resourceId,
        resourceUri,
        resourceState: normalizedResourceState,
        eventType: resourceState,
        eventTime: new Date().toISOString(),
        token: channelToken,
      };

      // Delegate to webhook management service
      await this.webhookManagementService.handleWebhookNotification(notification, signature);

      return {
        success: true,
        message: 'Webhook notification processed successfully',
      };
    } catch (error) {
      this.logger.error('Error processing webhook notification', {
        error: error.message,
        channelId,
        resourceId,
      });

      if (error instanceof BadRequestException) {
        throw error;
      }

      return {
        success: false,
        message: 'Webhook notification processing failed',
      };
    }
  }

  /**
   * Health check endpoint
   */
  @Get('health')
  async healthCheck(): Promise<{ status: string; timestamp: string }> {
    return {
      status: 'healthy',
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Trigger automatic sync (async)
   */
  private async triggerAutoSync(
    connectionId: string,
    spreadsheetId: string,
    operationType: string,
  ): Promise<void> {
    try {
      // Create sync operation
      const syncOperation = await this.prismaService.syncOperation.create({
        data: {
          connectionId,
          spreadsheetId,
          operationType,
          status: 'pending',
        },
      });

      // Perform the sync
      const result = await this.orderSyncService.syncOrdersFromSheet(
        connectionId,
        spreadsheetId,
        syncOperation.id,
        {
          forceResync: false, // Only sync new/changed orders
        }
      );

      this.logger.log('Auto-sync completed successfully', {
        connectionId,
        spreadsheetId,
        syncOperationId: syncOperation.id,
        ordersProcessed: result.ordersProcessed,
        ordersCreated: result.ordersCreated,
        ordersSkipped: result.ordersSkipped,
      });
    } catch (error) {
      this.logger.error('Auto-sync failed', {
        error: error.message,
        connectionId,
        spreadsheetId,
        operationType,
      });
      throw error;
    }
  }
}