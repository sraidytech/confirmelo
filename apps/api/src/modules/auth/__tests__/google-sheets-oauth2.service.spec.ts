import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { GoogleSheetsOAuth2Service } from '../services/google-sheets-oauth2.service';
import { OAuth2Service } from '../services/oauth2.service';
import { OAuth2ConfigService } from '../services/oauth2-config.service';
import { PrismaService } from '../../../common/database/prisma.service';
import { PlatformType, ConnectionStatus } from '@prisma/client';
import axios from 'axios';

// Mock axios
jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('GoogleSheetsOAuth2Service', () => {
  let service: GoogleSheetsOAuth2Service;
  let configService: any;
  let prismaService: any;
  let oauth2Service: any;
  let oauth2ConfigService: any;
  let mockAxiosInstance: any;

  const mockUser = {
    id: 'user-123',
    organizationId: 'org-456',
    email: 'test@example.com',
  };

  const mockGoogleConfig = {
    clientId: 'google-client-id',
    clientSecret: 'google-client-secret',
    redirectUri: 'http://localhost:3000/auth/oauth2/google/callback',
    authorizationUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    scopes: [
      'https://www.googleapis.com/auth/spreadsheets',
      'https://www.googleapis.com/auth/drive.file',
    ],
    usePKCE: true,
  };

  const mockTokenResponse = {
    access_token: 'google-access-token',
    refresh_token: 'google-refresh-token',
    expires_in: 3600,
    token_type: 'Bearer',
    scope: 'https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/drive.file',
  };

  const mockGoogleUserInfo = {
    id: 'google-user-123',
    email: 'user@gmail.com',
    name: 'Test User',
    picture: 'https://example.com/avatar.jpg',
    locale: 'en',
    verified_email: true,
  };

  const mockConnection = {
    id: 'connection-123',
    platformType: PlatformType.GOOGLE_SHEETS,
    platformName: 'Google Sheets - user@gmail.com',
    status: ConnectionStatus.ACTIVE,
    accessToken: 'encrypted-access-token',
    refreshToken: 'encrypted-refresh-token',
    tokenExpiresAt: new Date(Date.now() + 3600000),
    scopes: mockGoogleConfig.scopes,
    userId: mockUser.id,
    organizationId: mockUser.organizationId,
    platformData: {
      google_user_id: mockGoogleUserInfo.id,
      google_email: mockGoogleUserInfo.email,
      google_name: mockGoogleUserInfo.name,
      google_picture: mockGoogleUserInfo.picture,
      google_locale: mockGoogleUserInfo.locale,
      verified_email: mockGoogleUserInfo.verified_email,
      api_version: 'v4',
      connected_at: new Date().toISOString(),
    },
    lastSyncAt: new Date(),
    syncCount: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    // Create mock axios instance
    mockAxiosInstance = {
      get: jest.fn(),
      post: jest.fn(),
      put: jest.fn(),
      delete: jest.fn(),
      interceptors: {
        request: { use: jest.fn() },
        response: { use: jest.fn() },
      },
    };

    mockedAxios.create.mockReturnValue(mockAxiosInstance);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GoogleSheetsOAuth2Service,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn(),
          },
        },
        {
          provide: PrismaService,
          useValue: {
            platformConnection: {
              findFirst: jest.fn(),
              findUnique: jest.fn(),
              create: jest.fn(),
              update: jest.fn(),
              count: jest.fn(),
              findMany: jest.fn(),
            },
          },
        },
        {
          provide: OAuth2Service,
          useValue: {
            generateAuthorizationUrl: jest.fn(),
            exchangeCodeForToken: jest.fn(),
            storeConnection: jest.fn(),
            getAccessToken: jest.fn(),
            refreshAccessToken: jest.fn(),
          },
        },
        {
          provide: OAuth2ConfigService,
          useValue: {
            getConfig: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<GoogleSheetsOAuth2Service>(GoogleSheetsOAuth2Service);
    configService = module.get(ConfigService);
    prismaService = module.get(PrismaService);
    oauth2Service = module.get(OAuth2Service);
    oauth2ConfigService = module.get(OAuth2ConfigService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('initiateGoogleAuthorization', () => {
    it('should generate authorization URL successfully', async () => {
      // Arrange
      oauth2ConfigService.getConfig.mockResolvedValue(mockGoogleConfig);
      prismaService.platformConnection.findFirst.mockResolvedValue(null);
      oauth2Service.generateAuthorizationUrl.mockResolvedValue({
        authorizationUrl: 'https://accounts.google.com/o/oauth2/v2/auth?response_type=code&client_id=google-client-id&redirect_uri=http%3A%2F%2Flocalhost%3A3000%2Fauth%2Foauth2%2Fgoogle%2Fcallback&scope=https%3A%2F%2Fwww.googleapis.com%2Fauth%2Fspreadsheets%20https%3A%2F%2Fwww.googleapis.com%2Fauth%2Fdrive.file&state=random-state&code_challenge=challenge&code_challenge_method=S256',
        state: 'random-state',
        codeVerifier: 'code-verifier',
        codeChallenge: 'code-challenge',
      });

      // Act
      const result = await service.initiateGoogleAuthorization(
        mockUser.id,
        mockUser.organizationId,
      );

      // Assert
      expect(result).toEqual({
        authorizationUrl: expect.stringContaining('https://accounts.google.com/o/oauth2/v2/auth'),
        state: 'random-state',
      });
      expect(oauth2ConfigService.getConfig).toHaveBeenCalledWith(PlatformType.GOOGLE_SHEETS);
      expect(prismaService.platformConnection.findFirst).toHaveBeenCalledWith({
        where: {
          userId: mockUser.id,
          organizationId: mockUser.organizationId,
          platformType: PlatformType.GOOGLE_SHEETS,
          status: ConnectionStatus.ACTIVE,
        },
      });
      expect(oauth2Service.generateAuthorizationUrl).toHaveBeenCalledWith(
        PlatformType.GOOGLE_SHEETS,
        mockGoogleConfig,
        mockUser.id,
        mockUser.organizationId,
      );
    });

    it('should throw error if Google OAuth2 not configured', async () => {
      // Arrange
      oauth2ConfigService.getConfig.mockResolvedValue(null);

      // Act & Assert
      await expect(
        service.initiateGoogleAuthorization(mockUser.id, mockUser.organizationId),
      ).rejects.toThrow(BadRequestException);
      expect(oauth2ConfigService.getConfig).toHaveBeenCalledWith(PlatformType.GOOGLE_SHEETS);
    });

    it('should throw error if active connection already exists', async () => {
      // Arrange
      oauth2ConfigService.getConfig.mockResolvedValue(mockGoogleConfig);
      prismaService.platformConnection.findFirst.mockResolvedValue(mockConnection);

      // Act & Assert
      await expect(
        service.initiateGoogleAuthorization(mockUser.id, mockUser.organizationId),
      ).rejects.toThrow(BadRequestException);
      expect(prismaService.platformConnection.findFirst).toHaveBeenCalledWith({
        where: {
          userId: mockUser.id,
          organizationId: mockUser.organizationId,
          platformType: PlatformType.GOOGLE_SHEETS,
          status: ConnectionStatus.ACTIVE,
        },
      });
    });
  });

  describe('completeGoogleAuthorization', () => {
    const authCode = 'auth-code-123';
    const state = 'state-456';

    it('should complete authorization successfully', async () => {
      // Arrange
      const stateData = {
        userId: mockUser.id,
        organizationId: mockUser.organizationId,
        platformType: PlatformType.GOOGLE_SHEETS,
        timestamp: Date.now(),
      };

      oauth2ConfigService.getConfig.mockResolvedValue(mockGoogleConfig);
      oauth2Service.exchangeCodeForToken.mockResolvedValue({
        tokenResponse: mockTokenResponse,
        stateData,
      });
      mockAxiosInstance.get.mockResolvedValue({
        data: mockGoogleUserInfo,
      });
      oauth2Service.storeConnection.mockResolvedValue('connection-123');

      // Act
      const result = await service.completeGoogleAuthorization(
        authCode,
        state,
        mockUser.id,
        mockUser.organizationId,
      );

      // Assert
      expect(result).toEqual({
        connectionId: 'connection-123',
        userInfo: mockGoogleUserInfo,
      });
      expect(oauth2ConfigService.getConfig).toHaveBeenCalledWith(PlatformType.GOOGLE_SHEETS);
      expect(oauth2Service.exchangeCodeForToken).toHaveBeenCalledWith(
        authCode,
        state,
        mockGoogleConfig,
      );
      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/oauth2/v2/userinfo', {
        headers: {
          Authorization: `Bearer ${mockTokenResponse.access_token}`,
        },
      });
      expect(oauth2Service.storeConnection).toHaveBeenCalledWith(
        mockUser.id,
        mockUser.organizationId,
        PlatformType.GOOGLE_SHEETS,
        `Google Sheets - ${mockGoogleUserInfo.email}`,
        mockTokenResponse,
        mockGoogleConfig.scopes,
        expect.objectContaining({
          google_user_id: mockGoogleUserInfo.id,
          google_email: mockGoogleUserInfo.email,
          google_name: mockGoogleUserInfo.name,
          api_version: 'v4',
        }),
      );
    });

    it('should throw error if state validation fails', async () => {
      // Arrange
      const stateData = {
        userId: 'different-user',
        organizationId: mockUser.organizationId,
        platformType: PlatformType.GOOGLE_SHEETS,
        timestamp: Date.now(),
      };

      oauth2ConfigService.getConfig.mockResolvedValue(mockGoogleConfig);
      oauth2Service.exchangeCodeForToken.mockResolvedValue({
        tokenResponse: mockTokenResponse,
        stateData,
      });

      // Act & Assert
      await expect(
        service.completeGoogleAuthorization(
          authCode,
          state,
          mockUser.id,
          mockUser.organizationId,
        ),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should handle Google API errors gracefully', async () => {
      // Arrange
      const stateData = {
        userId: mockUser.id,
        organizationId: mockUser.organizationId,
        platformType: PlatformType.GOOGLE_SHEETS,
        timestamp: Date.now(),
      };

      oauth2ConfigService.getConfig.mockResolvedValue(mockGoogleConfig);
      oauth2Service.exchangeCodeForToken.mockResolvedValue({
        tokenResponse: mockTokenResponse,
        stateData,
      });
      mockAxiosInstance.get.mockRejectedValue(new Error('Google API error'));

      // Act & Assert
      await expect(
        service.completeGoogleAuthorization(
          authCode,
          state,
          mockUser.id,
          mockUser.organizationId,
        ),
      ).rejects.toThrow('Failed to get user information: Google API error');
    });
  });

  describe('testGoogleSheetsConnection', () => {
    it('should test connection successfully', async () => {
      // Arrange
      prismaService.platformConnection.findUnique.mockResolvedValue(mockConnection);
      oauth2Service.getAccessToken.mockResolvedValue('valid-access-token');
      mockAxiosInstance.get
        .mockResolvedValueOnce({ data: mockGoogleUserInfo }) // User info call
        .mockResolvedValueOnce({ // Drive info call
          data: {
            user: { displayName: 'Test User' },
            storageQuota: { limit: '15000000000', usage: '1000000000' },
          },
        });
      prismaService.platformConnection.update.mockResolvedValue(mockConnection);

      // Act
      const result = await service.testGoogleSheetsConnection('connection-123');

      // Assert
      expect(result.success).toBe(true);
      expect(result.details).toEqual(
        expect.objectContaining({
          platform: 'Google Sheets',
          apiVersion: 'v4',
          user: expect.objectContaining({
            id: mockGoogleUserInfo.id,
            email: mockGoogleUserInfo.email,
            name: mockGoogleUserInfo.name,
            verified: mockGoogleUserInfo.verified_email,
          }),
          features: [
            'read_spreadsheets',
            'write_spreadsheets',
            'create_spreadsheets',
            'read_drive_files',
          ],
        }),
      );
      expect(prismaService.platformConnection.update).toHaveBeenCalledWith({
        where: { id: 'connection-123' },
        data: {
          lastSyncAt: expect.any(Date),
          syncCount: { increment: 1 },
        },
      });
    });

    it('should handle connection not found', async () => {
      // Arrange
      prismaService.platformConnection.findUnique.mockResolvedValue(null);

      // Act
      const result = await service.testGoogleSheetsConnection('connection-123');

      // Assert
      expect(result.success).toBe(false);
      expect(result.error).toBe('Google Sheets connection not found');
    });

    it('should handle inactive connection', async () => {
      // Arrange
      const inactiveConnection = {
        ...mockConnection,
        status: ConnectionStatus.EXPIRED,
      };
      prismaService.platformConnection.findUnique.mockResolvedValue(inactiveConnection);

      // Act
      const result = await service.testGoogleSheetsConnection('connection-123');

      // Assert
      expect(result.success).toBe(false);
      expect(result.error).toBe('Connection is not active (status: EXPIRED)');
    });

    it('should handle API errors and update connection', async () => {
      // Arrange
      prismaService.platformConnection.findUnique.mockResolvedValue(mockConnection);
      oauth2Service.getAccessToken.mockRejectedValue(new Error('Token expired'));
      prismaService.platformConnection.update.mockResolvedValue(mockConnection);

      // Act
      const result = await service.testGoogleSheetsConnection('connection-123');

      // Assert
      expect(result.success).toBe(false);
      expect(result.error).toBe('Token expired');
      expect(prismaService.platformConnection.update).toHaveBeenCalledWith({
        where: { id: 'connection-123' },
        data: {
          lastErrorAt: expect.any(Date),
          lastErrorMessage: 'Token expired',
        },
      });
    });
  });

  describe('getGoogleUserInfo', () => {
    it('should get user info successfully', async () => {
      // Arrange
      mockAxiosInstance.get.mockResolvedValue({
        data: mockGoogleUserInfo,
      });

      // Act
      const result = await service.getGoogleUserInfo('access-token');

      // Assert
      expect(result).toEqual(mockGoogleUserInfo);
      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/oauth2/v2/userinfo', {
        headers: {
          Authorization: 'Bearer access-token',
        },
      });
    });

    it('should handle API errors', async () => {
      // Arrange
      mockAxiosInstance.get.mockRejectedValue(new Error('API error'));

      // Act & Assert
      await expect(service.getGoogleUserInfo('access-token')).rejects.toThrow(
        'Failed to get user information: API error',
      );
    });
  });

  describe('createSpreadsheet', () => {
    const mockSpreadsheet = {
      spreadsheetId: 'spreadsheet-123',
      properties: {
        title: 'Test Spreadsheet',
        locale: 'en_US',
        autoRecalc: 'ON_CHANGE',
        timeZone: 'UTC',
      },
      sheets: [
        {
          properties: {
            sheetId: 0,
            title: 'Sheet1',
            index: 0,
            sheetType: 'GRID',
            gridProperties: {
              rowCount: 1000,
              columnCount: 26,
            },
          },
        },
      ],
    };

    it('should create spreadsheet successfully', async () => {
      // Arrange
      mockAxiosInstance.post.mockResolvedValue({
        data: mockSpreadsheet,
      });

      // Act
      const result = await service.createSpreadsheet('access-token', 'Test Spreadsheet');

      // Assert
      expect(result).toEqual(mockSpreadsheet);
      expect(mockAxiosInstance.post).toHaveBeenCalledWith(
        '/sheets/v4/spreadsheets',
        {
          properties: {
            title: 'Test Spreadsheet',
            locale: 'en_US',
            autoRecalc: 'ON_CHANGE',
            timeZone: 'UTC',
          },
        },
        {
          headers: {
            Authorization: 'Bearer access-token',
          },
        },
      );
    });

    it('should create spreadsheet with custom sheets', async () => {
      // Arrange
      const customSheets = [
        { title: 'Orders', rowCount: 500, columnCount: 10 },
        { title: 'Products', rowCount: 200, columnCount: 8 },
      ];
      mockAxiosInstance.post.mockResolvedValue({
        data: mockSpreadsheet,
      });

      // Act
      const result = await service.createSpreadsheet(
        'access-token',
        'Test Spreadsheet',
        customSheets,
      );

      // Assert
      expect(result).toEqual(mockSpreadsheet);
      expect(mockAxiosInstance.post).toHaveBeenCalledWith(
        '/sheets/v4/spreadsheets',
        {
          properties: {
            title: 'Test Spreadsheet',
            locale: 'en_US',
            autoRecalc: 'ON_CHANGE',
            timeZone: 'UTC',
          },
          sheets: [
            {
              properties: {
                title: 'Orders',
                index: 0,
                sheetType: 'GRID',
                gridProperties: {
                  rowCount: 500,
                  columnCount: 10,
                },
              },
            },
            {
              properties: {
                title: 'Products',
                index: 1,
                sheetType: 'GRID',
                gridProperties: {
                  rowCount: 200,
                  columnCount: 8,
                },
              },
            },
          ],
        },
        {
          headers: {
            Authorization: 'Bearer access-token',
          },
        },
      );
    });

    it('should handle API errors', async () => {
      // Arrange
      mockAxiosInstance.post.mockRejectedValue(new Error('API error'));

      // Act & Assert
      await expect(
        service.createSpreadsheet('access-token', 'Test Spreadsheet'),
      ).rejects.toThrow('Failed to create spreadsheet: API error');
    });
  });

  describe('getSpreadsheetValues', () => {
    it('should get spreadsheet values successfully', async () => {
      // Arrange
      const mockValues = [
        ['Name', 'Email', 'Phone'],
        ['John Doe', 'john@example.com', '123-456-7890'],
        ['Jane Smith', 'jane@example.com', '098-765-4321'],
      ];
      mockAxiosInstance.get.mockResolvedValue({
        data: { values: mockValues },
      });

      // Act
      const result = await service.getSpreadsheetValues(
        'access-token',
        'spreadsheet-123',
        'Sheet1!A1:C3',
      );

      // Assert
      expect(result).toEqual(mockValues);
      expect(mockAxiosInstance.get).toHaveBeenCalledWith(
        '/sheets/v4/spreadsheets/spreadsheet-123/values/Sheet1!A1%3AC3',
        {
          headers: {
            Authorization: 'Bearer access-token',
          },
          params: {
            valueRenderOption: 'FORMATTED_VALUE',
          },
        },
      );
    });

    it('should return empty array if no values', async () => {
      // Arrange
      mockAxiosInstance.get.mockResolvedValue({
        data: {},
      });

      // Act
      const result = await service.getSpreadsheetValues(
        'access-token',
        'spreadsheet-123',
        'Sheet1!A1:C3',
      );

      // Assert
      expect(result).toEqual([]);
    });

    it('should handle API errors', async () => {
      // Arrange
      mockAxiosInstance.get.mockRejectedValue(new Error('API error'));

      // Act & Assert
      await expect(
        service.getSpreadsheetValues('access-token', 'spreadsheet-123', 'Sheet1!A1:C3'),
      ).rejects.toThrow('Failed to get spreadsheet values: API error');
    });
  });

  describe('updateSpreadsheetValues', () => {
    it('should update spreadsheet values successfully', async () => {
      // Arrange
      const values = [
        ['Updated Name', 'Updated Email'],
        ['John Updated', 'john.updated@example.com'],
      ];
      const mockResponse = {
        updatedRows: 2,
        updatedColumns: 2,
        updatedCells: 4,
      };
      mockAxiosInstance.put.mockResolvedValue({
        data: mockResponse,
      });

      // Act
      const result = await service.updateSpreadsheetValues(
        'access-token',
        'spreadsheet-123',
        'Sheet1!A1:B2',
        values,
      );

      // Assert
      expect(result).toEqual(mockResponse);
      expect(mockAxiosInstance.put).toHaveBeenCalledWith(
        '/sheets/v4/spreadsheets/spreadsheet-123/values/Sheet1!A1%3AB2',
        {
          values,
          majorDimension: 'ROWS',
        },
        {
          headers: {
            Authorization: 'Bearer access-token',
          },
          params: {
            valueInputOption: 'USER_ENTERED',
          },
        },
      );
    });

    it('should handle API errors', async () => {
      // Arrange
      const values = [['test', 'data']];
      mockAxiosInstance.put.mockRejectedValue(new Error('API error'));

      // Act & Assert
      await expect(
        service.updateSpreadsheetValues(
          'access-token',
          'spreadsheet-123',
          'Sheet1!A1:B1',
          values,
        ),
      ).rejects.toThrow('Failed to update spreadsheet values: API error');
    });
  });

  describe('refreshGoogleToken', () => {
    it('should refresh token successfully', async () => {
      // Arrange
      oauth2ConfigService.getConfig.mockResolvedValue(mockGoogleConfig);
      oauth2Service.refreshAccessToken.mockResolvedValue(mockTokenResponse);

      // Act
      await service.refreshGoogleToken('connection-123');

      // Assert
      expect(oauth2ConfigService.getConfig).toHaveBeenCalledWith(PlatformType.GOOGLE_SHEETS);
      expect(oauth2Service.refreshAccessToken).toHaveBeenCalledWith(
        'connection-123',
        mockGoogleConfig,
      );
    });

    it('should throw error if config not found', async () => {
      // Arrange
      oauth2ConfigService.getConfig.mockResolvedValue(null);

      // Act & Assert
      await expect(service.refreshGoogleToken('connection-123')).rejects.toThrow(
        'Google Sheets OAuth2 configuration not found',
      );
    });

    it('should handle refresh errors', async () => {
      // Arrange
      oauth2ConfigService.getConfig.mockResolvedValue(mockGoogleConfig);
      oauth2Service.refreshAccessToken.mockRejectedValue(new Error('Refresh failed'));

      // Act & Assert
      await expect(service.refreshGoogleToken('connection-123')).rejects.toThrow(
        'Refresh failed',
      );
    });
  });
});