import { Process, Processor } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { Job } from 'bull';
import { OrderSyncJobData, JobResult } from '../interfaces/job.interface';
import { OrderSyncService } from '../../auth/services/order-sync.service';
import { SyncStatusService } from '../../auth/services/sync-status.service';
import { SpreadsheetConnectionService } from '../../auth/services/spreadsheet-connection.service';

@Processor('order-sync')
export class OrderSyncProcessor {
  private readonly logger = new Logger(OrderSyncProcessor.name);

  constructor(
    private readonly orderSyncService: OrderSyncService,
    private readonly syncStatusService: SyncStatusService,
    private readonly spreadsheetConnectionService: SpreadsheetConnectionService,
  ) {}

  @Process('sync-orders')
  async handleOrderSync(job: Job<OrderSyncJobData>): Promise<JobResult> {
    const { connectionId, sheetId, triggeredBy, userId, organizationId } = job.data;
    
    this.logger.log(
      `Processing order sync job ${job.id} for connection ${connectionId}`,
    );

    // Update job progress
    await job.progress({
      percentage: 0,
      message: 'Starting order sync...',
    });

    try {
      // Record sync operation start
      const syncOperationId = await this.syncStatusService.recordSyncOperation(
        connectionId,
        sheetId || '',
        triggeredBy,
        { userId, organizationId }
      );

      await job.progress({
        percentage: 10,
        message: 'Sync operation recorded, fetching sheet data...',
      });

      let result: JobResult;
      let syncResult: any;

      if (sheetId) {
        // Sync specific sheet
        const specificResult = await this.syncSpecificSheet(job, connectionId, sheetId, userId, organizationId, triggeredBy);
        result = specificResult;
        syncResult = specificResult.data; // The actual SyncResult is in the data field
      } else {
        // Sync all sheets for the connection
        result = await this.syncAllSheets(job, connectionId, userId, organizationId, triggeredBy);
        // For multiple sheets, we need to create a combined SyncResult
        syncResult = {
          success: result.success,
          operationId: syncOperationId,
          ordersProcessed: result.processedCount || 0,
          ordersCreated: result.processedCount || 0,
          ordersSkipped: result.skippedCount || 0,
          errors: result.errors?.map(err => ({
            rowNumber: 0,
            errorType: 'system' as const,
            errorMessage: err,
            orderData: {}
          })) || [],
          duration: 0,
          startedAt: new Date(),
          completedAt: new Date(),
        };
      }

      // Update sync operation with results
      if (syncResult) {
        await this.syncStatusService.completeSyncOperation(syncOperationId, syncResult);
      }

      await job.progress({
        percentage: 100,
        message: result.success ? 'Sync completed successfully' : 'Sync completed with errors',
      });

      this.logger.log(
        `Order sync job ${job.id} completed for connection ${connectionId}: ${result.message}`,
      );

      return result;
    } catch (error) {
      this.logger.error(
        `Order sync job ${job.id} failed for connection ${connectionId}:`,
        error,
      );

      await job.progress({
        percentage: 100,
        message: `Sync failed: ${error.message}`,
      });

      // Record sync failure
      try {
        const syncOperationId = await this.syncStatusService.recordSyncOperation(
          connectionId,
          sheetId || '',
          triggeredBy,
          { userId, organizationId }
        );

        await this.syncStatusService.completeSyncOperation(syncOperationId, {
          success: false,
          operationId: syncOperationId,
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
        this.logger.error('Failed to record sync failure:', recordError);
      }

      return {
        success: false,
        message: `Sync failed: ${error.message}`,
        errors: [error.message],
      };
    }
  }

  private async syncSpecificSheet(
    job: Job<OrderSyncJobData>,
    connectionId: string,
    sheetId: string,
    userId: string,
    organizationId: string,
    triggeredBy: 'webhook' | 'manual' | 'polling',
  ): Promise<JobResult> {
    await job.progress({
      percentage: 20,
      message: `Syncing sheet ${sheetId}...`,
    });

    try {
      const syncOperationId = await this.syncStatusService.recordSyncOperation(
        connectionId,
        sheetId,
        triggeredBy,
        { userId, organizationId }
      );

      const result = await this.orderSyncService.syncOrdersFromSheet(
        connectionId,
        sheetId,
        syncOperationId,
      );

      await job.progress({
        percentage: 80,
        message: 'Processing sync results...',
      });

      return {
        success: true,
        message: `Successfully synced sheet ${sheetId}`,
        data: result,
        processedCount: result.ordersProcessed || 0,
        skippedCount: result.ordersSkipped || 0,
        errorCount: result.errors?.length || 0,
        errors: result.errors?.map(err => err.errorMessage) || [],
      };
    } catch (error) {
      this.logger.error(`Failed to sync sheet ${sheetId}:`, error);
      throw error;
    }
  }

  private async syncAllSheets(
    job: Job<OrderSyncJobData>,
    connectionId: string,
    userId: string,
    organizationId: string,
    triggeredBy: 'webhook' | 'manual' | 'polling',
  ): Promise<JobResult> {
    await job.progress({
      percentage: 20,
      message: 'Fetching all sheets for connection...',
    });

    try {
      // Get all order sheets for the connection
      const orderSheets = await this.spreadsheetConnectionService.getOrderSyncSpreadsheets(
        connectionId,
      );

      if (!orderSheets || orderSheets.length === 0) {
        return {
          success: true,
          message: 'No order sheets found for connection',
          processedCount: 0,
          skippedCount: 0,
          errorCount: 0,
        };
      }

      await job.progress({
        percentage: 30,
        message: `Found ${orderSheets.length} sheets to sync...`,
      });

      const results = [];
      const errors = [];
      let totalProcessed = 0;
      let totalSkipped = 0;

      for (let i = 0; i < orderSheets.length; i++) {
        const sheet = orderSheets[i];
        const progressPercentage = 30 + ((i + 1) / orderSheets.length) * 50;

        await job.progress({
          percentage: progressPercentage,
          message: `Syncing sheet ${sheet.spreadsheetId} (${i + 1}/${orderSheets.length})...`,
        });

        try {
          // Record sync operation for this sheet
          const sheetSyncOperationId = await this.syncStatusService.recordSyncOperation(
            connectionId,
            sheet.spreadsheetId,
            triggeredBy,
            { userId, organizationId }
          );

          const sheetResult = await this.orderSyncService.syncOrdersFromSheet(
            connectionId,
            sheet.spreadsheetId,
            sheetSyncOperationId,
          );

          results.push({
            sheetId: sheet.spreadsheetId,
            ...sheetResult,
          });

          totalProcessed += sheetResult.ordersProcessed || 0;
          totalSkipped += sheetResult.ordersSkipped || 0;

          if (sheetResult.errors && sheetResult.errors.length > 0) {
            errors.push(...sheetResult.errors.map(error => `Sheet ${sheet.spreadsheetId}: ${error.errorMessage}`));
          }
        } catch (sheetError) {
          this.logger.error(`Failed to sync sheet ${sheet.spreadsheetId}:`, sheetError);
          errors.push(`Sheet ${sheet.spreadsheetId}: ${sheetError.message}`);
        }
      }

      await job.progress({
        percentage: 90,
        message: 'Finalizing sync results...',
      });

      return {
        success: errors.length === 0,
        message: `Synced ${orderSheets.length} sheets with ${totalProcessed} orders processed`,
        data: results,
        processedCount: totalProcessed,
        skippedCount: totalSkipped,
        errorCount: errors.length,
        errors,
      };
    } catch (error) {
      this.logger.error('Failed to sync all sheets:', error);
      throw error;
    }
  }
}