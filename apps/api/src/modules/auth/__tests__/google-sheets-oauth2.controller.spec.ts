import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { GoogleSheetsOAuth2Controller } from '../controllers/google-sheets-oauth2.controller';
import { GoogleSheetsOAuth2Service } from '../services/google-sheets-oauth2.service';
import { PrismaService } from '../../../common/database/prisma.service';
import { AuthorizationService } from '../../../common/services/authorization.service';
import { UserRole, PlatformType, ConnectionStatus } from '@prisma/client';

describe('GoogleSheetsOAuth2Controller', () => {
  let controller: GoogleSheetsOAuth2Controller;
  let googleSheetsService: any;
  let prismaService: any;

  const mockUser = {
    id: 'user-123',
    organizationId: 'org-456',
    email: 'test@example.com',
    role: UserRole.ADMIN,
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
    scopes: [
      'https://www.googleapis.com/auth/spreadsheets',
      'https://www.googleapis.com/auth/drive.readonly',
    ],
    userId: mockUser.id,
    organizationId: mockUser.organizationId,
    platformData: {
      google_user_id: mockGoogleUserInfo.id,
      google_email: mockGoogleUserInfo.email,
      google_name: mockGoogleUserInfo.name,
      api_version: 'v4',
    },
    lastSyncAt: new Date(),
    syncCount: 5,
    createdAt: new Date(),
    updatedAt: new Date(),
    user: {
      id: mockUser.id,
      firstName: 'Test',
      lastName: 'User',
      email: mockUser.email,
    },
  };

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

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [GoogleSheetsOAuth2Controller],
      providers: [
        {
          provide: GoogleSheetsOAuth2Service,
          useValue: {
            initiateGoogleAuthorization: jest.fn(),
            completeGoogleAuthorization: jest.fn(),
            testGoogleSheetsConnection: jest.fn(),
            createSpreadsheet: jest.fn(),
            getSpreadsheet: jest.fn(),
            getSpreadsheetValues: jest.fn(),
            updateSpreadsheetValues: jest.fn(),
            appendSpreadsheetValues: jest.fn(),
            batchUpdateSpreadsheet: jest.fn(),
            oauth2Service: {
              getAccessToken: jest.fn(),
            },
          },
        },
        {
          provide: PrismaService,
          useValue: {
            platformConnection: {
              findFirst: jest.fn(),
              findUnique: jest.fn(),
              findMany: jest.fn(),
              count: jest.fn(),
            },
          },
        },
        {
          provide: AuthorizationService,
          useValue: {
            checkUserPermissions: jest.fn().mockResolvedValue(true),
            checkResourcePermission: jest.fn().mockResolvedValue(true),
            getUserPermissions: jest.fn().mockResolvedValue([]),
          },
        },
        {
          provide: Reflector,
          useValue: {
            getAllAndOverride: jest.fn().mockReturnValue([]),
          },
        },
      ],
    }).compile();

    controller = module.get<GoogleSheetsOAuth2Controller>(GoogleSheetsOAuth2Controller);
    googleSheetsService = module.get(GoogleSheetsOAuth2Service);
    prismaService = module.get(PrismaService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('initiateGoogleAuthorization', () => {
    it('should initiate Google authorization successfully', async () => {
      // Arrange
      const dto = { platformName: 'My Google Sheets' };
      const expectedResult = {
        authorizationUrl: 'https://accounts.google.com/o/oauth2/v2/auth?...',
        state: 'random-state',
      };
      googleSheetsService.initiateGoogleAuthorization.mockResolvedValue(expectedResult);

      // Act
      const result = await controller.initiateGoogleAuthorization(dto, mockUser);

      // Assert
      expect(result).toEqual(expectedResult);
      expect(googleSheetsService.initiateGoogleAuthorization).toHaveBeenCalledWith(
        mockUser.id,
        mockUser.organizationId,
      );
    });

    it('should handle service errors', async () => {
      // Arrange
      const dto = { platformName: 'My Google Sheets' };
      googleSheetsService.initiateGoogleAuthorization.mockRejectedValue(
        new BadRequestException('Google Sheets OAuth2 not configured'),
      );

      // Act & Assert
      await expect(
        controller.initiateGoogleAuthorization(dto, mockUser),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('completeGoogleAuthorization', () => {
    it('should complete Google authorization successfully', async () => {
      // Arrange
      const dto = {
        code: 'auth-code-123',
        state: 'state-456',
      };
      googleSheetsService.completeGoogleAuthorization.mockResolvedValue({
        connectionId: 'connection-123',
        userInfo: mockGoogleUserInfo,
      });
      prismaService.platformConnection.findUnique.mockResolvedValue(mockConnection);

      // Act
      const result = await controller.completeGoogleAuthorization(dto, mockUser);

      // Assert
      expect(result).toEqual({
        id: mockConnection.id,
        platformType: mockConnection.platformType,
        platformName: mockConnection.platformName,
        status: mockConnection.status,
        scopes: mockConnection.scopes,
        tokenExpiresAt: mockConnection.tokenExpiresAt,
        lastSyncAt: mockConnection.lastSyncAt,
        syncCount: mockConnection.syncCount,
        platformData: mockConnection.platformData,
        createdAt: mockConnection.createdAt,
        updatedAt: mockConnection.updatedAt,
      });
      expect(googleSheetsService.completeGoogleAuthorization).toHaveBeenCalledWith(
        dto.code,
        dto.state,
        mockUser.id,
        mockUser.organizationId,
      );
      expect(prismaService.platformConnection.findUnique).toHaveBeenCalledWith({
        where: { id: 'connection-123' },
      });
    });

    it('should handle OAuth2 errors', async () => {
      // Arrange
      const dto = {
        code: 'auth-code-123',
        state: 'state-456',
        error: 'access_denied',
        error_description: 'User denied access',
      };

      // Act & Assert
      await expect(
        controller.completeGoogleAuthorization(dto, mockUser),
      ).rejects.toThrow(BadRequestException);
    });

    it('should handle service errors', async () => {
      // Arrange
      const dto = {
        code: 'auth-code-123',
        state: 'state-456',
      };
      googleSheetsService.completeGoogleAuthorization.mockRejectedValue(
        new Error('Authorization failed'),
      );

      // Act & Assert
      await expect(
        controller.completeGoogleAuthorization(dto, mockUser),
      ).rejects.toThrow('Authorization failed');
    });
  });

  describe('listGoogleConnections', () => {
    it('should list Google connections successfully', async () => {
      // Arrange
      const connections = [mockConnection];
      prismaService.platformConnection.findMany.mockResolvedValue(connections);
      prismaService.platformConnection.count.mockResolvedValue(1);

      // Act
      const result = await controller.listGoogleConnections(
        undefined,
        1,
        10,
        mockUser,
      );

      // Assert
      expect(result).toEqual({
        connections: [
          {
            id: mockConnection.id,
            platformType: mockConnection.platformType,
            platformName: mockConnection.platformName,
            status: mockConnection.status,
            scopes: mockConnection.scopes,
            tokenExpiresAt: mockConnection.tokenExpiresAt,
            lastSyncAt: mockConnection.lastSyncAt,
            syncCount: mockConnection.syncCount,
            platformData: mockConnection.platformData,
            createdAt: mockConnection.createdAt,
            updatedAt: mockConnection.updatedAt,
          },
        ],
        total: 1,
        page: 1,
        limit: 10,
        totalPages: 1,
      });
      expect(prismaService.platformConnection.findMany).toHaveBeenCalledWith({
        where: {
          organizationId: mockUser.organizationId,
          platformType: PlatformType.GOOGLE_SHEETS,
        },
        skip: 0,
        take: 10,
        orderBy: { createdAt: 'desc' },
        include: {
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
            },
          },
        },
      });
    });

    it('should filter by status', async () => {
      // Arrange
      prismaService.platformConnection.findMany.mockResolvedValue([]);
      prismaService.platformConnection.count.mockResolvedValue(0);

      // Act
      await controller.listGoogleConnections(
        ConnectionStatus.ACTIVE,
        1,
        10,
        mockUser,
      );

      // Assert
      expect(prismaService.platformConnection.findMany).toHaveBeenCalledWith({
        where: {
          organizationId: mockUser.organizationId,
          platformType: PlatformType.GOOGLE_SHEETS,
          status: ConnectionStatus.ACTIVE,
        },
        skip: 0,
        take: 10,
        orderBy: { createdAt: 'desc' },
        include: {
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
            },
          },
        },
      });
    });

    it('should restrict access for non-admin users', async () => {
      // Arrange
      const nonAdminUser = { ...mockUser, role: UserRole.CLIENT_USER };
      prismaService.platformConnection.findMany.mockResolvedValue([]);
      prismaService.platformConnection.count.mockResolvedValue(0);

      // Act
      await controller.listGoogleConnections(
        undefined,
        1,
        10,
        nonAdminUser,
      );

      // Assert
      expect(prismaService.platformConnection.findMany).toHaveBeenCalledWith({
        where: {
          organizationId: nonAdminUser.organizationId,
          platformType: PlatformType.GOOGLE_SHEETS,
          userId: nonAdminUser.id,
        },
        skip: 0,
        take: 10,
        orderBy: { createdAt: 'desc' },
        include: {
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
            },
          },
        },
      });
    });

    it('should handle pagination correctly', async () => {
      // Arrange
      prismaService.platformConnection.findMany.mockResolvedValue([]);
      prismaService.platformConnection.count.mockResolvedValue(0);

      // Act
      await controller.listGoogleConnections(
        undefined,
        2,
        5,
        mockUser,
      );

      // Assert
      expect(prismaService.platformConnection.findMany).toHaveBeenCalledWith({
        where: {
          organizationId: mockUser.organizationId,
          platformType: PlatformType.GOOGLE_SHEETS,
        },
        skip: 5, // (page - 1) * limit = (2 - 1) * 5
        take: 5,
        orderBy: { createdAt: 'desc' },
        include: {
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
            },
          },
        },
      });
    });

    it('should limit maximum page size', async () => {
      // Arrange
      prismaService.platformConnection.findMany.mockResolvedValue([]);
      prismaService.platformConnection.count.mockResolvedValue(0);

      // Act
      const result = await controller.listGoogleConnections(
        undefined,
        1,
        100, // Exceeds maximum
        mockUser,
      );

      // Assert
      expect(result.limit).toBe(50); // Should be capped at 50
      expect(prismaService.platformConnection.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 50,
        }),
      );
    });
  });

  describe('getGoogleConnection', () => {
    it('should get Google connection successfully', async () => {
      // Arrange
      prismaService.platformConnection.findFirst.mockResolvedValue(mockConnection);

      // Act
      const result = await controller.getGoogleConnection('connection-123', mockUser);

      // Assert
      expect(result).toEqual({
        id: mockConnection.id,
        platformType: mockConnection.platformType,
        platformName: mockConnection.platformName,
        status: mockConnection.status,
        scopes: mockConnection.scopes,
        tokenExpiresAt: mockConnection.tokenExpiresAt,
        lastSyncAt: mockConnection.lastSyncAt,
        syncCount: mockConnection.syncCount,
        platformData: mockConnection.platformData,
        createdAt: mockConnection.createdAt,
        updatedAt: mockConnection.updatedAt,
      });
      expect(prismaService.platformConnection.findFirst).toHaveBeenCalledWith({
        where: {
          id: 'connection-123',
          organizationId: mockUser.organizationId,
          platformType: PlatformType.GOOGLE_SHEETS,
        },
        include: {
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
            },
          },
        },
      });
    });

    it('should throw NotFoundException if connection not found', async () => {
      // Arrange
      prismaService.platformConnection.findFirst.mockResolvedValue(null);

      // Act & Assert
      await expect(
        controller.getGoogleConnection('connection-123', mockUser),
      ).rejects.toThrow(NotFoundException);
    });

    it('should restrict access for non-admin users', async () => {
      // Arrange
      const nonAdminUser = { ...mockUser, role: UserRole.CLIENT_USER };
      prismaService.platformConnection.findFirst.mockResolvedValue(mockConnection);

      // Act
      await controller.getGoogleConnection('connection-123', nonAdminUser);

      // Assert
      expect(prismaService.platformConnection.findFirst).toHaveBeenCalledWith({
        where: {
          id: 'connection-123',
          organizationId: nonAdminUser.organizationId,
          platformType: PlatformType.GOOGLE_SHEETS,
          userId: nonAdminUser.id,
        },
        include: {
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
            },
          },
        },
      });
    });
  });

  describe('testGoogleConnection', () => {
    it('should test Google connection successfully', async () => {
      // Arrange
      const testResult = {
        success: true,
        details: {
          platform: 'Google Sheets',
          apiVersion: 'v4',
          user: mockGoogleUserInfo,
          features: ['read_spreadsheets', 'write_spreadsheets'],
        },
      };
      prismaService.platformConnection.findFirst.mockResolvedValue(mockConnection);
      googleSheetsService.testGoogleSheetsConnection.mockResolvedValue(testResult);

      // Act
      const result = await controller.testGoogleConnection('connection-123', mockUser);

      // Assert
      expect(result).toEqual({
        success: true,
        details: testResult.details,
        testedAt: expect.any(Date),
      });
      expect(googleSheetsService.testGoogleSheetsConnection).toHaveBeenCalledWith('connection-123');
    });

    it('should handle connection not found', async () => {
      // Arrange
      prismaService.platformConnection.findFirst.mockResolvedValue(null);

      // Act
      const result = await controller.testGoogleConnection('connection-123', mockUser);

      // Assert
      expect(result).toEqual({
        success: false,
        error: 'Google Sheets connection not found',
        testedAt: expect.any(Date),
      });
    });

    it('should handle test failures', async () => {
      // Arrange
      prismaService.platformConnection.findFirst.mockResolvedValue(mockConnection);
      googleSheetsService.testGoogleSheetsConnection.mockResolvedValue({
        success: false,
        error: 'Token expired',
      });

      // Act
      const result = await controller.testGoogleConnection('connection-123', mockUser);

      // Assert
      expect(result).toEqual({
        success: false,
        error: 'Token expired',
        testedAt: expect.any(Date),
      });
    });

    it('should handle service errors', async () => {
      // Arrange
      prismaService.platformConnection.findFirst.mockResolvedValue(mockConnection);
      googleSheetsService.testGoogleSheetsConnection.mockRejectedValue(
        new Error('Service error'),
      );

      // Act
      const result = await controller.testGoogleConnection('connection-123', mockUser);

      // Assert
      expect(result).toEqual({
        success: false,
        error: 'Service error',
        testedAt: expect.any(Date),
      });
    });
  });

  describe('createSpreadsheet', () => {
    it('should create spreadsheet successfully', async () => {
      // Arrange
      const dto = {
        title: 'Test Spreadsheet',
        sheets: [
          { title: 'Orders', rowCount: 500, columnCount: 10 },
        ],
      };
      prismaService.platformConnection.findFirst.mockResolvedValue(mockConnection);
      googleSheetsService['oauth2Service'].getAccessToken.mockResolvedValue('access-token');
      googleSheetsService.createSpreadsheet.mockResolvedValue(mockSpreadsheet);

      // Act
      const result = await controller.createSpreadsheet('connection-123', dto, mockUser);

      // Assert
      expect(result).toEqual(mockSpreadsheet);
      expect(prismaService.platformConnection.findFirst).toHaveBeenCalledWith({
        where: {
          id: 'connection-123',
          organizationId: mockUser.organizationId,
          platformType: PlatformType.GOOGLE_SHEETS,
          status: ConnectionStatus.ACTIVE,
        },
      });
      expect(googleSheetsService.createSpreadsheet).toHaveBeenCalledWith(
        'access-token',
        dto.title,
        dto.sheets,
      );
    });

    it('should handle connection not found', async () => {
      // Arrange
      const dto = { title: 'Test Spreadsheet' };
      prismaService.platformConnection.findFirst.mockResolvedValue(null);

      // Act & Assert
      await expect(
        controller.createSpreadsheet('connection-123', dto, mockUser),
      ).rejects.toThrow(NotFoundException);
    });

    it('should restrict access for non-admin users', async () => {
      // Arrange
      const dto = { title: 'Test Spreadsheet' };
      const nonAdminUser = { ...mockUser, role: UserRole.CLIENT_USER };
      prismaService.platformConnection.findFirst.mockResolvedValue(mockConnection);
      googleSheetsService['oauth2Service'].getAccessToken.mockResolvedValue('access-token');
      googleSheetsService.createSpreadsheet.mockResolvedValue(mockSpreadsheet);

      // Act
      await controller.createSpreadsheet('connection-123', dto, nonAdminUser);

      // Assert
      expect(prismaService.platformConnection.findFirst).toHaveBeenCalledWith({
        where: {
          id: 'connection-123',
          organizationId: nonAdminUser.organizationId,
          platformType: PlatformType.GOOGLE_SHEETS,
          status: ConnectionStatus.ACTIVE,
          userId: nonAdminUser.id,
        },
      });
    });
  });

  describe('getSpreadsheetValues', () => {
    it('should get spreadsheet values successfully', async () => {
      // Arrange
      const query = { range: 'Sheet1!A1:C3' };
      const mockValues = [
        ['Name', 'Email', 'Phone'],
        ['John Doe', 'john@example.com', '123-456-7890'],
      ];
      prismaService.platformConnection.findFirst.mockResolvedValue(mockConnection);
      googleSheetsService['oauth2Service'].getAccessToken.mockResolvedValue('access-token');
      googleSheetsService.getSpreadsheetValues.mockResolvedValue(mockValues);

      // Act
      const result = await controller.getSpreadsheetValues(
        'connection-123',
        'spreadsheet-123',
        query,
        mockUser,
      );

      // Assert
      expect(result).toEqual({ values: mockValues });
      expect(googleSheetsService.getSpreadsheetValues).toHaveBeenCalledWith(
        'access-token',
        'spreadsheet-123',
        query.range,
        undefined,
      );
    });

    it('should handle connection not found', async () => {
      // Arrange
      const query = { range: 'Sheet1!A1:C3' };
      prismaService.platformConnection.findFirst.mockResolvedValue(null);

      // Act & Assert
      await expect(
        controller.getSpreadsheetValues(
          'connection-123',
          'spreadsheet-123',
          query,
          mockUser,
        ),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('updateSpreadsheetValues', () => {
    it('should update spreadsheet values successfully', async () => {
      // Arrange
      const dto = {
        range: 'Sheet1!A1:B2',
        values: [
          ['Updated Name', 'Updated Email'],
          ['John Updated', 'john.updated@example.com'],
        ],
      };
      const mockResponse = {
        updatedRows: 2,
        updatedColumns: 2,
        updatedCells: 4,
      };
      prismaService.platformConnection.findFirst.mockResolvedValue(mockConnection);
      googleSheetsService['oauth2Service'].getAccessToken.mockResolvedValue('access-token');
      googleSheetsService.updateSpreadsheetValues.mockResolvedValue(mockResponse);

      // Act
      const result = await controller.updateSpreadsheetValues(
        'connection-123',
        'spreadsheet-123',
        dto,
        mockUser,
      );

      // Assert
      expect(result).toEqual(mockResponse);
      expect(googleSheetsService.updateSpreadsheetValues).toHaveBeenCalledWith(
        'access-token',
        'spreadsheet-123',
        dto.range,
        dto.values,
        undefined,
      );
    });

    it('should handle connection not found', async () => {
      // Arrange
      const dto = {
        range: 'Sheet1!A1:B2',
        values: [['test', 'data']],
      };
      prismaService.platformConnection.findFirst.mockResolvedValue(null);

      // Act & Assert
      await expect(
        controller.updateSpreadsheetValues(
          'connection-123',
          'spreadsheet-123',
          dto,
          mockUser,
        ),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('appendSpreadsheetValues', () => {
    it('should append spreadsheet values successfully', async () => {
      // Arrange
      const dto = {
        range: 'Sheet1!A:B',
        values: [
          ['New Name', 'New Email'],
          ['Jane New', 'jane.new@example.com'],
        ],
      };
      const mockResponse = {
        updates: {
          updatedRows: 2,
          updatedColumns: 2,
          updatedCells: 4,
        },
      };
      prismaService.platformConnection.findFirst.mockResolvedValue(mockConnection);
      googleSheetsService['oauth2Service'].getAccessToken.mockResolvedValue('access-token');
      googleSheetsService.appendSpreadsheetValues.mockResolvedValue(mockResponse);

      // Act
      const result = await controller.appendSpreadsheetValues(
        'connection-123',
        'spreadsheet-123',
        dto,
        mockUser,
      );

      // Assert
      expect(result).toEqual(mockResponse);
      expect(googleSheetsService.appendSpreadsheetValues).toHaveBeenCalledWith(
        'access-token',
        'spreadsheet-123',
        dto.range,
        dto.values,
        undefined,
      );
    });

    it('should handle connection not found', async () => {
      // Arrange
      const dto = {
        range: 'Sheet1!A:B',
        values: [['test', 'data']],
      };
      prismaService.platformConnection.findFirst.mockResolvedValue(null);

      // Act & Assert
      await expect(
        controller.appendSpreadsheetValues(
          'connection-123',
          'spreadsheet-123',
          dto,
          mockUser,
        ),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('batchUpdateSpreadsheet', () => {
    it('should batch update spreadsheet successfully', async () => {
      // Arrange
      const dto = {
        requests: [
          {
            updateCells: {
              range: {
                sheetId: 0,
                startRowIndex: 0,
                endRowIndex: 1,
                startColumnIndex: 0,
                endColumnIndex: 2,
              },
              rows: [
                {
                  values: [
                    { userEnteredValue: { stringValue: 'Batch Name' } },
                    { userEnteredValue: { stringValue: 'Batch Email' } },
                  ],
                },
              ],
              fields: 'userEnteredValue',
            },
          },
        ],
      };
      const mockResponse = {
        replies: [{}],
        updatedSpreadsheet: mockSpreadsheet,
      };
      prismaService.platformConnection.findFirst.mockResolvedValue(mockConnection);
      googleSheetsService['oauth2Service'].getAccessToken.mockResolvedValue('access-token');
      googleSheetsService.batchUpdateSpreadsheet.mockResolvedValue(mockResponse);

      // Act
      const result = await controller.batchUpdateSpreadsheet(
        'connection-123',
        'spreadsheet-123',
        dto,
        mockUser,
      );

      // Assert
      expect(result).toEqual(mockResponse);
      expect(googleSheetsService.batchUpdateSpreadsheet).toHaveBeenCalledWith(
        'access-token',
        'spreadsheet-123',
        dto.requests,
      );
    });

    it('should handle connection not found', async () => {
      // Arrange
      const dto = { requests: [] };
      prismaService.platformConnection.findFirst.mockResolvedValue(null);

      // Act & Assert
      await expect(
        controller.batchUpdateSpreadsheet(
          'connection-123',
          'spreadsheet-123',
          dto,
          mockUser,
        ),
      ).rejects.toThrow(NotFoundException);
    });
  });
});