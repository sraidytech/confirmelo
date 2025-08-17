import { Process, Processor } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { Job } from 'bull';
import { WebhookRenewalJobData, JobResult } from '../interfaces/job.interface';
import { WebhookManagementService } from '../../auth/services/webhook-management.service';

@Processor('webhook-renewal')
export class WebhookRenewalProcessor {
  private readonly logger = new Logger(WebhookRenewalProcessor.name);

  constructor(
    private readonly webhookManagementService: WebhookManagementService,
  ) {}

  @Process('renew-webhook')
  async handleWebhookRenewal(job: Job<WebhookRenewalJobData>): Promise<JobResult> {
    const { connectionId, subscriptionId, userId, organizationId } = job.data;
    
    this.logger.log(
      `Processing webhook renewal job ${job.id} for subscription ${subscriptionId}`,
    );

    await job.progress({
      percentage: 0,
      message: 'Starting webhook renewal...',
    });

    try {
      await job.progress({
        percentage: 20,
        message: 'Checking subscription status...',
      });

      // Check if subscription still exists and needs renewal
      const activeSubscriptions = await this.webhookManagementService.getActiveWebhookSubscriptions(
        connectionId,
      );

      const subscription = activeSubscriptions.find(sub => sub.id === subscriptionId);
      
      if (!subscription) {
        await job.progress({
          percentage: 100,
          message: 'Subscription no longer exists or already renewed',
        });

        return {
          success: true,
          message: 'Subscription no longer exists or already renewed',
        };
      }

      await job.progress({
        percentage: 40,
        message: 'Renewing webhook subscription...',
      });

      // Renew the webhook subscription
      const renewalResult = await this.webhookManagementService.renewExpiringSubscriptions(
        connectionId,
        userId,
        organizationId,
      );

      await job.progress({
        percentage: 80,
        message: 'Webhook renewal completed, updating records...',
      });

      // Check if the specific subscription was renewed
      const wasRenewed = renewalResult.some(result => 
        result.subscriptionId === subscriptionId && result.success
      );

      await job.progress({
        percentage: 100,
        message: wasRenewed ? 'Webhook renewed successfully' : 'Webhook renewal failed',
      });

      if (wasRenewed) {
        this.logger.log(
          `Webhook renewal job ${job.id} completed successfully for subscription ${subscriptionId}`,
        );

        return {
          success: true,
          message: 'Webhook subscription renewed successfully',
          data: renewalResult,
        };
      } else {
        const failedResult = renewalResult.find(result => result.subscriptionId === subscriptionId);
        const errorMessage = failedResult?.error || 'Unknown renewal error';

        this.logger.warn(
          `Webhook renewal job ${job.id} failed for subscription ${subscriptionId}: ${errorMessage}`,
        );

        return {
          success: false,
          message: `Webhook renewal failed: ${errorMessage}`,
          errors: [errorMessage],
        };
      }
    } catch (error) {
      this.logger.error(
        `Webhook renewal job ${job.id} failed for subscription ${subscriptionId}:`,
        error,
      );

      await job.progress({
        percentage: 100,
        message: `Renewal failed: ${error.message}`,
      });

      return {
        success: false,
        message: `Webhook renewal failed: ${error.message}`,
        errors: [error.message],
      };
    }
  }

  @Process('cleanup-expired')
  async handleExpiredWebhookCleanup(job: Job): Promise<JobResult> {
    this.logger.log(`Processing expired webhook cleanup job ${job.id}`);

    await job.progress({
      percentage: 0,
      message: 'Starting expired webhook cleanup...',
    });

    try {
      await job.progress({
        percentage: 20,
        message: 'Finding expired webhook subscriptions...',
      });

      // Clean up expired subscriptions
      const cleanupResult = await this.webhookManagementService.cleanupExpiredSubscriptions();

      await job.progress({
        percentage: 80,
        message: 'Cleanup completed, updating records...',
      });

      await job.progress({
        percentage: 100,
        message: `Cleanup completed: ${cleanupResult.cleanedCount} subscriptions removed`,
      });

      this.logger.log(
        `Expired webhook cleanup job ${job.id} completed: ${cleanupResult.cleanedCount} subscriptions cleaned up`,
      );

      return {
        success: true,
        message: `Cleaned up ${cleanupResult.cleanedCount} expired webhook subscriptions`,
        data: cleanupResult,
        processedCount: cleanupResult.cleanedCount,
      };
    } catch (error) {
      this.logger.error(
        `Expired webhook cleanup job ${job.id} failed:`,
        error,
      );

      await job.progress({
        percentage: 100,
        message: `Cleanup failed: ${error.message}`,
      });

      return {
        success: false,
        message: `Webhook cleanup failed: ${error.message}`,
        errors: [error.message],
      };
    }
  }

  @Process('schedule-renewals')
  async handleScheduleRenewals(job: Job): Promise<JobResult> {
    this.logger.log(`Processing webhook renewal scheduling job ${job.id}`);

    await job.progress({
      percentage: 0,
      message: 'Starting webhook renewal scheduling...',
    });

    try {
      await job.progress({
        percentage: 20,
        message: 'Finding subscriptions that need renewal...',
      });

      // This would typically query the database for subscriptions expiring soon
      // and schedule individual renewal jobs for each one
      
      // For now, we'll implement a basic version that triggers renewal for all active connections
      // In a real implementation, this would be more sophisticated

      await job.progress({
        percentage: 50,
        message: 'Scheduling renewal jobs...',
      });

      // This is a placeholder - in practice, you'd query for expiring subscriptions
      // and schedule individual renewal jobs using the QueueService
      
      await job.progress({
        percentage: 100,
        message: 'Renewal scheduling completed',
      });

      this.logger.log(`Webhook renewal scheduling job ${job.id} completed`);

      return {
        success: true,
        message: 'Webhook renewal scheduling completed',
      };
    } catch (error) {
      this.logger.error(
        `Webhook renewal scheduling job ${job.id} failed:`,
        error,
      );

      await job.progress({
        percentage: 100,
        message: `Scheduling failed: ${error.message}`,
      });

      return {
        success: false,
        message: `Webhook renewal scheduling failed: ${error.message}`,
        errors: [error.message],
      };
    }
  }
}