import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { WebhookManagementService } from './webhook-management.service';

/**
 * Service for scheduling webhook-related background tasks
 * Handles webhook subscription renewal and cleanup
 */
@Injectable()
export class WebhookSchedulerService {
  private readonly logger = new Logger(WebhookSchedulerService.name);

  constructor(
    private readonly webhookManagementService: WebhookManagementService,
  ) {}

  /**
   * Renew webhook subscriptions that are about to expire
   * Runs every hour
   */
  @Cron(CronExpression.EVERY_HOUR)
  async renewExpiringWebhooks(): Promise<void> {
    this.logger.log('Starting webhook subscription renewal task');

    try {
      await this.webhookManagementService.renewExpiringSubscriptions();
      this.logger.log('Webhook subscription renewal task completed successfully');
    } catch (error) {
      this.logger.error('Webhook subscription renewal task failed', {
        error: error.message,
        stack: error.stack,
      });
    }
  }

  /**
   * Clean up expired webhook subscriptions
   * Runs every 6 hours
   */
  @Cron('0 */6 * * *') // Every 6 hours
  async cleanupExpiredWebhooks(): Promise<void> {
    this.logger.log('Starting webhook subscription cleanup task');

    try {
      await this.webhookManagementService.cleanupExpiredSubscriptions();
      this.logger.log('Webhook subscription cleanup task completed successfully');
    } catch (error) {
      this.logger.error('Webhook subscription cleanup task failed', {
        error: error.message,
        stack: error.stack,
      });
    }
  }

  /**
   * Manual trigger for webhook renewal (for testing or emergency use)
   */
  async manualRenewalTrigger(): Promise<void> {
    this.logger.log('Manual webhook renewal triggered');
    await this.renewExpiringWebhooks();
  }

  /**
   * Manual trigger for webhook cleanup (for testing or emergency use)
   */
  async manualCleanupTrigger(): Promise<void> {
    this.logger.log('Manual webhook cleanup triggered');
    await this.cleanupExpiredWebhooks();
  }
}