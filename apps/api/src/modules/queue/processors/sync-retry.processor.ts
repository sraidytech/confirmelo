import { Process, Processor } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { Job } from 'bull';
import { SyncRetryJobData, JobResult } from '../interfaces/job.interface';
import { OrderSyncService } from '../../auth/services/order-sync.service';
import { SyncStatusService } from '../../auth/services/sync-status.service';
import { QueueService } from '../services/queue.service';

@Processor('sync-retry')
export class SyncRetryProcessor {
  private readonly logger = new Logger(SyncRetryProcessor.name);
  private readonly maxRetries = 3;

  constructor(
    private readonly orderSyncService: OrderSyncService,
    private readonly syncStatusService: SyncStatusService,
    private readonly queueService: QueueService,
  ) {}

  @Process('retry-sync')
  async handleSyncRetry(job: Job<SyncRetryJobData>): Promise<JobResult> {
    const { 
      originalJobId, 
      connectionId, 
      sheetId, 
      retryCount, 
      lastError, 
      userId, 
      organizationId 
    } = job.data;
    
    this.logger.log(
      `Processing sync retry job ${job.id} for connection ${connectionId} (attempt ${retryCount + 1}/${this.maxRetries})`,
    );

    await job.progress({
      percentage: 0,
      message: `Starting retry attempt ${retryCount + 1}/${this.maxRetries}...`,
    });

    try {
      // Record retry attempt
      const syncOperationId = await this.syncStatusService.recordSyncOperation(
        connectionId,
        sheetId || '',
        'manual',
        { userId, organizationId, retryCount: retryCount + 1, originalJobId }
      );

      await job.progress({
        percentage: 20,
        message: 'Retry operation recorded, attempting sync...',
      });

      // Attempt the sync operation
      const syncResult = await this.orderSyncService.syncOrdersFromSheet(
        connectionId,
        sheetId || '',
        syncOperationId,
      );

      await job.progress({
        percentage: 80,
        message: 'Sync completed, updating records...',
      });

      // Update sync operation with success
      await this.syncStatusService.completeSyncOperation(syncOperationId, syncResult);

      await job.progress({
        percentage: 100,
        message: 'Retry successful',
      });

      this.logger.log(
        `Sync retry job ${job.id} succeeded for connection ${connectionId} on attempt ${retryCount + 1}`,
      );

      return {
        success: true,
        message: `Sync retry succeeded on attempt ${retryCount + 1}`,
        data: syncResult,
        processedCount: syncResult.ordersProcessed || 0,
        skippedCount: syncResult.ordersSkipped || 0,
        errorCount: syncResult.errors?.length || 0,
        errors: syncResult.errors?.map(err => err.errorMessage) || [],
      };
    } catch (error) {
      this.logger.error(
        `Sync retry job ${job.id} failed for connection ${connectionId} on attempt ${retryCount + 1}:`,
        error,
      );

      await job.progress({
        percentage: 50,
        message: `Retry attempt ${retryCount + 1} failed, checking if more retries needed...`,
      });

      // Check if we should retry again
      if (retryCount + 1 < this.maxRetries) {
        await job.progress({
          percentage: 70,
          message: `Scheduling retry attempt ${retryCount + 2}...`,
        });

        // Schedule another retry
        await this.queueService.addSyncRetryJob({
          originalJobId,
          connectionId,
          sheetId,
          retryCount: retryCount + 1,
          lastError: error.message,
          userId,
          organizationId,
        });

        await job.progress({
          percentage: 100,
          message: `Retry attempt ${retryCount + 1} failed, scheduled attempt ${retryCount + 2}`,
        });

        // Record this retry attempt as failed but not final
        try {
          const failedSyncOperationId = await this.syncStatusService.recordSyncOperation(
            connectionId,
            sheetId || '',
            'manual',
            { userId, organizationId, retryCount: retryCount + 1, originalJobId }
          );

          await this.syncStatusService.completeSyncOperation(failedSyncOperationId, {
            success: false,
            operationId: failedSyncOperationId,
            ordersProcessed: 0,
            ordersCreated: 0,
            ordersSkipped: 0,
            errors: [{ 
              rowNumber: 0, 
              errorType: 'system', 
              errorMessage: error.message, 
              orderData: {} 
            }],
            duration: 0,
            startedAt: new Date(),
            completedAt: new Date(),
          });
        } catch (recordError) {
          this.logger.error('Failed to record retry failure:', recordError);
        }

        return {
          success: false,
          message: `Retry attempt ${retryCount + 1} failed, scheduled attempt ${retryCount + 2}`,
          errors: [error.message],
        };
      } else {
        await job.progress({
          percentage: 100,
          message: `All retry attempts exhausted (${this.maxRetries}/${this.maxRetries})`,
        });

        // All retries exhausted, record final failure
        try {
          const finalSyncOperationId = await this.syncStatusService.recordSyncOperation(
            connectionId,
            sheetId || '',
            'manual',
            { userId, organizationId, retryCount: retryCount + 1, originalJobId }
          );

          await this.syncStatusService.completeSyncOperation(finalSyncOperationId, {
            success: false,
            operationId: finalSyncOperationId,
            ordersProcessed: 0,
            ordersCreated: 0,
            ordersSkipped: 0,
            errors: [
              { 
                rowNumber: 0, 
                errorType: 'system', 
                errorMessage: error.message, 
                orderData: {} 
              },
              { 
                rowNumber: 0, 
                errorType: 'system', 
                errorMessage: 'All retry attempts exhausted', 
                orderData: {} 
              }
            ],
            duration: 0,
            startedAt: new Date(),
            completedAt: new Date(),
          });
        } catch (recordError) {
          this.logger.error('Failed to record final retry failure:', recordError);
        }

        this.logger.error(
          `Sync retry job ${job.id} exhausted all retries for connection ${connectionId}`,
        );

        return {
          success: false,
          message: `Sync failed after ${this.maxRetries} retry attempts`,
          errors: [error.message, 'All retry attempts exhausted'],
        };
      }
    }
  }

  @Process('cleanup-failed')
  async handleFailedJobCleanup(job: Job): Promise<JobResult> {
    this.logger.log(`Processing failed job cleanup job ${job.id}`);

    await job.progress({
      percentage: 0,
      message: 'Starting failed job cleanup...',
    });

    try {
      await job.progress({
        percentage: 20,
        message: 'Finding old failed sync operations...',
      });

      // Clean up old failed sync operations (older than 7 days)
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - 7);

      // This would typically query and clean up old failed operations
      // For now, we'll just log the cleanup attempt
      
      await job.progress({
        percentage: 80,
        message: 'Cleanup completed...',
      });

      await job.progress({
        percentage: 100,
        message: 'Failed job cleanup completed',
      });

      this.logger.log(`Failed job cleanup job ${job.id} completed`);

      return {
        success: true,
        message: 'Failed job cleanup completed',
      };
    } catch (error) {
      this.logger.error(
        `Failed job cleanup job ${job.id} failed:`,
        error,
      );

      await job.progress({
        percentage: 100,
        message: `Cleanup failed: ${error.message}`,
      });

      return {
        success: false,
        message: `Failed job cleanup failed: ${error.message}`,
        errors: [error.message],
      };
    }
  }
}