import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../common/database/prisma.service';
import { 
  SyncOperation, 
  SyncError, 
  SyncResult 
} from '../../../common/interfaces/google-sheets-order-sync.interface';

export interface SyncStatusSummary {
  totalOperations: number;
  activeOperations: number;
  completedOperations: number;
  failedOperations: number;
  totalOrdersProcessed: number;
  totalOrdersCreated: number;
  totalErrors: number;
  averageDuration: number;
  lastSyncAt?: Date;
}

export interface SyncOperationHistory {
  operations: SyncOperation[];
  totalCount: number;
  hasMore: boolean;
}

export interface SyncRetryOptions {
  maxRetries?: number;
  retryDelay?: number;
  exponentialBackoff?: boolean;
}

@Injectable()
export class SyncStatusService {
  private readonly logger = new Logger(SyncStatusService.name);

  constructor(
    private readonly prismaService: PrismaService,
  ) {}

  /**
   * Record a new sync operation
   */
  async recordSyncOperation(
    connectionId: string,
    spreadsheetId: string,
    operationType: 'webhook' | 'manual' | 'polling',
    metadata?: Record<string, any>
  ): Promise<string> {
    this.logger.log('Recording new sync operation', {
      connectionId,
      spreadsheetId,
      operationType,
      metadata
    });

    const syncOperation = await this.prismaService.syncOperation.create({
      data: {
        connectionId,
        spreadsheetId,
        operationType,
        status: 'pending',
        ordersProcessed: 0,
        ordersCreated: 0,
        ordersSkipped: 0,
        errorCount: 0,
        startedAt: new Date(),
      },
    });

    return syncOperation.id;
  }

  /**
   * Update sync operation status and progress
   */
  async updateSyncOperation(
    syncOperationId: string,
    updates: {
      status?: 'pending' | 'processing' | 'completed' | 'failed';
      ordersProcessed?: number;
      ordersCreated?: number;
      ordersSkipped?: number;
      errorCount?: number;
      errorDetails?: SyncError[];
      completedAt?: Date;
    }
  ): Promise<void> {
    this.logger.log('Updating sync operation', {
      syncOperationId,
      updates
    });

    const updateData: any = { ...updates };
    
    if (updates.errorDetails) {
      updateData.errorDetails = updates.errorDetails;
    }

    await this.prismaService.syncOperation.update({
      where: { id: syncOperationId },
      data: updateData,
    });
  }

  /**
   * Mark sync operation as completed
   */
  async completeSyncOperation(
    syncOperationId: string,
    result: SyncResult
  ): Promise<void> {
    this.logger.log('Completing sync operation', {
      syncOperationId,
      result: {
        success: result.success,
        ordersProcessed: result.ordersProcessed,
        ordersCreated: result.ordersCreated,
        ordersSkipped: result.ordersSkipped,
        errorCount: result.errors.length
      }
    });

    await this.updateSyncOperation(syncOperationId, {
      status: result.success ? 'completed' : 'failed',
      ordersProcessed: result.ordersProcessed,
      ordersCreated: result.ordersCreated,
      ordersSkipped: result.ordersSkipped,
      errorCount: result.errors.length,
      errorDetails: result.errors,
      completedAt: new Date(),
    });
  }

  /**
   * Record sync operation error
   */
  async recordSyncError(
    syncOperationId: string,
    error: string | Error,
    errorDetails?: SyncError[]
  ): Promise<void> {
    const errorMessage = error instanceof Error ? error.message : error;
    
    this.logger.error('Recording sync operation error', {
      syncOperationId,
      errorMessage,
      errorDetails
    });

    await this.updateSyncOperation(syncOperationId, {
      status: 'failed',
      errorCount: errorDetails?.length || 1,
      errorDetails: errorDetails || [{
        rowNumber: 0,
        errorType: 'system',
        errorMessage,
        orderData: {},
        suggestedFix: 'Check system logs and retry the operation'
      }],
      completedAt: new Date(),
    });
  }

  /**
   * Get sync operation by ID
   */
  async getSyncOperation(syncOperationId: string): Promise<SyncOperation | null> {
    const operation = await this.prismaService.syncOperation.findUnique({
      where: { id: syncOperationId },
    });

    if (!operation) {
      return null;
    }

    return {
      id: operation.id,
      connectionId: operation.connectionId,
      spreadsheetId: operation.spreadsheetId,
      operationType: operation.operationType as 'webhook' | 'manual' | 'polling',
      status: operation.status as 'pending' | 'processing' | 'completed' | 'failed',
      ordersProcessed: operation.ordersProcessed,
      ordersCreated: operation.ordersCreated,
      ordersSkipped: operation.ordersSkipped,
      errorCount: operation.errorCount,
      errorDetails: (operation.errorDetails as unknown as SyncError[]) || [],
      startedAt: operation.startedAt,
      completedAt: operation.completedAt || undefined,
    };
  }

