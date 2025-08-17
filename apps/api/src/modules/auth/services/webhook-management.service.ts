import { Injectable, Logger, BadRequestException, InternalServerErrorException } from '@nestjs/common';
import { PrismaService } from '../../../common/database/prisma.service';
import { GoogleSheetsOAuth2Service } from './google-sheets-oauth2.service';
import { QueueIntegrationService } from '../../queue-integration/services/queue-integration.service';
import { 
  WebhookSubscription, 
  GoogleSheetsWebhookNotification,
  SyncOperation 
} from '../../../common/interfaces/google-sheets-order-sync.interface';
import { google } from 'googleapis';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';

/**
 * Service for managing Google Sheets webhook subscriptions
 * Handles webhook setup, renewal, cleanup, and notification processing
 */
@Injectable()
export class WebhookManagementService {
  private readonly logger = new Logger(WebhookManagementService.name);
  private readonly webhookUrl: string;
  private readonly webhookSecret: string;

  constructor(
    private readonly prismaService: PrismaService,
    private readonly googleSheetsOAuth2Service: GoogleSheetsOAuth2Service,
    private readonly queueIntegrationService: QueueIntegrationService,
    private readonly configService: ConfigService,
  ) {
    this.webhookUrl = this.configService.get<string>('GOOGLE_SHEETS_WEBHOOK_URL') || 
      `${this.configService.get<string>('API_BASE_URL')}/api/google-sheets/webhook`;
    this.webhookSecret = this.configService.get<string>('GOOGLE_SHEETS_WEBHOOK_SECRET') || 
      'default-webhook-secret';
  }

