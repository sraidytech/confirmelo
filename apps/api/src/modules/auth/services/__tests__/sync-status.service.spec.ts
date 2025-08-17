import { Test, TestingModule } from '@nestjs/testing';
import { SyncStatusService } from '../sync-status.service';
import { PrismaService } from '../../../../common/database/prisma.service';
import { NotFoundException } from '@nestjs/common';
import { SyncError } from '../../../../common/interfaces/google-sheets-order-sync.interface';

describe('SyncStatusService', () => {
  let service: SyncStatusService;
  let prismaService: any;

  const mockSyncOperation = {
    id: 'sync-123',
    connectionId: 'conn-123',
    spreadsheetId: 'sheet-123',
    operationType: 'manual',
    status: 'completed',
    ordersProcessed: 10,
    ordersCreated: 8,
    ordersSkipped: 2,
    errorCount: 0,
    errorDetails: null,
    startedAt: new Date('2024-01-01T10:00:00Z'),
    completedAt: new Date('2024-01-01T10:05:00Z'),
    createdAt: new Date('2024-01-01T10:00:00Z'),
  };

  const mockSyncError: SyncError = {
    rowNumber: 5,
    errorType: 'validation',
    errorMessage: 'Invalid phone number',
    orderData: { phone: 'invalid' },
    field: 'phone',
    suggestedFix: 'Use format: +212XXXXXXXXX'
  };

  beforeEach(async () => {
    const mockPrismaService = {
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
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SyncStatusService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
      ],
    }).compile();

    service = module.get<SyncStatusService>(SyncStatusService);
    prismaService = module.get(PrismaService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('recordSyncOperation', () => {
    it('should create a new sync operation record', async () => {
      prismaService.syncOperation.create.mockResolvedValue(mockSyncOperation);

      const result = await service.recordSyncOperation(
        'conn-123',
        'sheet-123',
        'manual',
        { test: 'metadata' }
      );

      expect(result).toBe('sync-123');
      expect(prismaService.syncOperation.create).toHaveBeenCalledWith({
        data: {
          connectionId: 'conn-123',
          spreadsheetId: 'sheet-123',
          operationType: 'manual',
          status: 'pending',
          ordersProcessed: 0,
          ordersCreated: 0,
          ordersSkipped: 0,
          errorCount: 0,
          startedAt: expect.any(Date),
        },
      });
    });
  });

  describe('updateSyncOperation', () => {
    it('should update sync operation with provided data', async () => {
      prismaService.syncOperation.update.mockResolvedValue(mockSyncOperation);

      await service.updateSyncOperation('sync-123', {
        status: 'processing',
        ordersProcessed: 5,
        ordersCreated: 3,
        errorCount: 1,
      });

      expect(prismaService.syncOperation.update).toHaveBeenCalledWith({
        where: { id: 'sync-123' },
        data: {
          status: 'processing',
          ordersProcessed: 5,
          ordersCreated: 3,
          errorCount: 1,
        },
      });
    });

    it('should handle error details in updates', async () => {
      const errorDetails = [mockSyncError];
      prismaService.syncOperation.update.mockResolvedValue(mockSyncOperation);

      await service.updateSyncOperation('sync-123', {
        status: 'failed',
        errorDetails,
      });

      expect(prismaService.syncOperation.update).toHaveBeenCalledWith({
        where: { id: 'sync-123' },
        data: {
          status: 'failed',
          errorDetails,
        },
      });
    });
  });

  describe('completeSyncOperation', () => {
    it('should mark sync operation as completed with success', async () => {
      const syncResult = {
        success: true,
        operationId: 'sync-123',
        ordersProcessed: 10,
        ordersCreated: 8,
        ordersSkipped: 2,
        errors: [],
        duration: 300000,
        startedAt: new Date(),
      };

      prismaService.syncOperation.update.mockResolvedValue(mockSyncOperation);

      await service.completeSyncOperation('sync-123', syncResult);

      expect(prismaService.syncOperation.update).toHaveBeenCalledWith({
        where: { id: 'sync-123' },
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

    it('should mark sync operation as failed with errors', async () => {
      const syncResult = {
        success: false,
        operationId: 'sync-123',
        ordersProcessed: 5,
        ordersCreated: 3,
        ordersSkipped: 0,
        errors: [mockSyncError],
        duration: 150000,
        startedAt: new Date(),
      };

      prismaService.syncOperation.update.mockResolvedValue(mockSyncOperation);

      await service.completeSyncOperation('sync-123', syncResult);

      expect(prismaService.syncOperation.update).toHaveBeenCalledWith({
        where: { id: 'sync-123' },
        data: {
          status: 'failed',
          ordersProcessed: 5,
          ordersCreated: 3,
          ordersSkipped: 0,
          errorCount: 1,
          errorDetails: [mockSyncError],
          completedAt: expect.any(Date),
        },
      });
    });
  });

  describe('recordSyncError', () => {
    it('should record error with string message', async () => {
      prismaService.syncOperation.update.mockResolvedValue(mockSyncOperation);

      await service.recordSyncError('sync-123', 'Connection failed');

      expect(prismaService.syncOperation.update).toHaveBeenCalledWith({
        where: { id: 'sync-123' },
        data: {
          status: 'failed',
          errorCount: 1,
          errorDetails: [{
            rowNumber: 0,
            errorType: 'system',
            errorMessage: 'Connection failed',
            orderData: {},
            suggestedFix: 'Check system logs and retry the operation'
          }],
          completedAt: expect.any(Date),
        },
      });
    });

    it('should record error with Error object', async () => {
      const error = new Error('Database connection lost');
      prismaService.syncOperation.update.mockResolvedValue(mockSyncOperation);

      await service.recordSyncError('sync-123', error);

      expect(prismaService.syncOperation.update).toHaveBeenCalledWith({
        where: { id: 'sync-123' },
        data: {
          status: 'failed',
          errorCount: 1,
          errorDetails: [{
            rowNumber: 0,
            errorType: 'system',
            errorMessage: 'Database connection lost',
            orderData: {},
            suggestedFix: 'Check system logs and retry the operation'
          }],
          completedAt: expect.any(Date),
        },
      });
    });

    it('should record error with detailed error information', async () => {
      const errorDetails = [mockSyncError];
      prismaService.syncOperation.update.mockResolvedValue(mockSyncOperation);

      await service.recordSyncError('sync-123', 'Validation failed', errorDetails);

      expect(prismaService.syncOperation.update).toHaveBeenCalledWith({
        where: { id: 'sync-123' },
        data: {
          status: 'failed',
          errorCount: 1,
          errorDetails,
          completedAt: expect.any(Date),
        },
      });
    });
  });

  describe('getSyncOperation', () => {
    it('should return sync operation when found', async () => {
      prismaService.syncOperation.findUnique.mockResolvedValue(mockSyncOperation);

      const result = await service.getSyncOperation('sync-123');

      expect(result).toEqual({
        id: 'sync-123',
        connectionId: 'conn-123',
        spreadsheetId: 'sheet-123',
        operationType: 'manual',
        status: 'completed',
        ordersProcessed: 10,
        ordersCreated: 8,
        ordersSkipped: 2,
        errorCount: 0,
        errorDetails: [],
        startedAt: mockSyncOperation.startedAt,
        completedAt: mockSyncOperation.completedAt,
      });
    });

    it('should return null when sync operation not found', async () => {
      prismaService.syncOperation.findUnique.mockResolvedValue(null);

      const result = await service.getSyncOperation('nonexistent');

      expect(result).toBeNull();
    });
  });

  describe('getSyncStatus', () => {
    it('should return sync status with current and last sync', async () => {
      const currentSync = { ...mockSyncOperation, status: 'processing' };
      const lastSync = mockSyncOperation;

      prismaService.syncOperation.findFirst
        .mockResolvedValueOnce(currentSync)
        .mockResolvedValueOnce(lastSync);

      // Mock aggregate for summary
      prismaService.syncOperation.aggregate.mockResolvedValue({
        _count: { id: 5 },
        _sum: {
          ordersProcessed: 50,
          ordersCreated: 40,
          errorCount: 2,
        },
      });

      prismaService.syncOperation.groupBy.mockResolvedValue([
        { status: 'completed', _count: { id: 3 } },
        { status: 'failed', _count: { id: 1 } },
        { status: 'processing', _count: { id: 1 } },
      ]);

      prismaService.syncOperation.findMany.mockResolvedValue([
        {
          startedAt: new Date('2024-01-01T10:00:00Z'),
          completedAt: new Date('2024-01-01T10:05:00Z'),
        },
      ]);

      const result = await service.getSyncStatus('conn-123');

      expect(result.currentSync).toBeDefined();
      expect(result.currentSync?.status).toBe('processing');
      expect(result.lastSync).toBeDefined();
      expect(result.lastSync?.status).toBe('completed');
      expect(result.summary).toEqual({
        totalOperations: 5,
        activeOperations: 1,
        completedOperations: 3,
        failedOperations: 1,
        totalOrdersProcessed: 50,
        totalOrdersCreated: 40,
        totalErrors: 2,
        averageDuration: 300000,
        lastSyncAt: undefined,
      });
    });
  });

  describe('getSyncHistory', () => {
    it('should return paginated sync history', async () => {
      const operations = [mockSyncOperation];
      prismaService.syncOperation.findMany.mockResolvedValue(operations);
      prismaService.syncOperation.count.mockResolvedValue(1);

      const result = await service.getSyncHistory('conn-123', {
        limit: 10,
        offset: 0,
      });

      expect(result.operations).toHaveLength(1);
      expect(result.totalCount).toBe(1);
      expect(result.hasMore).toBe(false);
    });

    it('should filter by status and operation type', async () => {
      prismaService.syncOperation.findMany.mockResolvedValue([]);
      prismaService.syncOperation.count.mockResolvedValue(0);

      await service.getSyncHistory('conn-123', {
        status: 'completed',
        operationType: 'webhook',
        spreadsheetId: 'sheet-123',
      });

      expect(prismaService.syncOperation.findMany).toHaveBeenCalledWith({
        where: {
          connectionId: 'conn-123',
          status: 'completed',
          operationType: 'webhook',
          spreadsheetId: 'sheet-123',
        },
        orderBy: { startedAt: 'desc' },
        take: 50,
        skip: 0,
      });
    });
  });

  describe('getSyncSummary', () => {
    it('should return comprehensive sync summary', async () => {
      prismaService.syncOperation.aggregate.mockResolvedValue({
        _count: { id: 10 },
        _sum: {
          ordersProcessed: 100,
          ordersCreated: 80,
          errorCount: 5,
        },
      });

      prismaService.syncOperation.groupBy.mockResolvedValue([
        { status: 'completed', _count: { id: 7 } },
        { status: 'failed', _count: { id: 2 } },
        { status: 'processing', _count: { id: 1 } },
      ]);

      prismaService.syncOperation.findMany.mockResolvedValue([
        {
          startedAt: new Date('2024-01-01T10:00:00Z'),
          completedAt: new Date('2024-01-01T10:05:00Z'),
        },
        {
          startedAt: new Date('2024-01-01T11:00:00Z'),
          completedAt: new Date('2024-01-01T11:03:00Z'),
        },
      ]);

      prismaService.syncOperation.findFirst.mockResolvedValue({
        startedAt: new Date('2024-01-01T12:00:00Z'),
      });

      const result = await service.getSyncSummary('conn-123');

      expect(result).toEqual({
        totalOperations: 10,
        activeOperations: 1,
        completedOperations: 7,
        failedOperations: 2,
        totalOrdersProcessed: 100,
        totalOrdersCreated: 80,
        totalErrors: 5,
        averageDuration: 240000, // Average of 5min and 3min
        lastSyncAt: new Date('2024-01-01T12:00:00Z'),
      });
    });
  });

  describe('retrySyncOperation', () => {
    it('should create retry operation for failed sync', async () => {
      const failedOperation = { ...mockSyncOperation, status: 'failed' };
      prismaService.syncOperation.findUnique.mockResolvedValue(failedOperation);
      prismaService.syncOperation.create.mockResolvedValue({
        ...mockSyncOperation,
        id: 'retry-123',
      });

      const result = await service.retrySyncOperation('sync-123');

      expect(result).toBe('retry-123');
      expect(prismaService.syncOperation.create).toHaveBeenCalledWith({
        data: {
          connectionId: 'conn-123',
          spreadsheetId: 'sheet-123',
          operationType: 'manual',
          status: 'pending',
          ordersProcessed: 0,
          ordersCreated: 0,
          ordersSkipped: 0,
          errorCount: 0,
          startedAt: expect.any(Date),
        },
      });
    });

    it('should throw error for non-existent operation', async () => {
      prismaService.syncOperation.findUnique.mockResolvedValue(null);

      await expect(service.retrySyncOperation('nonexistent')).rejects.toThrow(
        NotFoundException
      );
    });

    it('should throw error for non-failed operation', async () => {
      const completedOperation = { ...mockSyncOperation, status: 'completed' };
      prismaService.syncOperation.findUnique.mockResolvedValue(completedOperation);

      await expect(service.retrySyncOperation('sync-123')).rejects.toThrow(
        'Can only retry failed sync operations'
      );
    });
  });

  describe('cleanupOldOperations', () => {
    it('should delete old completed and failed operations', async () => {
      prismaService.syncOperation.count.mockResolvedValue(150);
      prismaService.syncOperation.deleteMany.mockResolvedValue({ count: 50 });

      const result = await service.cleanupOldOperations(30, 100);

      expect(result).toBe(50);
      expect(prismaService.syncOperation.deleteMany).toHaveBeenCalledWith({
        where: {
          startedAt: { lt: expect.any(Date) },
          status: { in: ['completed', 'failed'] }
        }
      });
    });

    it('should not delete if below minimum threshold', async () => {
      prismaService.syncOperation.count.mockResolvedValue(50);

      const result = await service.cleanupOldOperations(30, 100);

      expect(result).toBe(0);
      expect(prismaService.syncOperation.deleteMany).not.toHaveBeenCalled();
    });
  });

  describe('getSyncPerformanceMetrics', () => {
    it('should return comprehensive performance metrics', async () => {
      const operations = [
        {
          operationType: 'webhook',
          status: 'completed',
          ordersProcessed: 10,
          ordersCreated: 8,
          errorCount: 1,
          startedAt: new Date('2024-01-01T10:00:00Z'),
          completedAt: new Date('2024-01-01T10:05:00Z'),
        },
        {
          operationType: 'manual',
          status: 'completed',
          ordersProcessed: 5,
          ordersCreated: 5,
          errorCount: 0,
          startedAt: new Date('2024-01-01T14:00:00Z'),
          completedAt: new Date('2024-01-01T14:02:00Z'),
        },
        {
          operationType: 'webhook',
          status: 'failed',
          ordersProcessed: 3,
          ordersCreated: 0,
          errorCount: 3,
          startedAt: new Date('2024-01-01T16:00:00Z'),
          completedAt: new Date('2024-01-01T16:01:00Z'),
        },
      ];

      prismaService.syncOperation.findMany.mockResolvedValue(operations);

      const result = await service.getSyncPerformanceMetrics('conn-123', {
        startDate: new Date('2024-01-01T00:00:00Z'),
        endDate: new Date('2024-01-01T23:59:59Z'),
      });

      expect(result.totalOperations).toBe(3);
      expect(result.successRate).toBeCloseTo(66.67, 1); // 2 out of 3 successful
      expect(result.averageOrdersPerSync).toBe(6); // (10+5+3)/3
      expect(result.averageDuration).toBe(160000); // Average of 5min, 2min, 1min
      expect(result.errorRate).toBeCloseTo(22.22, 1); // 4 errors out of 18 total orders
      expect(result.operationsByType).toEqual({
        webhook: 2,
        manual: 1,
      });
      // Check that operationsByHour has 24 entries (one for each hour)
      expect(result.operationsByHour).toHaveLength(24);
      expect(result.operationsByHour[10].hour).toBe(10);
      expect(result.operationsByHour[14].hour).toBe(14);
      expect(result.operationsByHour[16].hour).toBe(16);
    });
  });
});