  /**
   * Get sync status for a specific connection
   */
  async getSyncStatus(connectionId: string): Promise<{
    currentSync?: SyncOperation;
    lastSync?: SyncOperation;
    summary: SyncStatusSummary;
  }> {
    this.logger.log('Getting sync status', { connectionId });

    // Get current active sync
    const currentSync = await this.prismaService.syncOperation.findFirst({
      where: {
        connectionId,
        status: { in: ['pending', 'processing'] }
      },
      orderBy: { startedAt: 'desc' }
    });

    // Get last completed sync
    const lastSync = await this.prismaService.syncOperation.findFirst({
      where: {
        connectionId,
        status: { in: ['completed', 'failed'] }
      },
      orderBy: { startedAt: 'desc' }
    });

    // Get summary statistics
    const summary = await this.getSyncSummary(connectionId);

    return {
      currentSync: currentSync ? this.mapToSyncOperation(currentSync) : undefined,
      lastSync: lastSync ? this.mapToSyncOperation(lastSync) : undefined,
      summary
    };
  }

  /**
   * Get sync history for a connection
   */
  async getSyncHistory(
    connectionId: string,
    options: {
      limit?: number;
      offset?: number;
      status?: 'pending' | 'processing' | 'completed' | 'failed';
      operationType?: 'webhook' | 'manual' | 'polling';
      spreadsheetId?: string;
    } = {}
  ): Promise<SyncOperationHistory> {
    const { limit = 50, offset = 0, status, operationType, spreadsheetId } = options;

    this.logger.log('Getting sync history', {
      connectionId,
      options
    });

    const where: any = { connectionId };
    if (status) where.status = status;
    if (operationType) where.operationType = operationType;
    if (spreadsheetId) where.spreadsheetId = spreadsheetId;

    const [operations, totalCount] = await Promise.all([
      this.prismaService.syncOperation.findMany({
        where,
        orderBy: { startedAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      this.prismaService.syncOperation.count({ where })
    ]);

    return {
      operations: operations.map(op => this.mapToSyncOperation(op)),
      totalCount,
      hasMore: offset + operations.length < totalCount
    };
  }

  /**
   * Get sync summary statistics
   */
  async getSyncSummary(connectionId: string): Promise<SyncStatusSummary> {
    const stats = await this.prismaService.syncOperation.aggregate({
      where: { connectionId },
      _count: { id: true },
      _sum: {
        ordersProcessed: true,
        ordersCreated: true,
        errorCount: true,
      },
    });

    const statusCounts = await this.prismaService.syncOperation.groupBy({
      by: ['status'],
      where: { connectionId },
      _count: { id: true },
    });

    const activeOperations = statusCounts.find(s => s.status === 'pending' || s.status === 'processing')?._count.id || 0;
    const completedOperations = statusCounts.find(s => s.status === 'completed')?._count.id || 0;
    const failedOperations = statusCounts.find(s => s.status === 'failed')?._count.id || 0;

    // Calculate average duration for completed operations
    const completedOps = await this.prismaService.syncOperation.findMany({
      where: {
        connectionId,
        status: 'completed',
        completedAt: { not: null }
      },
      select: {
        startedAt: true,
        completedAt: true,
      }
    });

    let averageDuration = 0;
    if (completedOps.length > 0) {
      const totalDuration = completedOps.reduce((sum, op) => {
        if (op.completedAt) {
          return sum + (op.completedAt.getTime() - op.startedAt.getTime());
        }
        return sum;
      }, 0);
      averageDuration = totalDuration / completedOps.length;
    }

    // Get last sync timestamp
    const lastSync = await this.prismaService.syncOperation.findFirst({
      where: { connectionId },
      orderBy: { startedAt: 'desc' },
      select: { startedAt: true }
    });

    return {
      totalOperations: stats._count.id || 0,
      activeOperations,
      completedOperations,
      failedOperations,
      totalOrdersProcessed: stats._sum.ordersProcessed || 0,
      totalOrdersCreated: stats._sum.ordersCreated || 0,
      totalErrors: stats._sum.errorCount || 0,
      averageDuration,
      lastSyncAt: lastSync?.startedAt
    };
  }

  /**
   * Retry a failed sync operation
   */
  async retrySyncOperation(
    syncOperationId: string,
    options: SyncRetryOptions = {}
  ): Promise<string> {
    const { maxRetries = 3, retryDelay = 1000, exponentialBackoff = true } = options;

    this.logger.log('Retrying sync operation', {
      syncOperationId,
      options
    });

    const originalOperation = await this.getSyncOperation(syncOperationId);
    if (!originalOperation) {
      throw new NotFoundException('Sync operation not found');
    }

    if (originalOperation.status !== 'failed') {
      throw new Error('Can only retry failed sync operations');
    }

    // Create new sync operation for retry
    const retryOperationId = await this.recordSyncOperation(
      originalOperation.connectionId,
      originalOperation.spreadsheetId,
      originalOperation.operationType,
      {
        retryOf: syncOperationId,
        retryAttempt: 1,
        maxRetries,
        retryDelay,
        exponentialBackoff
      }
    );

    return retryOperationId;
  }

  /**
   * Clean up old sync operations
   */
  async cleanupOldOperations(
    olderThanDays: number = 30,
    keepMinimum: number = 100
  ): Promise<number> {
    this.logger.log('Cleaning up old sync operations', {
      olderThanDays,
      keepMinimum
    });

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);

    // Count operations to delete
    const operationsToDelete = await this.prismaService.syncOperation.count({
      where: {
        startedAt: { lt: cutoffDate },
        status: { in: ['completed', 'failed'] }
      }
    });

    if (operationsToDelete <= keepMinimum) {
      this.logger.log('No operations to clean up', {
        operationsToDelete,
        keepMinimum
      });
      return 0;
    }

    // Delete old operations
    const result = await this.prismaService.syncOperation.deleteMany({
      where: {
        startedAt: { lt: cutoffDate },
        status: { in: ['completed', 'failed'] }
      }
    });

    this.logger.log('Cleaned up sync operations', {
      deletedCount: result.count
    });

    return result.count;
  }

  /**
   * Get sync performance metrics
   */
  async getSyncPerformanceMetrics(
    connectionId: string,
    timeRange: {
      startDate: Date;
      endDate: Date;
    }
  ): Promise<{
    totalOperations: number;
    successRate: number;
    averageOrdersPerSync: number;
    averageDuration: number;
    errorRate: number;
    operationsByType: Record<string, number>;
    operationsByHour: Array<{ hour: number; count: number }>;
  }> {
    const { startDate, endDate } = timeRange;

    this.logger.log('Getting sync performance metrics', {
      connectionId,
      timeRange
    });

    const operations = await this.prismaService.syncOperation.findMany({
      where: {
        connectionId,
        startedAt: {
          gte: startDate,
          lte: endDate
        }
      },
      select: {
        operationType: true,
        status: true,
        ordersProcessed: true,
        ordersCreated: true,
        errorCount: true,
        startedAt: true,
        completedAt: true,
      }
    });

    const totalOperations = operations.length;
    const successfulOperations = operations.filter(op => op.status === 'completed').length;
    const successRate = totalOperations > 0 ? (successfulOperations / totalOperations) * 100 : 0;

    const totalOrdersProcessed = operations.reduce((sum, op) => sum + op.ordersProcessed, 0);
    const averageOrdersPerSync = totalOperations > 0 ? totalOrdersProcessed / totalOperations : 0;

    const completedOperations = operations.filter(op => op.completedAt);
    const totalDuration = completedOperations.reduce((sum, op) => {
      if (op.completedAt) {
        return sum + (op.completedAt.getTime() - op.startedAt.getTime());
      }
      return sum;
    }, 0);
    const averageDuration = completedOperations.length > 0 ? totalDuration / completedOperations.length : 0;

    const totalErrors = operations.reduce((sum, op) => sum + op.errorCount, 0);
    const errorRate = totalOrdersProcessed > 0 ? (totalErrors / totalOrdersProcessed) * 100 : 0;

    const operationsByType = operations.reduce((acc, op) => {
      acc[op.operationType] = (acc[op.operationType] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const operationsByHour = Array.from({ length: 24 }, (_, hour) => ({
      hour,
      count: operations.filter(op => op.startedAt.getHours() === hour).length
    }));

    return {
      totalOperations,
      successRate,
      averageOrdersPerSync,
      averageDuration,
      errorRate,
      operationsByType,
      operationsByHour
    };
  }

  /**
   * Map database record to SyncOperation interface
   */
  private mapToSyncOperation(operation: any): SyncOperation {
    return {
      id: operation.id,
      connectionId: operation.connectionId,
      spreadsheetId: operation.spreadsheetId,
      operationType: operation.operationType as 'webhook' | 'manual' | 'polling',
      status: operation.status as 'pending' | 'processing' | 'completed' | 'failed',
      ordersProcessed: operation.ordersProcessed,
      ordersCreated: operation.ordersCreated,
      ordersSkipped: operation.ordersSkipped,
      errorCount: operation.errorCount,
      errorDetails: (operation.errorDetails as unknown as SyncError[]) || [],
      startedAt: operation.startedAt,
      completedAt: operation.completedAt || undefined,
    };
  }
}