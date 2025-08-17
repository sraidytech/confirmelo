import { Test, TestingModule } from '@nestjs/testing';
import { SyncStatusController } from '../sync-status.controller';
import { SyncStatusService } from '../../services/sync-status.service';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { JwtAuthGuard } from '../../../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../../../common/guards/roles.guard';
import { SyncOperation } from '../../../../common/interfaces/google-sheets-order-sync.interface';

describe('SyncStatusController', () => {
  let controller: SyncStatusController;
  let syncStatusService: jest.Mocked<SyncStatusService>;

  const mockUser = {
    id: 'user-123',
    organizationId: 'org-123',
    role: 'CLIENT_ADMIN',
  };

  const mockSyncOperation: SyncOperation = {
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
    startedAt: new Date('2024-01-01T10:00:00Z'),
    completedAt: new Date('2024-01-01T10:05:00Z'),
  };

  const mockSyncStatus = {
    currentSync: undefined,
    lastSync: mockSyncOperation,
    summary: {
      totalOperations: 5,
      activeOperations: 0,
      completedOperations: 4,
      failedOperations: 1,
      totalOrdersProcessed: 50,
      totalOrdersCreated: 40,
      totalErrors: 2,
      averageDuration: 300000,
      lastSyncAt: new Date('2024-01-01T10:00:00Z'),
    },
  };

  beforeEach(async () => {
    const mockSyncStatusService = {
      getSyncStatus: jest.fn(),
      getSyncHistory: jest.fn(),
      getSyncSummary: jest.fn(),
      getSyncOperation: jest.fn(),
      retrySyncOperation: jest.fn(),
      getSyncPerformanceMetrics: jest.fn(),
      cleanupOldOperations: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [SyncStatusController],
      providers: [
        {
          provide: SyncStatusService,
          useValue: mockSyncStatusService,
        },
      ],
    })
    .overrideGuard(JwtAuthGuard)
    .useValue({ canActivate: () => true })
    .overrideGuard(RolesGuard)
    .useValue({ canActivate: () => true })
    .compile();

    controller = module.get<SyncStatusController>(SyncStatusController);
    syncStatusService = module.get(SyncStatusService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getSyncStatus', () => {
    it('should return sync status for a connection', async () => {
      syncStatusService.getSyncStatus.mockResolvedValue(mockSyncStatus);

      const result = await controller.getSyncStatus('conn-123', mockUser);

      expect(result).toEqual({
        success: true,
        data: mockSyncStatus,
      });
      expect(syncStatusService.getSyncStatus).toHaveBeenCalledWith('conn-123');
    });
  });

  describe('getSyncHistory', () => {
    it('should return paginated sync history', async () => {
      const mockHistory = {
        operations: [mockSyncOperation],
        totalCount: 1,
        hasMore: false,
      };

      syncStatusService.getSyncHistory.mockResolvedValue(mockHistory);

      const result = await controller.getSyncHistory('conn-123', {
        limit: 10,
        offset: 0,
      }, mockUser);

      expect(result).toEqual({
        success: true,
        data: mockHistory,
      });
      expect(syncStatusService.getSyncHistory).toHaveBeenCalledWith('conn-123', {
        limit: 10,
        offset: 0,
        status: undefined,
        operationType: undefined,
        spreadsheetId: undefined,
      });
    });

    it('should apply default pagination values', async () => {
      const mockHistory = {
        operations: [mockSyncOperation],
        totalCount: 1,
        hasMore: false,
      };

      syncStatusService.getSyncHistory.mockResolvedValue(mockHistory);

      await controller.getSyncHistory('conn-123', {}, mockUser);

      expect(syncStatusService.getSyncHistory).toHaveBeenCalledWith('conn-123', {
        limit: 50,
        offset: 0,
        status: undefined,
        operationType: undefined,
        spreadsheetId: undefined,
      });
    });

    it('should validate limit parameter', async () => {
      await expect(
        controller.getSyncHistory('conn-123', { limit: 150 }, mockUser)
      ).rejects.toThrow(BadRequestException);
    });

    it('should validate offset parameter', async () => {
      await expect(
        controller.getSyncHistory('conn-123', { offset: -1 }, mockUser)
      ).rejects.toThrow(BadRequestException);
    });

    it('should filter by status and operation type', async () => {
      const mockHistory = {
        operations: [mockSyncOperation],
        totalCount: 1,
        hasMore: false,
      };

      syncStatusService.getSyncHistory.mockResolvedValue(mockHistory);

      await controller.getSyncHistory('conn-123', {
        status: 'completed',
        operationType: 'webhook',
        spreadsheetId: 'sheet-123',
      }, mockUser);

      expect(syncStatusService.getSyncHistory).toHaveBeenCalledWith('conn-123', {
        limit: 50,
        offset: 0,
        status: 'completed',
        operationType: 'webhook',
        spreadsheetId: 'sheet-123',
      });
    });
  });

  describe('getSyncSummary', () => {
    it('should return sync summary statistics', async () => {
      syncStatusService.getSyncSummary.mockResolvedValue(mockSyncStatus.summary);

      const result = await controller.getSyncSummary('conn-123', mockUser);

      expect(result).toEqual({
        success: true,
        data: mockSyncStatus.summary,
      });
      expect(syncStatusService.getSyncSummary).toHaveBeenCalledWith('conn-123');
    });
  });

  describe('getSyncOperation', () => {
    it('should return sync operation details', async () => {
      syncStatusService.getSyncOperation.mockResolvedValue(mockSyncOperation);

      const result = await controller.getSyncOperation('sync-123', mockUser);

      expect(result).toEqual({
        success: true,
        data: mockSyncOperation,
      });
      expect(syncStatusService.getSyncOperation).toHaveBeenCalledWith('sync-123');
    });

    it('should throw NotFoundException when operation not found', async () => {
      syncStatusService.getSyncOperation.mockResolvedValue(null);

      await expect(
        controller.getSyncOperation('nonexistent', mockUser)
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('retrySyncOperation', () => {
    it('should retry a failed sync operation', async () => {
      syncStatusService.retrySyncOperation.mockResolvedValue('retry-123');

      const result = await controller.retrySyncOperation('sync-123', mockUser);

      expect(result).toEqual({
        success: true,
        data: {
          retryOperationId: 'retry-123',
          message: 'Sync operation retry initiated',
        },
      });
      expect(syncStatusService.retrySyncOperation).toHaveBeenCalledWith('sync-123', {
        maxRetries: 3,
        retryDelay: 2000,
        exponentialBackoff: true,
      });
    });
  });

  describe('getSyncPerformanceMetrics', () => {
    it('should return performance metrics for valid date range', async () => {
      const mockMetrics = {
        totalOperations: 10,
        successRate: 80,
        averageOrdersPerSync: 15,
        averageDuration: 240000,
        errorRate: 5,
        operationsByType: { webhook: 7, manual: 3 },
        operationsByHour: [
          { hour: 10, count: 3 },
          { hour: 14, count: 2 },
        ],
      };

      syncStatusService.getSyncPerformanceMetrics.mockResolvedValue(mockMetrics);

      const result = await controller.getSyncPerformanceMetrics('conn-123', {
        startDate: '2024-01-01T00:00:00Z',
        endDate: '2024-01-07T23:59:59Z',
      }, mockUser);

      expect(result).toEqual({
        success: true,
        data: mockMetrics,
      });
      expect(syncStatusService.getSyncPerformanceMetrics).toHaveBeenCalledWith('conn-123', {
        startDate: new Date('2024-01-01T00:00:00Z'),
        endDate: new Date('2024-01-07T23:59:59Z'),
      });
    });

    it('should validate required date parameters', async () => {
      await expect(
        controller.getSyncPerformanceMetrics('conn-123', {
          startDate: '2024-01-01T00:00:00Z',
          endDate: '',
        }, mockUser)
      ).rejects.toThrow(BadRequestException);

      await expect(
        controller.getSyncPerformanceMetrics('conn-123', {
          startDate: '',
          endDate: '2024-01-07T23:59:59Z',
        }, mockUser)
      ).rejects.toThrow(BadRequestException);
    });

    it('should validate date format', async () => {
      await expect(
        controller.getSyncPerformanceMetrics('conn-123', {
          startDate: 'invalid-date',
          endDate: '2024-01-07T23:59:59Z',
        }, mockUser)
      ).rejects.toThrow(BadRequestException);
    });

    it('should validate date range order', async () => {
      await expect(
        controller.getSyncPerformanceMetrics('conn-123', {
          startDate: '2024-01-07T00:00:00Z',
          endDate: '2024-01-01T23:59:59Z',
        }, mockUser)
      ).rejects.toThrow(BadRequestException);
    });

    it('should validate maximum date range', async () => {
      await expect(
        controller.getSyncPerformanceMetrics('conn-123', {
          startDate: '2024-01-01T00:00:00Z',
          endDate: '2024-04-01T23:59:59Z', // More than 90 days
        }, mockUser)
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('cleanupOldOperations', () => {
    it('should cleanup old operations with default parameters', async () => {
      syncStatusService.cleanupOldOperations.mockResolvedValue(25);

      const result = await controller.cleanupOldOperations(undefined, undefined, mockUser);

      expect(result).toEqual({
        success: true,
        data: {
          deletedCount: 25,
          message: 'Cleaned up 25 old sync operations',
        },
      });
      expect(syncStatusService.cleanupOldOperations).toHaveBeenCalledWith(30, 100);
    });

    it('should cleanup old operations with custom parameters', async () => {
      syncStatusService.cleanupOldOperations.mockResolvedValue(50);

      const result = await controller.cleanupOldOperations('60', '200', mockUser);

      expect(result).toEqual({
        success: true,
        data: {
          deletedCount: 50,
          message: 'Cleaned up 50 old sync operations',
        },
      });
      expect(syncStatusService.cleanupOldOperations).toHaveBeenCalledWith(60, 200);
    });

    it('should validate olderThanDays parameter', async () => {
      await expect(
        controller.cleanupOldOperations('invalid', '100', mockUser)
      ).rejects.toThrow(BadRequestException);

      await expect(
        controller.cleanupOldOperations('0', '100', mockUser)
      ).rejects.toThrow(BadRequestException);

      await expect(
        controller.cleanupOldOperations('5', '100', mockUser)
      ).rejects.toThrow(BadRequestException);
    });

    it('should validate keepMinimum parameter', async () => {
      await expect(
        controller.cleanupOldOperations('30', 'invalid', mockUser)
      ).rejects.toThrow(BadRequestException);

      await expect(
        controller.cleanupOldOperations('30', '-1', mockUser)
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('healthCheck', () => {
    it('should return health status', async () => {
      const result = await controller.healthCheck();

      expect(result).toEqual({
        success: true,
        service: 'SyncStatusService',
        status: 'healthy',
        timestamp: expect.any(String),
      });
    });
  });
});