import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { Queue, JobOptions } from 'bull';
import {
  OrderSyncJobData,
  WebhookRenewalJobData,
  SyncRetryJobData,
  PollingJobData,
} from '../interfaces/job.interface';

@Injectable()
export class QueueService {
  private readonly logger = new Logger(QueueService.name);

  constructor(
    @InjectQueue('order-sync') private orderSyncQueue: Queue,
    @InjectQueue('webhook-renewal') private webhookRenewalQueue: Queue,
    @InjectQueue('sync-retry') private syncRetryQueue: Queue,
    @InjectQueue('polling') private pollingQueue: Queue,
  ) {}

  /**
   * Add order sync job to queue
   */
  async addOrderSyncJob(
    data: OrderSyncJobData,
    options?: JobOptions,
  ): Promise<string> {
    try {
      const job = await this.orderSyncQueue.add('sync-orders', data, {
        priority: data.triggeredBy === 'manual' ? 10 : 5,
        delay: data.triggeredBy === 'webhook' ? 1000 : 0, // Small delay for webhooks to avoid race conditions
        ...options,
      });

      this.logger.log(
        `Added order sync job ${job.id} for connection ${data.connectionId}`,
      );
      return job.id.toString();
    } catch (error) {
      this.logger.error(
        `Failed to add order sync job for connection ${data.connectionId}:`,
        error,
      );
      throw error;
    }
  }

  /**
   * Add webhook renewal job to queue
   */
  async addWebhookRenewalJob(
    data: WebhookRenewalJobData,
    options?: JobOptions,
  ): Promise<string> {
    try {
      const job = await this.webhookRenewalQueue.add('renew-webhook', data, {
        priority: 8,
        ...options,
      });

      this.logger.log(
        `Added webhook renewal job ${job.id} for subscription ${data.subscriptionId}`,
      );
      return job.id.toString();
    } catch (error) {
      this.logger.error(
        `Failed to add webhook renewal job for subscription ${data.subscriptionId}:`,
        error,
      );
      throw error;
    }
  }

  /**
   * Add sync retry job to queue
   */
  async addSyncRetryJob(
    data: SyncRetryJobData,
    options?: JobOptions,
  ): Promise<string> {
    try {
      const delay = Math.min(1000 * Math.pow(2, data.retryCount), 300000); // Max 5 minutes
      
      const job = await this.syncRetryQueue.add('retry-sync', data, {
        priority: 3,
        delay,
        ...options,
      });

      this.logger.log(
        `Added sync retry job ${job.id} for connection ${data.connectionId} (attempt ${data.retryCount + 1})`,
      );
      return job.id.toString();
    } catch (error) {
      this.logger.error(
        `Failed to add sync retry job for connection ${data.connectionId}:`,
        error,
      );
      throw error;
    }
  }

  /**
   * Add polling job to queue
   */
  async addPollingJob(
    data: PollingJobData,
    options?: JobOptions,
  ): Promise<string> {
    try {
      const job = await this.pollingQueue.add('poll-sync', data, {
        priority: 1,
        repeat: { cron: '*/15 * * * *' }, // Every 15 minutes
        ...options,
      });

      this.logger.log(
        `Added polling job ${job.id} for connection ${data.connectionId}`,
      );
      return job.id.toString();
    } catch (error) {
      this.logger.error(
        `Failed to add polling job for connection ${data.connectionId}:`,
        error,
      );
      throw error;
    }
  }

  /**
   * Schedule webhook renewal jobs for expiring subscriptions
   */
  async scheduleWebhookRenewals(): Promise<void> {
    try {
      // This will be called by a cron job to schedule renewals
      // Implementation will check for expiring webhooks and schedule renewal jobs
      this.logger.log('Scheduling webhook renewal jobs...');
      
      // Add logic to query expiring webhooks and schedule renewal jobs
      // This will be implemented when we integrate with the webhook management service
    } catch (error) {
      this.logger.error('Failed to schedule webhook renewals:', error);
      throw error;
    }
  }

  /**
   * Get job status and progress
   */
  async getJobStatus(queueName: string, jobId: string): Promise<any> {
    try {
      let queue: Queue;
      
      switch (queueName) {
        case 'order-sync':
          queue = this.orderSyncQueue;
          break;
        case 'webhook-renewal':
          queue = this.webhookRenewalQueue;
          break;
        case 'sync-retry':
          queue = this.syncRetryQueue;
          break;
        case 'polling':
          queue = this.pollingQueue;
          break;
        default:
          throw new Error(`Unknown queue: ${queueName}`);
      }

      const job = await queue.getJob(jobId);
      if (!job) {
        return null;
      }

      return {
        id: job.id,
        name: job.name,
        data: job.data,
        progress: job.progress(),
        processedOn: job.processedOn,
        finishedOn: job.finishedOn,
        failedReason: job.failedReason,
        returnvalue: job.returnvalue,
        opts: job.opts,
      };
    } catch (error) {
      this.logger.error(`Failed to get job status for ${queueName}:${jobId}:`, error);
      throw error;
    }
  }

  /**
   * Remove job from queue
   */
  async removeJob(queueName: string, jobId: string): Promise<void> {
    try {
      let queue: Queue;
      
      switch (queueName) {
        case 'order-sync':
          queue = this.orderSyncQueue;
          break;
        case 'webhook-renewal':
          queue = this.webhookRenewalQueue;
          break;
        case 'sync-retry':
          queue = this.syncRetryQueue;
          break;
        case 'polling':
          queue = this.pollingQueue;
          break;
        default:
          throw new Error(`Unknown queue: ${queueName}`);
      }

      const job = await queue.getJob(jobId);
      if (job) {
        await job.remove();
        this.logger.log(`Removed job ${jobId} from ${queueName} queue`);
      }
    } catch (error) {
      this.logger.error(`Failed to remove job ${jobId} from ${queueName}:`, error);
      throw error;
    }
  }

  /**
   * Get queue statistics
   */
  async getQueueStats(queueName: string): Promise<any> {
    try {
      let queue: Queue;
      
      switch (queueName) {
        case 'order-sync':
          queue = this.orderSyncQueue;
          break;
        case 'webhook-renewal':
          queue = this.webhookRenewalQueue;
          break;
        case 'sync-retry':
          queue = this.syncRetryQueue;
          break;
        case 'polling':
          queue = this.pollingQueue;
          break;
        default:
          throw new Error(`Unknown queue: ${queueName}`);
      }

      const [waiting, active, completed, failed, delayed] = await Promise.all([
        queue.getWaiting(),
        queue.getActive(),
        queue.getCompleted(),
        queue.getFailed(),
        queue.getDelayed(),
      ]);

      return {
        name: queueName,
        waiting: waiting.length,
        active: active.length,
        completed: completed.length,
        failed: failed.length,
        delayed: delayed.length,
      };
    } catch (error) {
      this.logger.error(`Failed to get queue stats for ${queueName}:`, error);
      throw error;
    }
  }
}