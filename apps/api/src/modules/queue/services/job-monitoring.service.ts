import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { Queue, Job } from 'bull';
import { Cron, CronExpression } from '@nestjs/schedule';

@Injectable()
export class JobMonitoringService {
  private readonly logger = new Logger(JobMonitoringService.name);

  constructor(
    @InjectQueue('order-sync') private orderSyncQueue: Queue,
    @InjectQueue('webhook-renewal') private webhookRenewalQueue: Queue,
    @InjectQueue('sync-retry') private syncRetryQueue: Queue,
    @InjectQueue('polling') private pollingQueue: Queue,
  ) {}

  /**
   * Get comprehensive queue statistics
   */
  async getQueueStatistics(): Promise<any> {
    try {
      const queues = [
        { name: 'order-sync', queue: this.orderSyncQueue },
        { name: 'webhook-renewal', queue: this.webhookRenewalQueue },
        { name: 'sync-retry', queue: this.syncRetryQueue },
        { name: 'polling', queue: this.pollingQueue },
      ];

      const statistics = await Promise.all(
        queues.map(async ({ name, queue }) => {
          const [waiting, active, completed, failed, delayed, paused] = await Promise.all([
            queue.getWaiting(),
            queue.getActive(),
            queue.getCompleted(),
            queue.getFailed(),
            queue.getDelayed(),
            queue.isPaused(),
          ]);

          return {
            name,
            counts: {
              waiting: waiting.length,
              active: active.length,
              completed: completed.length,
              failed: failed.length,
              delayed: delayed.length,
            },
            paused,
            health: this.calculateQueueHealth(waiting.length, active.length, failed.length),
          };
        }),
      );

      return {
        timestamp: new Date(),
        queues: statistics,
        overall: this.calculateOverallHealth(statistics),
      };
    } catch (error) {
      this.logger.error('Failed to get queue statistics:', error);
      throw error;
    }
  }

