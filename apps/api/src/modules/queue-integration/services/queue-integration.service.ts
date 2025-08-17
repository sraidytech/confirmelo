import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import { QueueService } from '../../queue/services/queue.service';
import { OrderSyncJobData, WebhookRenewalJobData } from '../../queue/interfaces/job.interface';

/**
 * Service to handle queue integration without circular dependencies
 * This service can be injected into other modules that need to trigger queue jobs
 */
@Injectable()
export class QueueIntegrationService {
  private readonly logger = new Logger(QueueIntegrationService.name);

  constructor(
    @Inject(forwardRef(() => QueueService))
    private readonly queueService: QueueService,
  ) {}

  /**
   * Trigger order sync job from webhook notification
   */
  async triggerWebhookSync(
    connectionId: string,
    sheetId: string,
    userId: string,
    organizationId: string,
    webhookNotificationId?: string,
  ): Promise<string> {
    try {
      const jobData: OrderSyncJobData = {
        connectionId,
        sheetId,
        triggeredBy: 'webhook',
        webhookNotificationId,
        userId,
        organizationId,
      };

      const jobId = await this.queueService.addOrderSyncJob(jobData);
      
      this.logger.log(
        `Triggered webhook sync job ${jobId} for connection ${connectionId}, sheet ${sheetId}`,
      );

      return jobId;
    } catch (error) {
      this.logger.error(
        `Failed to trigger webhook sync for connection ${connectionId}:`,
        error,
      );
      throw error;
    }
  }

  /**
   * Trigger manual sync job
   */
  async triggerManualSync(
    connectionId: string,
    userId: string,
    organizationId: string,
    sheetId?: string,
  ): Promise<string> {
    try {
      const jobData: OrderSyncJobData = {
        connectionId,
        sheetId,
        triggeredBy: 'manual',
        userId,
        organizationId,
      };

      const jobId = await this.queueService.addOrderSyncJob(jobData);
      
      this.logger.log(
        `Triggered manual sync job ${jobId} for connection ${connectionId}`,
      );

      return jobId;
    } catch (error) {
      this.logger.error(
        `Failed to trigger manual sync for connection ${connectionId}:`,
        error,
      );
      throw error;
    }
  }

  /**
   * Schedule webhook renewal job
   */
  async scheduleWebhookRenewal(
    connectionId: string,
    subscriptionId: string,
    userId: string,
    organizationId: string,
    delayMs?: number,
  ): Promise<string> {
    try {
      const jobData: WebhookRenewalJobData = {
        connectionId,
        subscriptionId,
        userId,
        organizationId,
      };

      const jobId = await this.queueService.addWebhookRenewalJob(
        jobData,
        delayMs ? { delay: delayMs } : undefined,
      );
      
      this.logger.log(
        `Scheduled webhook renewal job ${jobId} for subscription ${subscriptionId}`,
      );

      return jobId;
    } catch (error) {
      this.logger.error(
        `Failed to schedule webhook renewal for subscription ${subscriptionId}:`,
        error,
      );
      throw error;
    }
  }

  /**
   * Get job status
   */
  async getJobStatus(queueName: string, jobId: string): Promise<any> {
    try {
      return await this.queueService.getJobStatus(queueName, jobId);
    } catch (error) {
      this.logger.error(`Failed to get job status for ${queueName}:${jobId}:`, error);
      throw error;
    }
  }
}