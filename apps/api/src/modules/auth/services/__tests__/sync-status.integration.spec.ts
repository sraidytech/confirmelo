import { Test, TestingModule } from '@nestjs/testing';
import { SyncStatusService } from '../sync-status.service';
import { PrismaService } from '../../../../common/database/prisma.service';
import { SyncError } from '../../../../common/interfaces/google-sheets-order-sync.interface';

describe('SyncStatusService Integration', () => {
  let service: SyncStatusService;
  let prismaService: any;

  const mockConnectionId = 'conn-integration-123';
  const mockSpreadsheetId = 'sheet-integration-123';

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SyncStatusService,
        {
          provide: PrismaService,
          useValue: {
            syncOperation: {
              create: jest.fn(),
              update: jest.fn(),
              findUnique: jest.fn(),
              findFirst: jest.fn(),
              findMany: jest.fn(),
              count: jest.fn(),
              aggregate: jest.fn(),
              groupBy: jest.fn(),
              deleteMany: jest.fn(),
            },
          } as any,
        },
      ],
    }).compile();

    service = module.get<SyncStatusService>(SyncStatusService);
    prismaService = module.get<PrismaService>(PrismaService);
  });

  describe('Complete Sync Operation Lifecycle', () => {
    it('should handle complete sync operation lifecycle', async () => {
      // Mock database responses for the lifecycle
      const mockSyncOperation = {
        id: 'sync-lifecycle-123',
        connectionId: mockConnectionId,
        spreadsheetId: mockSpreadsheetId,
        operationType: 'manual',
        status: 'pending',
        ordersProcessed: 0,
        ordersCreated: 0,
        ordersSkipped: 0,
        errorCount: 0,
        errorDetails: null,
        startedAt: new Date(),
        completedAt: null,
        createdAt: new Date(),
      };

      // Step 1: Record sync operation
      (prismaService.syncOperation.create as jest.Mock).mockResolvedValue(mockSyncOperation);
      
      const syncOperationId = await service.recordSyncOperation(
        mockConnectionId,
        mockSpreadsheetId,
        'manual'
      );

      expect(syncOperationId).toBe('sync-lifecycle-123');

      // Step 2: Update progress
      const updatedOperation = {
        ...mockSyncOperation,
        status: 'processing',
        ordersProcessed: 5,
        ordersCreated: 3,
      };
      (prismaService.syncOperation.update as jest.Mock).mockResolvedValue(updatedOperation);

      await service.updateSyncOperation(syncOperationId, {
        status: 'processing',
        ordersProcessed: 5,
        ordersCreated: 3,
      });

      // Step 3: Complete sync operation
      const completedOperation = {
        ...updatedOperation,
        status: 'completed',
        ordersProcessed: 10,
        ordersCreated: 8,
        ordersSkipped: 2,
        completedAt: new Date(),
      };
      (prismaService.syncOperation.update as jest.Mock).mockResolvedValue(completedOperation);

      const syncResult = {
        success: true,
        operationId: syncOperationId,
        ordersProcessed: 10,
        ordersCreated: 8,
        ordersSkipped: 2,
        errors: [],
        duration: 300000,
        startedAt: new Date(),
      };

      await service.completeSyncOperation(syncOperationId, syncResult);

      // Verify all database calls were made correctly
      expect(prismaService.syncOperation.create).toHaveBeenCalledWith({
        data: {
          connectionId: mockConnectionId,
          spreadsheetId: mockSpreadsheetId,
          operationType: 'manual',
          status: 'pending',
          ordersProcessed: 0,
          ordersCreated: 0,
          ordersSkipped: 0,
          errorCount: 0,
          startedAt: expect.any(Date),
        },
      });

      expect(prismaService.syncOperation.update).toHaveBeenCalledWith({
        where: { id: syncOperationId },
        data: {
          status: 'processing',
          ordersProcessed: 5,
          ordersCreated: 3,
        },
      });

      expect(prismaService.syncOperation.update).toHaveBeenCalledWith({
        where: { id: syncOperationId },
        data: {
          status: 'completed',
          ordersProcessed: 10,
          ordersCreated: 8,
          ordersSkipped: 2,
          errorCount: 0,
          errorDetails: [],
          completedAt: expect.any(Date),
        },
      });
    });

    it('should handle sync operation with errors', async () => {
      const mockSyncOperation = {
        id: 'sync-error-123',
        connectionId: mockConnectionId,
        spreadsheetId: mockSpreadsheetId,
        operationType: 'webhook',
        status: 'pending',
        ordersProcessed: 0,
        ordersCreated: 0,
        ordersSkipped: 0,
        errorCount: 0,
        errorDetails: null,
        startedAt: new Date(),
        completedAt: null,
        createdAt: new Date(),
      };

      // Record sync operation
      (prismaService.syncOperation.create as jest.Mock).mockResolvedValue(mockSyncOperation);
      
      const syncOperationId = await service.recordSyncOperation(
        mockConnectionId,
        mockSpreadsheetId,
        'webhook'
      );

      // Simulate error during processing
      const syncErrors: SyncError[] = [
        {
          rowNumber: 3,
          errorType: 'validation',
          errorMessage: 'Invalid phone number format',
          orderData: { phone: '123' },
          field: 'phone',
          suggestedFix: 'Use format: +212XXXXXXXXX'
        },
        {
          rowNumber: 7,
          errorType: 'product_not_found',
          errorMessage: 'Product not found in catalog',
          orderData: { productName: 'Unknown Product' },
          field: 'productName',
          suggestedFix: 'Check product name spelling or add to catalog'
        }
      ];

      const failedOperation = {
        ...mockSyncOperation,
        status: 'failed',
        ordersProcessed: 10,
        ordersCreated: 3,
        ordersSkipped: 5,
        errorCount: 2,
        errorDetails: syncErrors,
        completedAt: new Date(),
      };
      (prismaService.syncOperation.update as jest.Mock).mockResolvedValue(failedOperation);

      const syncResult = {
        success: false,
        operationId: syncOperationId,
        ordersProcessed: 10,
        ordersCreated: 3,
        ordersSkipped: 5,
        errors: syncErrors,
        duration: 180000,
        startedAt: new Date(),
      };

      await service.completeSyncOperation(syncOperationId, syncResult);

      expect(prismaService.syncOperation.update).toHaveBeenCalledWith({
        where: { id: syncOperationId },
        data: {
          status: 'failed',
          ordersProcessed: 10,
          ordersCreated: 3,
          ordersSkipped: 5,
          errorCount: 2,
          errorDetails: syncErrors,
          completedAt: expect.any(Date),
        },
      });
    });
  });

  describe('Sync Status Monitoring', () => {
    it('should provide comprehensive sync status', async () => {
      const currentSync = {
        id: 'current-sync-123',
        connectionId: mockConnectionId,
        spreadsheetId: mockSpreadsheetId,
        operationType: 'webhook',
        status: 'processing',
        ordersProcessed: 5,
        ordersCreated: 3,
        ordersSkipped: 0,
        errorCount: 0,
        errorDetails: null,
        startedAt: new Date(),
        completedAt: null,
      };

      const lastSync = {
        id: 'last-sync-123',
        connectionId: mockConnectionId,
        spreadsheetId: mockSpreadsheetId,
        operationType: 'manual',
        status: 'completed',
        ordersProcessed: 15,
        ordersCreated: 12,
        ordersSkipped: 3,
        errorCount: 0,
        errorDetails: null,
        startedAt: new Date(Date.now() - 3600000), // 1 hour ago
        completedAt: new Date(Date.now() - 3300000), // 55 minutes ago
      };

      // Mock database calls for getSyncStatus
      (prismaService.syncOperation.findFirst as jest.Mock)
        .mockResolvedValueOnce(currentSync) // Current active sync
        .mockResolvedValueOnce(lastSync); // Last completed sync

      // Mock aggregate for summary statistics
      (prismaService.syncOperation.aggregate as jest.Mock).mockResolvedValue({
        _count: { id: 10 },
        _sum: {
          ordersProcessed: 100,
          ordersCreated: 85,
          errorCount: 3,
        },
      });

      // Mock groupBy for status counts
      (prismaService.syncOperation.groupBy as jest.Mock).mockResolvedValue([
        { status: 'completed', _count: { id: 8 } },
        { status: 'failed', _count: { id: 1 } },
        { status: 'processing', _count: { id: 1 } },
      ]);

      // Mock completed operations for duration calculation
      (prismaService.syncOperation.findMany as jest.Mock).mockResolvedValue([
        {
          startedAt: new Date('2024-01-01T10:00:00Z'),
          completedAt: new Date('2024-01-01T10:05:00Z'),
        },
        {
          startedAt: new Date('2024-01-01T11:00:00Z'),
          completedAt: new Date('2024-01-01T11:03:00Z'),
        },
      ]);

      // Mock last sync timestamp
      (prismaService.syncOperation.findFirst as jest.Mock).mockResolvedValueOnce({
        startedAt: new Date('2024-01-01T12:00:00Z'),
      });

      const status = await service.getSyncStatus(mockConnectionId);

      expect(status.currentSync).toBeDefined();
      expect(status.currentSync?.status).toBe('processing');
      expect(status.currentSync?.ordersProcessed).toBe(5);

      expect(status.lastSync).toBeDefined();
      expect(status.lastSync?.status).toBe('completed');
      expect(status.lastSync?.ordersCreated).toBe(12);

      expect(status.summary).toEqual({
        totalOperations: 10,
        activeOperations: 1,
        completedOperations: 8,
        failedOperations: 1,
        totalOrdersProcessed: 100,
        totalOrdersCreated: 85,
        totalErrors: 3,
        averageDuration: 240000, // Average of 5min and 3min
        lastSyncAt: new Date('2024-01-01T12:00:00Z'),
      });
    });
  });

  describe('Sync History and Analytics', () => {
    it('should provide paginated sync history with filtering', async () => {
      const mockOperations = [
        {
          id: 'sync-1',
          connectionId: mockConnectionId,
          spreadsheetId: mockSpreadsheetId,
          operationType: 'webhook',
          status: 'completed',
          ordersProcessed: 10,
          ordersCreated: 8,
          ordersSkipped: 2,
          errorCount: 0,
          errorDetails: null,
          startedAt: new Date('2024-01-01T10:00:00Z'),
          completedAt: new Date('2024-01-01T10:05:00Z'),
        },
        {
          id: 'sync-2',
          connectionId: mockConnectionId,
          spreadsheetId: mockSpreadsheetId,
          operationType: 'manual',
          status: 'failed',
          ordersProcessed: 5,
          ordersCreated: 2,
          ordersSkipped: 0,
          errorCount: 3,
          errorDetails: [
            {
              rowNumber: 3,
              errorType: 'validation',
              errorMessage: 'Invalid data',
              orderData: {},
            }
          ],
          startedAt: new Date('2024-01-01T11:00:00Z'),
          completedAt: new Date('2024-01-01T11:02:00Z'),
        },
      ];

      (prismaService.syncOperation.findMany as jest.Mock).mockResolvedValue(mockOperations);
      (prismaService.syncOperation.count as jest.Mock).mockResolvedValue(2);

      const history = await service.getSyncHistory(mockConnectionId, {
        limit: 10,
        offset: 0,
        status: 'completed',
      });

      expect(history.operations).toHaveLength(2);
      expect(history.totalCount).toBe(2);
      expect(history.hasMore).toBe(false);

      expect(prismaService.syncOperation.findMany).toHaveBeenCalledWith({
        where: {
          connectionId: mockConnectionId,
          status: 'completed',
        },
        orderBy: { startedAt: 'desc' },
        take: 10,
        skip: 0,
      });
    });

    it('should provide performance metrics', async () => {
      const mockOperations = [
        {
          operationType: 'webhook',
          status: 'completed',
          ordersProcessed: 20,
          ordersCreated: 18,
          errorCount: 1,
          startedAt: new Date('2024-01-01T10:00:00Z'),
          completedAt: new Date('2024-01-01T10:05:00Z'),
        },
        {
          operationType: 'manual',
          status: 'completed',
          ordersProcessed: 10,
          ordersCreated: 10,
          errorCount: 0,
          startedAt: new Date('2024-01-01T14:30:00Z'),
          completedAt: new Date('2024-01-01T14:33:00Z'),
        },
        {
          operationType: 'webhook',
          status: 'failed',
          ordersProcessed: 5,
          ordersCreated: 0,
          errorCount: 5,
          startedAt: new Date('2024-01-01T16:15:00Z'),
          completedAt: new Date('2024-01-01T16:16:00Z'),
        },
      ];

      (prismaService.syncOperation.findMany as jest.Mock).mockResolvedValue(mockOperations);

      const metrics = await service.getSyncPerformanceMetrics(mockConnectionId, {
        startDate: new Date('2024-01-01T00:00:00Z'),
        endDate: new Date('2024-01-01T23:59:59Z'),
      });

      expect(metrics.totalOperations).toBe(3);
      expect(metrics.successRate).toBeCloseTo(66.67, 2);
      expect(metrics.averageOrdersPerSync).toBeCloseTo(11.67, 2);
      expect(metrics.errorRate).toBeCloseTo(17.14, 2); // 6 errors out of 35 total orders
      expect(metrics.operationsByType).toEqual({
        webhook: 2,
        manual: 1,
      });
      expect(metrics.operationsByHour).toEqual(
        expect.arrayContaining([
          { hour: 10, count: 1 },
          { hour: 14, count: 1 },
          { hour: 16, count: 1 },
        ])
      );
    });
  });

  describe('Error Handling and Recovery', () => {
    it('should handle retry operations correctly', async () => {
      const failedOperation = {
        id: 'failed-sync-123',
        connectionId: mockConnectionId,
        spreadsheetId: mockSpreadsheetId,
        operationType: 'webhook',
        status: 'failed',
        ordersProcessed: 5,
        ordersCreated: 2,
        ordersSkipped: 0,
        errorCount: 3,
        errorDetails: [],
        startedAt: new Date(),
        completedAt: new Date(),
      };

      const retryOperation = {
        id: 'retry-sync-123',
        connectionId: mockConnectionId,
        spreadsheetId: mockSpreadsheetId,
        operationType: 'webhook',
        status: 'pending',
        ordersProcessed: 0,
        ordersCreated: 0,
        ordersSkipped: 0,
        errorCount: 0,
        errorDetails: null,
        startedAt: new Date(),
        completedAt: null,
      };

      (prismaService.syncOperation.findUnique as jest.Mock).mockResolvedValue(failedOperation);
      (prismaService.syncOperation.create as jest.Mock).mockResolvedValue(retryOperation);

      const retryId = await service.retrySyncOperation('failed-sync-123', {
        maxRetries: 3,
        retryDelay: 2000,
        exponentialBackoff: true,
      });

      expect(retryId).toBe('retry-sync-123');
      expect(prismaService.syncOperation.create).toHaveBeenCalledWith({
        data: {
          connectionId: mockConnectionId,
          spreadsheetId: mockSpreadsheetId,
          operationType: 'webhook',
          status: 'pending',
          ordersProcessed: 0,
          ordersCreated: 0,
          ordersSkipped: 0,
          errorCount: 0,
          startedAt: expect.any(Date),
        },
      });
    });

    it('should handle cleanup of old operations', async () => {
      (prismaService.syncOperation.count as jest.Mock).mockResolvedValue(200);
      (prismaService.syncOperation.deleteMany as jest.Mock).mockResolvedValue({ count: 100 });

      const deletedCount = await service.cleanupOldOperations(30, 100);

      expect(deletedCount).toBe(100);
      expect(prismaService.syncOperation.deleteMany).toHaveBeenCalledWith({
        where: {
          startedAt: { lt: expect.any(Date) },
          status: { in: ['completed', 'failed'] }
        }
      });
    });
  });
});