import { Test, TestingModule } from '@nestjs/testing';
import { SpreadsheetConnectionService } from '../services/spreadsheet-connection.service';
import { PrismaService } from '../../../common/database/prisma.service';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { ConnectionStatus, PlatformType } from '@prisma/client';

describe('SpreadsheetConnectionService', () => {
  let service: SpreadsheetConnectionService;
  let prismaService: PrismaService;

  const mockPlatformConnection = {
    id: 'platform-connection-1',
    platformType: PlatformType.GOOGLE_SHEETS,
    platformName: 'Google Sheets - test@example.com',
    status: ConnectionStatus.ACTIVE,
    accessToken: 'encrypted-access-token',
    refreshToken: 'encrypted-refresh-token',
    tokenExpiresAt: new Date(),
    platformUserId: 'google-user-1',
    platformStoreId: null,
    platformData: {},
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    userId: 'user-1',
    organizationId: 'org-1',
    lastSyncAt: new Date(),
    lastErrorAt: null,
    lastErrorMessage: null,
    syncCount: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
    spreadsheetConnections: [],
  };

  const mockSpreadsheetConnection = {
    id: 'spreadsheet-connection-1',
    connectionId: 'platform-connection-1',
    spreadsheetId: 'spreadsheet-1',
    spreadsheetName: 'Test Spreadsheet',
    webViewLink: 'https://docs.google.com/spreadsheets/d/spreadsheet-1',
    isActive: true,
    connectedAt: new Date(),
    lastAccessedAt: new Date(),
    sheetsData: [
      { id: 0, name: 'Sheet1', index: 0, rowCount: 1000, columnCount: 26 },
      { id: 1, name: 'Orders', index: 1, rowCount: 500, columnCount: 12 },
    ],
    permissions: {
      canEdit: true,
      canShare: false,
      canComment: true,
      role: 'editor',
    },
    syncCount: 5,
    lastSyncAt: new Date(),
    lastErrorAt: null,
    lastErrorMessage: null,
    isOrderSync: false,
    orderSyncConfig: null,
    lastSyncRow: 1,
    webhookSubscriptionId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SpreadsheetConnectionService,
        {
          provide: PrismaService,
          useValue: {
            platformConnection: {
              findUnique: jest.fn(),
              update: jest.fn(),
            },
            spreadsheetConnection: {
              findUnique: jest.fn(),
              findMany: jest.fn(),
              create: jest.fn(),
              update: jest.fn(),
              count: jest.fn(),
              aggregate: jest.fn(),
            },
          },
        },
      ],
    }).compile();

    service = module.get<SpreadsheetConnectionService>(SpreadsheetConnectionService);
    prismaService = module.get<PrismaService>(PrismaService);
  });

  describe('connectSpreadsheet', () => {
    it('should create new spreadsheet connection', async () => {
      jest.spyOn(prismaService.platformConnection, 'findUnique').mockResolvedValue(mockPlatformConnection);
      jest.spyOn(prismaService.spreadsheetConnection, 'findUnique').mockResolvedValue(null);
      jest.spyOn(prismaService.spreadsheetConnection, 'create').mockResolvedValue(mockSpreadsheetConnection);

      const request = {
        connectionId: 'platform-connection-1',
        spreadsheetId: 'spreadsheet-1',
        spreadsheetName: 'Test Spreadsheet',
        webViewLink: 'https://docs.google.com/spreadsheets/d/spreadsheet-1',
        sheets: [
          { id: 0, name: 'Sheet1', index: 0, rowCount: 1000, columnCount: 26 },
        ],
        permissions: {
          canEdit: true,
          canShare: false,
          canComment: true,
          role: 'editor' as const,
        },
      };

      const result = await service.connectSpreadsheet(request);

      expect(result.spreadsheetId).toBe('spreadsheet-1');
      expect(result.spreadsheetName).toBe('Test Spreadsheet');
      expect(result.isActive).toBe(true);
      expect(prismaService.spreadsheetConnection.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          connectionId: 'platform-connection-1',
          spreadsheetId: 'spreadsheet-1',
          spreadsheetName: 'Test Spreadsheet',
          isActive: true,
        }),
      });
    });

    it('should update existing active connection', async () => {
      const existingConnection = { ...mockSpreadsheetConnection, isActive: true };
      
      jest.spyOn(prismaService.platformConnection, 'findUnique').mockResolvedValue(mockPlatformConnection);
      jest.spyOn(prismaService.spreadsheetConnection, 'findUnique').mockResolvedValue(existingConnection);
      jest.spyOn(prismaService.spreadsheetConnection, 'update').mockResolvedValue(existingConnection);

      const request = {
        connectionId: 'platform-connection-1',
        spreadsheetId: 'spreadsheet-1',
        spreadsheetName: 'Updated Spreadsheet Name',
      };

      const result = await service.connectSpreadsheet(request);

      expect(result.spreadsheetName).toBe('Updated Spreadsheet Name');
      expect(prismaService.spreadsheetConnection.update).toHaveBeenCalledWith({
        where: { id: existingConnection.id },
        data: expect.objectContaining({
          spreadsheetName: 'Updated Spreadsheet Name',
          lastAccessedAt: expect.any(Date),
        }),
      });
    });

    it('should reactivate inactive connection', async () => {
      const inactiveConnection = { ...mockSpreadsheetConnection, isActive: false };
      
      jest.spyOn(prismaService.platformConnection, 'findUnique').mockResolvedValue(mockPlatformConnection);
      jest.spyOn(prismaService.spreadsheetConnection, 'findUnique').mockResolvedValue(inactiveConnection);
      jest.spyOn(prismaService.spreadsheetConnection, 'update').mockResolvedValue({
        ...inactiveConnection,
        isActive: true,
      });

      const request = {
        connectionId: 'platform-connection-1',
        spreadsheetId: 'spreadsheet-1',
        spreadsheetName: 'Reactivated Spreadsheet',
      };

      const result = await service.connectSpreadsheet(request);

      expect(result.isActive).toBe(true);
      expect(prismaService.spreadsheetConnection.update).toHaveBeenCalledWith({
        where: { id: inactiveConnection.id },
        data: expect.objectContaining({
          isActive: true,
          connectedAt: expect.any(Date),
        }),
      });
    });

    it('should throw error for non-existent platform connection', async () => {
      jest.spyOn(prismaService.platformConnection, 'findUnique').mockResolvedValue(null);

      const request = {
        connectionId: 'non-existent-connection',
        spreadsheetId: 'spreadsheet-1',
        spreadsheetName: 'Test Spreadsheet',
      };

      await expect(service.connectSpreadsheet(request)).rejects.toThrow(NotFoundException);
    });

    it('should throw error for inactive platform connection', async () => {
      const inactivePlatformConnection = {
        ...mockPlatformConnection,
        status: ConnectionStatus.EXPIRED,
      };

      jest.spyOn(prismaService.platformConnection, 'findUnique').mockResolvedValue(inactivePlatformConnection);

      const request = {
        connectionId: 'platform-connection-1',
        spreadsheetId: 'spreadsheet-1',
        spreadsheetName: 'Test Spreadsheet',
      };

      await expect(service.connectSpreadsheet(request)).rejects.toThrow(BadRequestException);
    });
  });

  describe('disconnectSpreadsheet', () => {
    it('should mark spreadsheet connection as inactive', async () => {
      jest.spyOn(prismaService.spreadsheetConnection, 'findUnique').mockResolvedValue(mockSpreadsheetConnection);
      jest.spyOn(prismaService.spreadsheetConnection, 'update').mockResolvedValue({
        ...mockSpreadsheetConnection,
        isActive: false,
      });

      await service.disconnectSpreadsheet('platform-connection-1', 'spreadsheet-1');

      expect(prismaService.spreadsheetConnection.update).toHaveBeenCalledWith({
        where: { id: mockSpreadsheetConnection.id },
        data: {
          isActive: false,
          updatedAt: expect.any(Date),
        },
      });
    });

    it('should throw error for non-existent spreadsheet connection', async () => {
      jest.spyOn(prismaService.spreadsheetConnection, 'findUnique').mockResolvedValue(null);

      await expect(
        service.disconnectSpreadsheet('platform-connection-1', 'non-existent-spreadsheet')
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('listConnectedSpreadsheets', () => {
    it('should return active spreadsheet connections by default', async () => {
      const mockConnections = [
        mockSpreadsheetConnection,
        { ...mockSpreadsheetConnection, id: 'spreadsheet-connection-2', spreadsheetId: 'spreadsheet-2' },
      ];

      jest.spyOn(prismaService.spreadsheetConnection, 'findMany').mockResolvedValue(mockConnections);

      const result = await service.listConnectedSpreadsheets('platform-connection-1');

      expect(result).toHaveLength(2);
      expect(prismaService.spreadsheetConnection.findMany).toHaveBeenCalledWith({
        where: {
          connectionId: 'platform-connection-1',
          isActive: true,
        },
        orderBy: [
          { isActive: 'desc' },
          { lastAccessedAt: 'desc' },
          { connectedAt: 'desc' },
        ],
      });
    });

    it('should include inactive connections when requested', async () => {
      const mockConnections = [
        mockSpreadsheetConnection,
        { ...mockSpreadsheetConnection, id: 'spreadsheet-connection-2', isActive: false },
      ];

      jest.spyOn(prismaService.spreadsheetConnection, 'findMany').mockResolvedValue(mockConnections);

      const result = await service.listConnectedSpreadsheets('platform-connection-1', true);

      expect(result).toHaveLength(2);
      expect(prismaService.spreadsheetConnection.findMany).toHaveBeenCalledWith({
        where: {
          connectionId: 'platform-connection-1',
        },
        orderBy: [
          { isActive: 'desc' },
          { lastAccessedAt: 'desc' },
          { connectedAt: 'desc' },
        ],
      });
    });
  });

  describe('updateSpreadsheetConnection', () => {
    it('should update spreadsheet connection metadata', async () => {
      jest.spyOn(prismaService.spreadsheetConnection, 'findUnique').mockResolvedValue(mockSpreadsheetConnection);
      jest.spyOn(prismaService.spreadsheetConnection, 'update').mockResolvedValue({
        ...mockSpreadsheetConnection,
        spreadsheetName: 'Updated Name',
        lastSyncAt: new Date(),
      });

      const updates = {
        spreadsheetName: 'Updated Name',
        lastSyncAt: new Date(),
      };

      const result = await service.updateSpreadsheetConnection(
        'platform-connection-1',
        'spreadsheet-1',
        updates
      );

      expect(result.spreadsheetName).toBe('Updated Name');
      expect(prismaService.spreadsheetConnection.update).toHaveBeenCalledWith({
        where: { id: mockSpreadsheetConnection.id },
        data: expect.objectContaining({
          spreadsheetName: 'Updated Name',
          lastSyncAt: expect.any(Date),
          syncCount: { increment: 1 },
        }),
      });
    });

    it('should handle error updates', async () => {
      jest.spyOn(prismaService.spreadsheetConnection, 'findUnique').mockResolvedValue(mockSpreadsheetConnection);
      jest.spyOn(prismaService.spreadsheetConnection, 'update').mockResolvedValue({
        ...mockSpreadsheetConnection,
        lastErrorAt: new Date(),
        lastErrorMessage: 'Access denied',
      });

      const updates = {
        lastErrorAt: new Date(),
        lastErrorMessage: 'Access denied',
      };

      const result = await service.updateSpreadsheetConnection(
        'platform-connection-1',
        'spreadsheet-1',
        updates
      );

      expect(result.lastErrorMessage).toBe('Access denied');
      expect(result.lastErrorAt).toBeDefined();
    });
  });

  describe('getConnectionStatistics', () => {
    it('should return comprehensive connection statistics', async () => {
      jest.spyOn(prismaService.spreadsheetConnection, 'count')
        .mockResolvedValueOnce(10) // total
        .mockResolvedValueOnce(8)  // active
        .mockResolvedValueOnce(2); // with errors

      jest.spyOn(prismaService.spreadsheetConnection, 'aggregate').mockResolvedValue({
        _count: { id: 10 },
        _sum: { syncCount: 150 },
        _avg: { syncCount: 15 },
        _min: { syncCount: 1 },
        _max: {
          lastAccessedAt: new Date('2023-12-01'),
          lastErrorAt: new Date('2023-11-30'),
          syncCount: 50,
        },
      });

      const stats = await service.getConnectionStatistics('platform-connection-1');

      expect(stats).toEqual({
        totalSpreadsheets: 10,
        activeSpreadsheets: 8,
        inactiveSpreadsheets: 2,
        lastAccessedAt: new Date('2023-12-01'),
        totalSyncCount: 150,
        spreadsheetsWithErrors: 2,
        lastErrorAt: new Date('2023-11-30'),
      });
    });

    it('should handle null aggregate results', async () => {
      jest.spyOn(prismaService.spreadsheetConnection, 'count')
        .mockResolvedValueOnce(0)
        .mockResolvedValueOnce(0)
        .mockResolvedValueOnce(0);

      jest.spyOn(prismaService.spreadsheetConnection, 'aggregate').mockResolvedValue({
        _count: { id: 0 },
        _sum: { syncCount: null },
        _avg: { syncCount: null },
        _min: { syncCount: null },
        _max: {
          lastAccessedAt: null,
          lastErrorAt: null,
          syncCount: null,
        },
      });

      const stats = await service.getConnectionStatistics('platform-connection-1');

      expect(stats.totalSyncCount).toBe(0);
      expect(stats.lastAccessedAt).toBeUndefined();
      expect(stats.lastErrorAt).toBeUndefined();
    });
  });

  describe('getSpreadsheetsNeedingRefresh', () => {
    it('should find spreadsheets that need metadata refresh', async () => {
      const oldDate = new Date(Date.now() - 25 * 60 * 60 * 1000); // 25 hours ago
      const spreadsheetsNeedingRefresh = [
        {
          id: 'spreadsheet-connection-1',
          connectionId: 'connection-1',
          spreadsheetId: 'spreadsheet-1',
          spreadsheetName: 'Old Spreadsheet',
          webViewLink: 'https://docs.google.com/spreadsheets/d/spreadsheet-1',
          isActive: true,
          permissions: {},
          sheetsData: [],
          syncCount: 5,
          connectedAt: oldDate,
          lastSyncAt: oldDate,
          lastAccessedAt: oldDate,
          lastErrorAt: null,
          lastErrorMessage: null,
          isOrderSync: false,
          orderSyncConfig: null,
          lastSyncRow: 1,
          webhookSubscriptionId: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: 'spreadsheet-connection-2',
          connectionId: 'connection-2',
          spreadsheetId: 'spreadsheet-2',
          spreadsheetName: 'Never Synced',
          webViewLink: 'https://docs.google.com/spreadsheets/d/spreadsheet-2',
          isActive: true,
          permissions: {},
          sheetsData: [],
          syncCount: 0,
          connectedAt: new Date(),
          lastSyncAt: null,
          lastAccessedAt: null,
          lastErrorAt: null,
          lastErrorMessage: null,
          isOrderSync: false,
          orderSyncConfig: null,
          lastSyncRow: 1,
          webhookSubscriptionId: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      jest.spyOn(prismaService.spreadsheetConnection, 'findMany').mockResolvedValue(spreadsheetsNeedingRefresh);

      const result = await service.getSpreadsheetsNeedingRefresh(24 * 60 * 60 * 1000); // 24 hours

      expect(result).toHaveLength(2);
      expect(result[0].spreadsheetName).toBe('Old Spreadsheet');
      expect(result[1].spreadsheetName).toBe('Never Synced');

      expect(prismaService.spreadsheetConnection.findMany).toHaveBeenCalledWith({
        where: {
          isActive: true,
          OR: [
            { lastSyncAt: null },
            { lastSyncAt: { lt: expect.any(Date) } },
          ],
        },
        select: {
          connectionId: true,
          spreadsheetId: true,
          spreadsheetName: true,
          lastSyncAt: true,
        },
        orderBy: [
          { lastSyncAt: 'asc' },
          { connectedAt: 'asc' },
        ],
      });
    });
  });

  describe('batchUpdateSpreadsheets', () => {
    it('should update multiple spreadsheet connections', async () => {
      const updates = [
        {
          connectionId: 'connection-1',
          spreadsheetId: 'spreadsheet-1',
          data: {
            spreadsheetName: 'Updated Sheet 1',
            isAccessible: true,
          },
        },
        {
          connectionId: 'connection-1',
          spreadsheetId: 'spreadsheet-2',
          data: {
            spreadsheetName: 'Updated Sheet 2',
            isAccessible: false,
            errorMessage: 'Access denied',
          },
        },
      ];

      jest.spyOn(service, 'updateSpreadsheetConnection').mockResolvedValue(mockSpreadsheetConnection as any);

      await service.batchUpdateSpreadsheets(updates);

      expect(service.updateSpreadsheetConnection).toHaveBeenCalledTimes(2);
      expect(service.updateSpreadsheetConnection).toHaveBeenCalledWith(
        'connection-1',
        'spreadsheet-1',
        expect.objectContaining({
          spreadsheetName: 'Updated Sheet 1',
          lastSyncAt: expect.any(Date),
          lastErrorAt: null,
          lastErrorMessage: null,
        })
      );
      expect(service.updateSpreadsheetConnection).toHaveBeenCalledWith(
        'connection-1',
        'spreadsheet-2',
        expect.objectContaining({
          spreadsheetName: 'Updated Sheet 2',
          lastSyncAt: expect.any(Date),
          lastErrorAt: expect.any(Date),
          lastErrorMessage: 'Access denied',
        })
      );
    });

    it('should handle partial failures in batch updates', async () => {
      const updates = [
        {
          connectionId: 'connection-1',
          spreadsheetId: 'spreadsheet-1',
          data: { spreadsheetName: 'Updated Sheet 1' },
        },
        {
          connectionId: 'connection-1',
          spreadsheetId: 'invalid-spreadsheet',
          data: { spreadsheetName: 'Invalid Sheet' },
        },
      ];

      jest.spyOn(service, 'updateSpreadsheetConnection')
        .mockResolvedValueOnce(mockSpreadsheetConnection as any)
        .mockRejectedValueOnce(new Error('Spreadsheet not found'));

      // Should not throw error despite one failure
      await expect(service.batchUpdateSpreadsheets(updates)).resolves.not.toThrow();

      expect(service.updateSpreadsheetConnection).toHaveBeenCalledTimes(2);
    });
  });

  describe('Performance Considerations', () => {
    it('should efficiently handle large numbers of connections', async () => {
      const largeConnectionSet = Array.from({ length: 1000 }, (_, i) => ({
        ...mockSpreadsheetConnection,
        id: `spreadsheet-connection-${i}`,
        spreadsheetId: `spreadsheet-${i}`,
      }));

      jest.spyOn(prismaService.spreadsheetConnection, 'findMany').mockResolvedValue(largeConnectionSet);

      const startTime = Date.now();
      const result = await service.listConnectedSpreadsheets('platform-connection-1');
      const endTime = Date.now();

      expect(result).toHaveLength(1000);
      expect(endTime - startTime).toBeLessThan(100); // Should complete quickly
    });

    it('should use appropriate database indexes', async () => {
      await service.listConnectedSpreadsheets('platform-connection-1');

      // Verify the query uses indexed fields
      expect(prismaService.spreadsheetConnection.findMany).toHaveBeenCalledWith({
        where: {
          connectionId: 'platform-connection-1', // Should be indexed
          isActive: true, // Should be indexed
        },
        orderBy: [
          { isActive: 'desc' },
          { lastAccessedAt: 'desc' }, // Should be indexed
          { connectedAt: 'desc' }, // Should be indexed
        ],
      });
    });
  });
});