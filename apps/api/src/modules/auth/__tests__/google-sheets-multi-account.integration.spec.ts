import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { PrismaService } from '../../../common/database/prisma.service';
import { GoogleSheetsOAuth2Service } from '../services/google-sheets-oauth2.service';
import { OAuth2Service } from '../services/oauth2.service';
import { SpreadsheetConnectionService } from '../services/spreadsheet-connection.service';
import { ConfigService } from '@nestjs/config';
import { RedisService } from '../../../common/redis/redis.service';
import { PlatformType, ConnectionStatus } from '@prisma/client';

describe('Google Sheets Multi-Account Integration', () => {
  let app: INestApplication;
  let googleSheetsService: GoogleSheetsOAuth2Service;
  let oauth2Service: OAuth2Service;
  let spreadsheetService: SpreadsheetConnectionService;
  let prismaService: PrismaService;

  const mockUser = {
    id: 'test-user-id',
    organizationId: 'test-org-id',
  };

  const mockGoogleAccount1 = {
    id: 'google-user-1',
    email: 'user1@gmail.com',
    name: 'Test User 1',
    picture: 'https://example.com/avatar1.jpg',
    verified_email: true,
  };

  const mockGoogleAccount2 = {
    id: 'google-user-2',
    email: 'user2@gmail.com',
    name: 'Test User 2',
    picture: 'https://example.com/avatar2.jpg',
    verified_email: true,
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GoogleSheetsOAuth2Service,
        OAuth2Service,
        SpreadsheetConnectionService,
        {
          provide: PrismaService,
          useValue: {
            platformConnection: {
              findFirst: jest.fn(),
              findMany: jest.fn(),
              findUnique: jest.fn(),
              create: jest.fn(),
              update: jest.fn(),
              count: jest.fn(),
            },
            spreadsheetConnection: {
              findMany: jest.fn(),
              findUnique: jest.fn(),
              create: jest.fn(),
              update: jest.fn(),
              count: jest.fn(),
            },
          },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              const config = {
                OAUTH2_ENCRYPTION_KEY: 'test-encryption-key',
                GOOGLE_OAUTH2_CLIENT_ID: 'test-client-id',
                GOOGLE_OAUTH2_CLIENT_SECRET: 'test-client-secret',
                GOOGLE_OAUTH2_REDIRECT_URI: 'http://localhost:3000/auth/callback',
              };
              return config[key];
            }),
          },
        },
        {
          provide: RedisService,
          useValue: {
            set: jest.fn(),
            get: jest.fn(),
            del: jest.fn(),
          },
        },
      ],
    }).compile();

    app = module.createNestApplication();
    googleSheetsService = module.get<GoogleSheetsOAuth2Service>(GoogleSheetsOAuth2Service);
    oauth2Service = module.get<OAuth2Service>(OAuth2Service);
    spreadsheetService = module.get<SpreadsheetConnectionService>(SpreadsheetConnectionService);
    prismaService = module.get<PrismaService>(PrismaService);

    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  describe('Multi-Account Support', () => {
    it('should allow multiple Google accounts for the same user', async () => {
      // Mock no existing connections
      jest.spyOn(prismaService.platformConnection, 'findFirst').mockResolvedValue(null);
      
      // Mock successful connection creation
      const mockConnection1 = {
        id: 'connection-1',
        userId: mockUser.id,
        organizationId: mockUser.organizationId,
        platformType: PlatformType.GOOGLE_SHEETS,
        platformName: `Google Sheets - ${mockGoogleAccount1.email}`,
        status: ConnectionStatus.ACTIVE,
        accessToken: 'encrypted-access-token-1',
        refreshToken: 'encrypted-refresh-token-1',
        tokenExpiresAt: new Date(),
        platformUserId: 'google-user-1',
        platformStoreId: null,
        platformData: {},
        scopes: ['https://www.googleapis.com/auth/spreadsheets'],
        lastSyncAt: new Date(),
        lastErrorAt: null,
        lastErrorMessage: null,
        syncCount: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
        spreadsheetConnections: [],
      };

      const mockConnection2 = {
        id: 'connection-2',
        userId: mockUser.id,
        organizationId: mockUser.organizationId,
        platformType: PlatformType.GOOGLE_SHEETS,
        platformName: `Google Sheets - ${mockGoogleAccount2.email}`,
        status: ConnectionStatus.ACTIVE,
        accessToken: 'encrypted-access-token-2',
        refreshToken: 'encrypted-refresh-token-2',
        tokenExpiresAt: new Date(),
        platformUserId: 'google-user-2',
        platformStoreId: null,
        platformData: {},
        scopes: ['https://www.googleapis.com/auth/spreadsheets'],
        lastSyncAt: new Date(),
        lastErrorAt: null,
        lastErrorMessage: null,
        syncCount: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
        spreadsheetConnections: [],
      };

      jest.spyOn(oauth2Service, 'storeConnection')
        .mockResolvedValueOnce(mockConnection1.id)
        .mockResolvedValueOnce(mockConnection2.id);

      // Mock Google user info calls
      jest.spyOn(googleSheetsService, 'getGoogleUserInfo')
        .mockResolvedValueOnce(mockGoogleAccount1)
        .mockResolvedValueOnce(mockGoogleAccount2);

      // Test connecting first account
      const result1 = await googleSheetsService.completeGoogleAuthorization(
        'auth-code-1',
        'state-1',
        mockUser.id,
        mockUser.organizationId,
      );

      expect(result1.connectionId).toBe(mockConnection1.id);
      expect(result1.userInfo.email).toBe(mockGoogleAccount1.email);

      // Test connecting second account
      const result2 = await googleSheetsService.completeGoogleAuthorization(
        'auth-code-2',
        'state-2',
        mockUser.id,
        mockUser.organizationId,
      );

      expect(result2.connectionId).toBe(mockConnection2.id);
      expect(result2.userInfo.email).toBe(mockGoogleAccount2.email);

      // Verify both connections were created
      expect(oauth2Service.storeConnection).toHaveBeenCalledTimes(2);
    });

    it('should update existing connection when reconnecting same Google account', async () => {
      const existingConnection = {
        id: 'existing-connection',
        userId: mockUser.id,
        organizationId: mockUser.organizationId,
        platformType: PlatformType.GOOGLE_SHEETS,
        platformName: 'Google Sheets - test@example.com',
        status: ConnectionStatus.EXPIRED,
        accessToken: 'encrypted-access-token',
        refreshToken: 'encrypted-refresh-token',
        tokenExpiresAt: new Date(),
        platformUserId: 'google-user-123',
        platformStoreId: null,
        platformData: { google_email: mockGoogleAccount1.email },
        scopes: ['https://www.googleapis.com/auth/spreadsheets'],
        lastSyncAt: new Date(),
        lastErrorAt: null,
        lastErrorMessage: null,
        syncCount: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
        spreadsheetConnections: [],
      };

      // Mock existing connection found
      jest.spyOn(prismaService.platformConnection, 'findFirst').mockResolvedValue(existingConnection);
      jest.spyOn(prismaService.platformConnection, 'update').mockResolvedValue({
        ...existingConnection,
        status: ConnectionStatus.ACTIVE,
      });

      // Mock Google user info call
      jest.spyOn(googleSheetsService, 'getGoogleUserInfo').mockResolvedValue(mockGoogleAccount1);

      const result = await googleSheetsService.completeGoogleAuthorization(
        'auth-code',
        'state',
        mockUser.id,
        mockUser.organizationId,
      );

      expect(result.connectionId).toBe(existingConnection.id);
      expect(prismaService.platformConnection.update).toHaveBeenCalledWith({
        where: { id: existingConnection.id },
        data: expect.objectContaining({
          status: ConnectionStatus.ACTIVE,
        }),
      });
    });

    it('should list all connected Google accounts', async () => {
      const mockConnections = [
        {
          id: 'connection-1',
          userId: mockUser.id,
          organizationId: mockUser.organizationId,
          platformType: PlatformType.GOOGLE_SHEETS,
          platformName: 'Google Sheets - test@example.com',
          status: ConnectionStatus.ACTIVE,
          accessToken: 'encrypted-access-token-1',
          refreshToken: 'encrypted-refresh-token-1',
          tokenExpiresAt: new Date(),
          platformUserId: 'google-user-1',
          platformStoreId: null,
          scopes: ['https://www.googleapis.com/auth/spreadsheets'],
          lastSyncAt: new Date(),
          lastErrorAt: null,
          lastErrorMessage: null,
          syncCount: 5,
          createdAt: new Date(),
          updatedAt: new Date(),
          platformData: {
            google_email: mockGoogleAccount1.email,
            google_name: mockGoogleAccount1.name,
            google_picture: mockGoogleAccount1.picture,
          },
          spreadsheetConnections: [{ id: 'sheet-1' }, { id: 'sheet-2' }],
        },
        {
          id: 'connection-2',
          userId: mockUser.id,
          organizationId: mockUser.organizationId,
          platformType: PlatformType.GOOGLE_SHEETS,
          platformName: 'Google Sheets - test2@example.com',
          status: ConnectionStatus.ACTIVE,
          accessToken: 'encrypted-access-token-2',
          refreshToken: 'encrypted-refresh-token-2',
          tokenExpiresAt: new Date(),
          platformUserId: 'google-user-2',
          platformStoreId: null,
          scopes: ['https://www.googleapis.com/auth/spreadsheets'],
          lastSyncAt: new Date(),
          lastErrorAt: null,
          lastErrorMessage: null,
          syncCount: 3,
          createdAt: new Date(),
          updatedAt: new Date(),
          platformData: {
            google_email: mockGoogleAccount2.email,
            google_name: mockGoogleAccount2.name,
            google_picture: mockGoogleAccount2.picture,
          },
          spreadsheetConnections: [{ id: 'sheet-3' }],
        },
      ];

      jest.spyOn(prismaService.platformConnection, 'findMany').mockResolvedValue(mockConnections);

      const accounts = await googleSheetsService.listConnectedGoogleAccounts(
        mockUser.id,
        mockUser.organizationId,
      );

      expect(accounts).toHaveLength(2);
      expect(accounts[0]).toMatchObject({
        connectionId: 'connection-1',
        email: mockGoogleAccount1.email,
        name: mockGoogleAccount1.name,
        spreadsheetCount: 2,
      });
      expect(accounts[1]).toMatchObject({
        connectionId: 'connection-2',
        email: mockGoogleAccount2.email,
        name: mockGoogleAccount2.name,
        spreadsheetCount: 1,
      });
    });

    it('should switch to specific Google account', async () => {
      const mockConnection = {
        id: 'connection-1',
        userId: mockUser.id,
        organizationId: mockUser.organizationId,
        platformType: PlatformType.GOOGLE_SHEETS,
        platformName: 'Google Sheets - test@example.com',
        status: ConnectionStatus.ACTIVE,
        accessToken: 'encrypted-access-token',
        refreshToken: 'encrypted-refresh-token',
        tokenExpiresAt: new Date(),
        platformUserId: 'google-user-1',
        platformStoreId: null,
        scopes: ['https://www.googleapis.com/auth/spreadsheets'],
        lastSyncAt: new Date(),
        lastErrorAt: null,
        lastErrorMessage: null,
        syncCount: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
        platformData: { google_email: mockGoogleAccount1.email },
        spreadsheetConnections: [],
      };

      jest.spyOn(prismaService.platformConnection, 'findFirst').mockResolvedValue(mockConnection);

      const connectionId = await googleSheetsService.switchToGoogleAccount(
        mockUser.id,
        mockUser.organizationId,
        mockGoogleAccount1.email,
      );

      expect(connectionId).toBe(mockConnection.id);
      expect(prismaService.platformConnection.findFirst).toHaveBeenCalledWith({
        where: {
          userId: mockUser.id,
          organizationId: mockUser.organizationId,
          platformType: PlatformType.GOOGLE_SHEETS,
          platformData: {
            path: ['google_email'],
            equals: mockGoogleAccount1.email,
          },
          status: ConnectionStatus.ACTIVE,
        },
      });
    });

    it('should throw error when switching to non-existent Google account', async () => {
      jest.spyOn(prismaService.platformConnection, 'findFirst').mockResolvedValue(null);

      await expect(
        googleSheetsService.switchToGoogleAccount(
          mockUser.id,
          mockUser.organizationId,
          'nonexistent@gmail.com',
        ),
      ).rejects.toThrow('No active connection found for Google account: nonexistent@gmail.com');
    });
  });

  describe('Multi-Spreadsheet Support', () => {
    const mockConnectionId = 'test-connection-id';
    const mockSpreadsheetId = 'test-spreadsheet-id';

    it('should connect to multiple spreadsheets', async () => {
      const mockSpreadsheetConnection = {
        id: 'spreadsheet-connection-1',
        connectionId: mockConnectionId,
        spreadsheetId: mockSpreadsheetId,
        spreadsheetName: 'Test Spreadsheet',
        isActive: true,
        connectedAt: new Date(),
        syncCount: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      jest.spyOn(spreadsheetService, 'connectSpreadsheet').mockResolvedValue(mockSpreadsheetConnection);

      const result = await googleSheetsService.connectToSpreadsheet(
        mockConnectionId,
        mockSpreadsheetId,
      );

      expect(result.spreadsheet.id).toBe(mockSpreadsheetId);
      expect(spreadsheetService.connectSpreadsheet).toHaveBeenCalledWith({
        connectionId: mockConnectionId,
        spreadsheetId: mockSpreadsheetId,
        spreadsheetName: expect.any(String),
        webViewLink: expect.any(String),
      });
    });

    it('should list connected spreadsheets', async () => {
      const mockConnectedSpreadsheets = [
        {
          id: 'conn-1',
          connectionId: mockConnectionId,
          spreadsheetId: 'sheet-1',
          spreadsheetName: 'Spreadsheet 1',
          webViewLink: 'https://docs.google.com/spreadsheets/d/sheet-1',
          connectedAt: new Date(),
          isActive: true,
          sheetsData: [{ id: 0, name: 'Sheet1' }],
          syncCount: 5,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: 'conn-2',
          connectionId: mockConnectionId,
          spreadsheetId: 'sheet-2',
          spreadsheetName: 'Spreadsheet 2',
          webViewLink: 'https://docs.google.com/spreadsheets/d/sheet-2',
          connectedAt: new Date(),
          isActive: true,
          sheetsData: [{ id: 0, name: 'Orders' }],
          syncCount: 3,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      jest.spyOn(spreadsheetService, 'listConnectedSpreadsheets').mockResolvedValue({
        spreadsheets: mockConnectedSpreadsheets,
        total: mockConnectedSpreadsheets.length,
        hasMore: false,
        page: 1,
        limit: 50,
      });

      const result = await googleSheetsService.getConnectedSpreadsheets(mockConnectionId);

      expect(result).toHaveLength(2);
      expect(result[0]).toMatchObject({
        id: 'sheet-1',
        name: 'Spreadsheet 1',
        syncCount: 5,
      });
      expect(result[1]).toMatchObject({
        id: 'sheet-2',
        name: 'Spreadsheet 2',
        syncCount: 3,
      });
    });

    it('should disconnect from specific spreadsheet', async () => {
      jest.spyOn(spreadsheetService, 'disconnectSpreadsheet').mockResolvedValue();

      await googleSheetsService.disconnectFromSpreadsheet(mockConnectionId, mockSpreadsheetId);

      expect(spreadsheetService.disconnectSpreadsheet).toHaveBeenCalledWith(
        mockConnectionId,
        mockSpreadsheetId,
      );
    });
  });

  describe('Performance and Error Handling', () => {
    it('should handle concurrent token refresh requests', async () => {
      const mockConnection = {
        id: 'connection-1',
        userId: mockUser.id,
        organizationId: mockUser.organizationId,
        platformType: PlatformType.GOOGLE_SHEETS,
        platformName: 'Google Sheets - test@example.com',
        status: ConnectionStatus.ACTIVE,
        accessToken: 'encrypted-access-token',
        refreshToken: 'encrypted-refresh-token',
        tokenExpiresAt: new Date(Date.now() - 1000), // Expired
        platformUserId: 'google-user-1',
        platformStoreId: null,
        platformData: {},
        scopes: ['https://www.googleapis.com/auth/spreadsheets'],
        lastSyncAt: new Date(),
        lastErrorAt: null,
        lastErrorMessage: null,
        syncCount: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
        spreadsheetConnections: [],
      };

      jest.spyOn(prismaService.platformConnection, 'findUnique').mockResolvedValue(mockConnection);
      jest.spyOn(oauth2Service, 'validateAndRefreshToken').mockResolvedValue(true);

      // Simulate concurrent requests
      const promises = Array(5).fill(null).map(() => 
        oauth2Service.getAccessToken(mockConnection.id)
      );

      await Promise.all(promises);

      // Should only refresh once due to queue management
      expect(oauth2Service.validateAndRefreshToken).toHaveBeenCalledTimes(1);
    });

    it('should handle spreadsheet connection errors gracefully', async () => {
      jest.spyOn(spreadsheetService, 'connectSpreadsheet').mockRejectedValue(
        new Error('Spreadsheet not accessible')
      );

      await expect(
        googleSheetsService.connectToSpreadsheet('connection-id', 'invalid-sheet-id')
      ).rejects.toThrow('Spreadsheet not accessible');
    });

    it('should batch update spreadsheet connections efficiently', async () => {
      const updates = [
        {
          connectionId: 'conn-1',
          spreadsheetId: 'sheet-1',
          data: { spreadsheetName: 'Updated Sheet 1', isAccessible: true },
        },
        {
          connectionId: 'conn-1',
          spreadsheetId: 'sheet-2',
          data: { spreadsheetName: 'Updated Sheet 2', isAccessible: false, errorMessage: 'Access denied' },
        },
      ];

      jest.spyOn(spreadsheetService, 'batchUpdateSpreadsheets').mockResolvedValue();

      await spreadsheetService.batchUpdateSpreadsheets(updates);

      expect(spreadsheetService.batchUpdateSpreadsheets).toHaveBeenCalledWith(updates);
    });
  });

  describe('Scope Testing and Validation', () => {
    it('should test current OAuth2 scopes', async () => {
      const mockConnection = {
        id: 'connection-1',
        userId: mockUser.id,
        organizationId: mockUser.organizationId,
        platformType: PlatformType.GOOGLE_SHEETS,
        platformName: 'Google Sheets - test@example.com',
        status: ConnectionStatus.ACTIVE,
        accessToken: 'encrypted-access-token',
        refreshToken: 'encrypted-refresh-token',
        tokenExpiresAt: new Date(),
        platformUserId: 'google-user-1',
        platformStoreId: null,
        platformData: {},
        scopes: ['https://www.googleapis.com/auth/spreadsheets', 'https://www.googleapis.com/auth/drive.file'],
        lastSyncAt: new Date(),
        lastErrorAt: null,
        lastErrorMessage: null,
        syncCount: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
        spreadsheetConnections: [],
      };

      jest.spyOn(prismaService.platformConnection, 'findUnique').mockResolvedValue(mockConnection);
      jest.spyOn(oauth2Service, 'getAccessToken').mockResolvedValue('mock-access-token');
      
      // Mock successful API calls
      jest.spyOn(googleSheetsService, 'getGoogleUserInfo').mockResolvedValue(mockGoogleAccount1);
      jest.spyOn(googleSheetsService, 'testGoogleDriveAccess').mockResolvedValue({ accessible: true });
      jest.spyOn(googleSheetsService as any, 'testSheetsApiAccess').mockResolvedValue({ accessible: true });

      const result = await googleSheetsService.testCurrentScopes(mockConnection.id);

      expect(result.availableScopes).toContain('https://www.googleapis.com/auth/spreadsheets');
      expect(result.availableScopes).toContain('https://www.googleapis.com/auth/drive.file');
      expect(result.missingScopes).toHaveLength(0);
    });

    it('should identify missing scopes', async () => {
      const mockConnection = {
        id: 'connection-1',
        userId: mockUser.id,
        organizationId: mockUser.organizationId,
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
        lastSyncAt: new Date(),
        lastErrorAt: null,
        lastErrorMessage: null,
        syncCount: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
        spreadsheetConnections: [],
      };

      jest.spyOn(prismaService.platformConnection, 'findUnique').mockResolvedValue(mockConnection);
      jest.spyOn(oauth2Service, 'getAccessToken').mockResolvedValue('mock-access-token');
      
      // Mock failed Drive API call
      jest.spyOn(googleSheetsService, 'getGoogleUserInfo').mockResolvedValue(mockGoogleAccount1);
      jest.spyOn(googleSheetsService, 'testGoogleDriveAccess').mockRejectedValue(new Error('Insufficient permissions'));
      jest.spyOn(googleSheetsService as any, 'testSheetsApiAccess').mockResolvedValue({ accessible: true });

      const result = await googleSheetsService.testCurrentScopes(mockConnection.id);

      expect(result.availableScopes).toContain('https://www.googleapis.com/auth/spreadsheets');
      expect(result.missingScopes).toContain('https://www.googleapis.com/auth/drive.file');
    });
  });
});