  /**
   * Set up webhook subscription for a spreadsheet
   */
  async setupWebhookForSheet(
    connectionId: string, 
    spreadsheetId: string
  ): Promise<WebhookSubscription> {
    this.logger.log('Setting up webhook subscription', {
      connectionId,
      spreadsheetId,
    });

    try {
      // Get the spreadsheet connection to access platform connection
      const spreadsheetConnection = await this.prismaService.spreadsheetConnection.findUnique({
        where: { id: connectionId },
        include: { 
          connection: {
            include: { user: true }
          }
        },
      });

      if (!spreadsheetConnection) {
        throw new BadRequestException('Spreadsheet connection not found');
      }

      // Get OAuth2 client using the user ID (which maps to client in our context)
      const oauth2Client = await this.googleSheetsOAuth2Service.getOAuth2Client(
        spreadsheetConnection.connection.userId
      );

      // Set up Google Drive API client
      const drive = google.drive({ version: 'v3', auth: oauth2Client });

      // Create webhook subscription using Google Drive API
      const watchResponse = await drive.files.watch({
        fileId: spreadsheetId,
        requestBody: {
          id: `webhook_${connectionId}_${Date.now()}`,
          type: 'web_hook',
          address: this.webhookUrl,
          token: this.generateWebhookToken(connectionId, spreadsheetId),
        },
      });

      if (!watchResponse.data.id || !watchResponse.data.resourceId) {
        throw new InternalServerErrorException('Failed to create webhook subscription');
      }

      // Calculate expiration date (Google Drive webhooks expire after 24 hours by default)
      const expiration = watchResponse.data.expiration 
        ? new Date(parseInt(watchResponse.data.expiration))
        : new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours from now

      // Store subscription in database
      const subscription = await this.prismaService.webhookSubscription.create({
        data: {
          connectionId,
          spreadsheetId,
          subscriptionId: watchResponse.data.id,
          resourceId: watchResponse.data.resourceId,
          expiration,
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      });

      // Update the spreadsheet connection with webhook subscription ID
      await this.prismaService.spreadsheetConnection.update({
        where: { id: connectionId },
        data: { webhookSubscriptionId: subscription.id },
      });

      this.logger.log('Webhook subscription created successfully', {
        subscriptionId: subscription.id,
        googleSubscriptionId: watchResponse.data.id,
        expiration,
      });

      return subscription;

    } catch (error) {
      this.logger.error('Failed to setup webhook subscription', {
        connectionId,
        spreadsheetId,
        error: error.message,
        stack: error.stack,
      });

      if (error instanceof BadRequestException) {
        throw error;
      }

      throw new InternalServerErrorException(
        `Failed to setup webhook subscription: ${error.message}`
      );
    }
  }

  /**
   * Handle incoming webhook notification from Google
   */
  async handleWebhookNotification(
    notification: GoogleSheetsWebhookNotification,
    signature?: string
  ): Promise<void> {
    this.logger.log('Received webhook notification', {
      resourceId: notification.resourceId,
      resourceState: notification.resourceState,
      eventType: notification.eventType,
    });

    try {
      // Validate webhook signature if provided
      if (signature && !this.validateWebhookSignature(JSON.stringify(notification), signature)) {
        this.logger.warn('Invalid webhook signature', { resourceId: notification.resourceId });
        throw new BadRequestException('Invalid webhook signature');
      }

      // Find the webhook subscription
      const subscription = await this.prismaService.webhookSubscription.findFirst({
        where: {
          resourceId: notification.resourceId,
          isActive: true,
        },
        include: {
          connection: {
            include: { user: true },
          },
        },
      });

      if (!subscription) {
        this.logger.warn('Webhook subscription not found', {
          resourceId: notification.resourceId,
        });
        return;
      }

      // Only process 'update' events (when sheet content changes)
      if (notification.resourceState !== 'update') {
        this.logger.debug('Ignoring non-update webhook event', {
          resourceState: notification.resourceState,
          subscriptionId: subscription.id,
        });
        return;
      }

      // Check if the subscription is still valid
      if (subscription.expiration && subscription.expiration < new Date()) {
        this.logger.warn('Webhook subscription expired', {
          subscriptionId: subscription.id,
          expiration: subscription.expiration,
        });
        
        // Mark subscription as inactive
        await this.prismaService.webhookSubscription.update({
          where: { id: subscription.id },
          data: { isActive: false },
        });
        
        return;
      }

      // Trigger order sync
      await this.triggerOrderSync(subscription);

    } catch (error) {
      this.logger.error('Failed to handle webhook notification', {
        resourceId: notification.resourceId,
        error: error.message,
        stack: error.stack,
      });

      // Don't throw error to avoid webhook retry loops
      // Google will retry failed webhooks automatically
    }
  }

  /**
   * Renew webhook subscription before it expires
   */
  async renewWebhookSubscription(subscriptionId: string): Promise<void> {
    this.logger.log('Renewing webhook subscription', { subscriptionId });

    try {
      const subscription = await this.prismaService.webhookSubscription.findUnique({
        where: { id: subscriptionId },
        include: {
          connection: {
            include: { user: true },
          },
        },
      });

      if (!subscription) {
        throw new BadRequestException('Webhook subscription not found');
      }

      if (!subscription.isActive) {
        this.logger.warn('Attempting to renew inactive subscription', { subscriptionId });
        return;
      }

      // Stop the old subscription
      await this.removeWebhookSubscription(subscriptionId);

      // Create a new subscription
      const newSubscription = await this.setupWebhookForSheet(
        subscription.connectionId,
        subscription.spreadsheetId
      );

      this.logger.log('Webhook subscription renewed successfully', {
        oldSubscriptionId: subscriptionId,
        newSubscriptionId: newSubscription.id,
      });

    } catch (error) {
      this.logger.error('Failed to renew webhook subscription', {
        subscriptionId,
        error: error.message,
        stack: error.stack,
      });

      throw new InternalServerErrorException(
        `Failed to renew webhook subscription: ${error.message}`
      );
    }
  }

  /**
   * Remove webhook subscription
   */
  async removeWebhookSubscription(subscriptionId: string): Promise<void> {
    this.logger.log('Removing webhook subscription', { subscriptionId });

    try {
      const subscription = await this.prismaService.webhookSubscription.findUnique({
        where: { id: subscriptionId },
        include: {
          connection: {
            include: { user: true },
          },
        },
      });

      if (!subscription) {
        this.logger.warn('Webhook subscription not found for removal', { subscriptionId });
        return;
      }

      // Get OAuth2 client
      const oauth2Client = await this.googleSheetsOAuth2Service.getOAuth2Client(
        subscription.connection.userId
      );

      // Set up Google Drive API client
      const drive = google.drive({ version: 'v3', auth: oauth2Client });

      try {
        // Stop the webhook subscription in Google Drive
        await drive.channels.stop({
          requestBody: {
            id: subscription.subscriptionId,
            resourceId: subscription.resourceId,
          },
        });
      } catch (googleError) {
        // Log but don't fail if Google API call fails (subscription might already be expired)
        this.logger.warn('Failed to stop webhook in Google Drive', {
          subscriptionId,
          googleError: googleError.message,
        });
      }

      // Mark subscription as inactive in database
      await this.prismaService.webhookSubscription.update({
        where: { id: subscriptionId },
        data: { 
          isActive: false,
          updatedAt: new Date(),
        },
      });

      // Clear webhook subscription ID from connection
      await this.prismaService.spreadsheetConnection.updateMany({
        where: { webhookSubscriptionId: subscriptionId },
        data: { webhookSubscriptionId: null },
      });

      this.logger.log('Webhook subscription removed successfully', { subscriptionId });

    } catch (error) {
      this.logger.error('Failed to remove webhook subscription', {
        subscriptionId,
        error: error.message,
        stack: error.stack,
      });

      throw new InternalServerErrorException(
        `Failed to remove webhook subscription: ${error.message}`
      );
    }
  }

  /**
   * Validate webhook signature
   */
  validateWebhookSignature(payload: string, signature: string): boolean {
    try {
      const expectedSignature = crypto
        .createHmac('sha256', this.webhookSecret)
        .update(payload)
        .digest('hex');

      return crypto.timingSafeEqual(
        Buffer.from(signature, 'hex'),
        Buffer.from(expectedSignature, 'hex')
      );
    } catch (error) {
      this.logger.error('Error validating webhook signature', {
        error: error.message,
      });
      return false;
    }
  }

  /**
   * Get active webhook subscriptions for a connection
   */
  async getActiveWebhookSubscriptions(connectionId: string): Promise<WebhookSubscription[]> {
    return this.prismaService.webhookSubscription.findMany({
      where: {
        connectionId,
        isActive: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  /**
   * Clean up expired webhook subscriptions
   */
  async cleanupExpiredSubscriptions(): Promise<{ cleanedCount: number; errors: string[] }> {
    this.logger.log('Cleaning up expired webhook subscriptions');

    try {
      const expiredSubscriptions = await this.prismaService.webhookSubscription.findMany({
        where: {
          isActive: true,
          expiration: {
            lt: new Date(),
          },
        },
      });

      let cleanedCount = 0;
      const errors = [];

      for (const subscription of expiredSubscriptions) {
        try {
          await this.removeWebhookSubscription(subscription.id);
          cleanedCount++;
        } catch (error) {
          this.logger.error('Failed to cleanup expired subscription', {
            subscriptionId: subscription.id,
            error: error.message,
          });
          errors.push(`Subscription ${subscription.id}: ${error.message}`);
        }
      }

      this.logger.log('Expired webhook subscriptions cleanup completed', {
        total: expiredSubscriptions.length,
        cleanedCount,
        errors: errors.length,
      });

      return { cleanedCount, errors };
    } catch (error) {
      this.logger.error('Failed to cleanup expired subscriptions', {
        error: error.message,
        stack: error.stack,
      });
      throw error;
    }
  }

  /**
   * Renew subscriptions that are about to expire
   */
  async renewExpiringSubscriptions(
    connectionId?: string,
    userId?: string,
    organizationId?: string,
  ): Promise<Array<{ subscriptionId: string; success: boolean; error?: string }>> {
    this.logger.log('Renewing expiring webhook subscriptions', {
      connectionId,
      userId,
      organizationId,
    });

    try {
      const whereClause: any = {
        isActive: true,
        expiration: {
          gte: new Date(),
          lte: new Date(Date.now() + 2 * 60 * 60 * 1000), // 2 hours from now
        },
      };

      // If specific connection is provided, filter by it
      if (connectionId) {
        whereClause.connectionId = connectionId;
      }

      // If user/org filters are provided, add them
      if (userId || organizationId) {
        whereClause.connection = {
          ...(userId && { userId }),
          ...(organizationId && { user: { organizationId } }),
        };
      }

      // Find subscriptions expiring in the next 2 hours
      const expiringSubscriptions = await this.prismaService.webhookSubscription.findMany({
        where: whereClause,
        include: {
          connection: {
            include: { user: true },
          },
        },
      });

      const results = [];

      for (const subscription of expiringSubscriptions) {
        try {
          await this.renewWebhookSubscription(subscription.id);
          results.push({
            subscriptionId: subscription.id,
            success: true,
          });
        } catch (error) {
          this.logger.error('Failed to renew expiring subscription', {
            subscriptionId: subscription.id,
            error: error.message,
          });
          results.push({
            subscriptionId: subscription.id,
            success: false,
            error: error.message,
          });
        }
      }

      this.logger.log('Expiring webhook subscriptions renewal completed', {
        total: expiringSubscriptions.length,
        successful: results.filter(r => r.success).length,
        failed: results.filter(r => !r.success).length,
      });

      return results;
    } catch (error) {
      this.logger.error('Failed to renew expiring subscriptions', {
        error: error.message,
        stack: error.stack,
      });
      throw error;
    }
  }

  /**
   * Generate webhook token for authentication
   */
  private generateWebhookToken(connectionId: string, spreadsheetId: string): string {
    return crypto
      .createHmac('sha256', this.webhookSecret)
      .update(`${connectionId}:${spreadsheetId}`)
      .digest('hex');
  }

  /**
   * Trigger order sync for a webhook subscription
   */
  private async triggerOrderSync(subscription: WebhookSubscription & { connection: any }): Promise<void> {
    this.logger.log('Triggering order sync from webhook', {
      subscriptionId: subscription.id,
      connectionId: subscription.connectionId,
      spreadsheetId: subscription.spreadsheetId,
    });

    try {
      // Trigger sync job through queue system
      const jobId = await this.queueIntegrationService.triggerWebhookSync(
        subscription.connectionId,
        subscription.spreadsheetId,
        subscription.connection.userId,
        subscription.connection.user.organizationId,
        subscription.id
      );

      this.logger.log('Webhook sync job queued successfully', {
        subscriptionId: subscription.id,
        connectionId: subscription.connectionId,
        jobId,
      });

    } catch (error) {
      this.logger.error('Failed to trigger order sync from webhook', {
        subscriptionId: subscription.id,
        error: error.message,
        stack: error.stack,
      });

      // Don't throw error to avoid webhook retry loops
      // The queue system will handle retries if needed
    }
  }
}