  /**
   * Get detailed job information
   */
  async getJobDetails(queueName: string, jobId: string): Promise<any> {
    try {
      const queue = this.getQueueByName(queueName);
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
        delay: job.opts.delay,
        timestamp: job.timestamp,
        attemptsMade: job.attemptsMade,
        stacktrace: job.stacktrace,
      };
    } catch (error) {
      this.logger.error(`Failed to get job details for ${queueName}:${jobId}:`, error);
      throw error;
    }
  }

  /**
   * Get failed jobs with details
   */
  async getFailedJobs(queueName: string, limit: number = 50): Promise<any[]> {
    try {
      const queue = this.getQueueByName(queueName);
      const failedJobs = await queue.getFailed(0, limit - 1);

      return failedJobs.map(job => ({
        id: job.id,
        name: job.name,
        data: job.data,
        failedReason: job.failedReason,
        finishedOn: job.finishedOn,
        attemptsMade: job.attemptsMade,
        stacktrace: job.stacktrace,
      }));
    } catch (error) {
      this.logger.error(`Failed to get failed jobs for ${queueName}:`, error);
      throw error;
    }
  }

  /**
   * Retry failed job
   */
  async retryFailedJob(queueName: string, jobId: string): Promise<void> {
    try {
      const queue = this.getQueueByName(queueName);
      const job = await queue.getJob(jobId);

      if (!job) {
        throw new Error(`Job ${jobId} not found in queue ${queueName}`);
      }

      await job.retry();
      this.logger.log(`Retried job ${jobId} in queue ${queueName}`);
    } catch (error) {
      this.logger.error(`Failed to retry job ${jobId} in queue ${queueName}:`, error);
      throw error;
    }
  }

  /**
   * Remove job from queue
   */
  async removeJob(queueName: string, jobId: string): Promise<void> {
    try {
      const queue = this.getQueueByName(queueName);
      const job = await queue.getJob(jobId);

      if (!job) {
        throw new Error(`Job ${jobId} not found in queue ${queueName}`);
      }

      await job.remove();
      this.logger.log(`Removed job ${jobId} from queue ${queueName}`);
    } catch (error) {
      this.logger.error(`Failed to remove job ${jobId} from queue ${queueName}:`, error);
      throw error;
    }
  }

  /**
   * Pause queue
   */
  async pauseQueue(queueName: string): Promise<void> {
    try {
      const queue = this.getQueueByName(queueName);
      await queue.pause();
      this.logger.log(`Paused queue ${queueName}`);
    } catch (error) {
      this.logger.error(`Failed to pause queue ${queueName}:`, error);
      throw error;
    }
  }

  /**
   * Resume queue
   */
  async resumeQueue(queueName: string): Promise<void> {
    try {
      const queue = this.getQueueByName(queueName);
      await queue.resume();
      this.logger.log(`Resumed queue ${queueName}`);
    } catch (error) {
      this.logger.error(`Failed to resume queue ${queueName}:`, error);
      throw error;
    }
  }

  /**
   * Clean old jobs from queue
   */
  async cleanQueue(queueName: string, grace: number = 24 * 60 * 60 * 1000): Promise<void> {
    try {
      const queue = this.getQueueByName(queueName);
      
      // Clean completed jobs older than grace period
      await queue.clean(grace, 'completed');
      
      // Clean failed jobs older than grace period
      await queue.clean(grace, 'failed');
      
      this.logger.log(`Cleaned old jobs from queue ${queueName}`);
    } catch (error) {
      this.logger.error(`Failed to clean queue ${queueName}:`, error);
      throw error;
    }
  }

  /**
   * Monitor stuck jobs and alert
   */
  @Cron(CronExpression.EVERY_5_MINUTES)
  async monitorStuckJobs(): Promise<void> {
    try {
      const queues = [
        { name: 'order-sync', queue: this.orderSyncQueue },
        { name: 'webhook-renewal', queue: this.webhookRenewalQueue },
        { name: 'sync-retry', queue: this.syncRetryQueue },
        { name: 'polling', queue: this.pollingQueue },
      ];

      for (const { name, queue } of queues) {
        const activeJobs = await queue.getActive();
        const stuckJobs = activeJobs.filter(job => this.isJobStuck(job));

        if (stuckJobs.length > 0) {
          this.logger.warn(
            `Found ${stuckJobs.length} stuck jobs in queue ${name}:`,
            stuckJobs.map(job => ({ id: job.id, processedOn: job.processedOn })),
          );

          // Optionally, you could implement automatic recovery here
          // For now, we just log the issue
        }
      }
    } catch (error) {
      this.logger.error('Failed to monitor stuck jobs:', error);
    }
  }

  /**
   * Clean old jobs automatically
   */
  @Cron(CronExpression.EVERY_DAY_AT_2AM)
  async cleanOldJobs(): Promise<void> {
    try {
      const queues = ['order-sync', 'webhook-renewal', 'sync-retry', 'polling'];
      
      for (const queueName of queues) {
        await this.cleanQueue(queueName);
      }

      this.logger.log('Completed automatic cleanup of old jobs');
    } catch (error) {
      this.logger.error('Failed to clean old jobs:', error);
    }
  }

  /**
   * Generate daily queue report
   */
  @Cron(CronExpression.EVERY_DAY_AT_9AM)
  async generateDailyReport(): Promise<void> {
    try {
      const statistics = await this.getQueueStatistics();
      
      this.logger.log('Daily Queue Report:', {
        timestamp: statistics.timestamp,
        overall_health: statistics.overall.health,
        total_jobs: statistics.overall.totalJobs,
        queues: statistics.queues.map(q => ({
          name: q.name,
          health: q.health,
          active: q.counts.active,
          waiting: q.counts.waiting,
          failed: q.counts.failed,
        })),
      });

      // Here you could send this report to monitoring systems, email, etc.
    } catch (error) {
      this.logger.error('Failed to generate daily report:', error);
    }
  }

  private getQueueByName(queueName: string): Queue {
    switch (queueName) {
      case 'order-sync':
        return this.orderSyncQueue;
      case 'webhook-renewal':
        return this.webhookRenewalQueue;
      case 'sync-retry':
        return this.syncRetryQueue;
      case 'polling':
        return this.pollingQueue;
      default:
        throw new Error(`Unknown queue: ${queueName}`);
    }
  }

  private calculateQueueHealth(waiting: number, active: number, failed: number): string {
    const total = waiting + active + failed;
    
    if (total === 0) return 'idle';
    if (failed / total > 0.5) return 'critical';
    if (failed / total > 0.2) return 'warning';
    if (active > 10) return 'busy';
    
    return 'healthy';
  }

  private calculateOverallHealth(queueStats: any[]): any {
    const totalJobs = queueStats.reduce((sum, q) => 
      sum + q.counts.waiting + q.counts.active + q.counts.completed + q.counts.failed, 0
    );
    
    const totalFailed = queueStats.reduce((sum, q) => sum + q.counts.failed, 0);
    const criticalQueues = queueStats.filter(q => q.health === 'critical').length;
    
    let overallHealth = 'healthy';
    if (criticalQueues > 0) overallHealth = 'critical';
    else if (totalJobs > 0 && totalFailed / totalJobs > 0.1) overallHealth = 'warning';
    
    return {
      health: overallHealth,
      totalJobs,
      totalFailed,
      criticalQueues,
    };
  }

  private isJobStuck(job: Job): boolean {
    if (!job.processedOn) return false;
    
    const now = Date.now();
    const processedTime = job.processedOn;
    const maxProcessingTime = 30 * 60 * 1000; // 30 minutes
    
    return (now - processedTime) > maxProcessingTime;
  }
}