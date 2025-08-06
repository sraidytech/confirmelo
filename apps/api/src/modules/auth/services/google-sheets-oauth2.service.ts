import { Injectable, Logger, BadRequestException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../common/database/prisma.service';
import { OAuth2Service, OAuth2Config } from './oauth2.service';
import { OAuth2ConfigService } from './oauth2-config.service';
import { SpreadsheetConnectionService } from './spreadsheet-connection.service';
import axios, { AxiosInstance } from 'axios';
import { PlatformType, ConnectionStatus } from '@prisma/client';

export interface GoogleUserInfo {
  id: string;
  email: string;
  name: string;
  picture?: string;
  locale?: string;
  verified_email: boolean;
}

export interface GoogleSpreadsheet {
  spreadsheetId: string;
  id?: string; // Alias for spreadsheetId for compatibility
  properties: {
    title: string;
    locale: string;
    autoRecalc: string;
    timeZone: string;
  };
  sheets: Array<{
    properties: {
      sheetId: number;
      title: string;
      index: number;
      sheetType: string;
      gridProperties: {
        rowCount: number;
        columnCount: number;
      };
    };
  }>;
}

export interface GoogleSheetsApiResponse<T = any> {
  data: T;
  status: number;
  statusText: string;
}

@Injectable()
export class GoogleSheetsOAuth2Service {
  private readonly logger = new Logger(GoogleSheetsOAuth2Service.name);
  private readonly googleApiClient: AxiosInstance;
  private readonly sheetsApiClient: AxiosInstance;

  constructor(
    private readonly configService: ConfigService,
    private readonly prismaService: PrismaService,
    private readonly oauth2Service: OAuth2Service,
    private readonly oauth2ConfigService: OAuth2ConfigService,
    private readonly spreadsheetConnectionService: SpreadsheetConnectionService,
  ) {
    // Initialize Google API client for general APIs (OAuth, Drive, etc.)
    this.googleApiClient = axios.create({
      baseURL: 'https://www.googleapis.com',
      timeout: 30000,
      headers: {
        'User-Agent': 'Confirmelo-Google-Client/1.0',
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
    });

    // Initialize Google Sheets API client
    this.sheetsApiClient = axios.create({
      baseURL: 'https://sheets.googleapis.com',
      timeout: 30000,
      headers: {
        'User-Agent': 'Confirmelo-Google-Client/1.0',
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
    });

    this.setupGoogleApiInterceptors();
  }

  /**
   * Initiate Google Sheets OAuth2 authorization
   */
  async initiateGoogleAuthorization(
    userId: string,
    organizationId: string,
  ): Promise<{
    authorizationUrl: string;
    state: string;
  }> {
    try {
      this.logger.log('Initiating Google Sheets OAuth2 authorization', {
        userId,
        organizationId,
      });

      // Get Google OAuth2 configuration
      const config = await this.oauth2ConfigService.getConfig(PlatformType.GOOGLE_SHEETS);
      if (!config) {
        throw new BadRequestException('Google Sheets OAuth2 not configured');
      }

      // Multi-account support: Allow multiple Google account connections
      // No need to revoke existing connections - users can have multiple accounts

      // Generate authorization URL with PKCE
      const authRequest = await this.oauth2Service.generateAuthorizationUrl(
        PlatformType.GOOGLE_SHEETS,
        config,
        userId,
        organizationId,
      );

      this.logger.log('Generated Google authorization URL', {
        userId,
        organizationId,
        state: authRequest.state,
      });

      return {
        authorizationUrl: authRequest.authorizationUrl,
        state: authRequest.state,
      };
    } catch (error) {
      this.logger.error('Failed to initiate Google authorization', {
        error: error.message,
        userId,
        organizationId,
      });
      throw error;
    }
  }

  /**
   * Complete Google Sheets OAuth2 authorization
   */
  async completeGoogleAuthorization(
    code: string,
    state: string,
    userId: string,
    organizationId: string,
  ): Promise<{
    connectionId: string;
    userInfo: GoogleUserInfo;
  }> {
    try {
      this.logger.log('Completing Google Sheets OAuth2 authorization', {
        userId,
        organizationId,
        state,
      });

      // Get Google OAuth2 configuration
      const config = await this.oauth2ConfigService.getConfig(PlatformType.GOOGLE_SHEETS);

      // Exchange code for token
      const { tokenResponse, stateData } = await this.oauth2Service.exchangeCodeForToken(
        code,
        state,
        config,
      );

      // Verify state data matches current user
      if (stateData.userId !== userId || stateData.organizationId !== organizationId) {
        throw new UnauthorizedException('State validation failed - user mismatch');
      }

      // Get user information using the access token
      const userInfo = await this.getGoogleUserInfo(tokenResponse.access_token);

      // Store the connection with user information and account-specific naming
      const connectionId = await this.oauth2Service.storeConnection(
        userId,
        organizationId,
        PlatformType.GOOGLE_SHEETS,
        `Google Sheets - ${userInfo.email}`,
        tokenResponse,
        config.scopes,
        {
          google_user_id: userInfo.id,
          google_email: userInfo.email,
          google_name: userInfo.name,
          google_picture: userInfo.picture,
          google_locale: userInfo.locale,
          verified_email: userInfo.verified_email,
          api_version: 'v4',
          connected_at: new Date().toISOString(),
          account_label: `${userInfo.name} (${userInfo.email})`,
        },
      );

      this.logger.log('Completed Google Sheets OAuth2 authorization', {
        connectionId,
        userId,
        organizationId,
        googleUserId: userInfo.id,
        googleEmail: userInfo.email,
      });

      return {
        connectionId,
        userInfo,
      };
    } catch (error) {
      this.logger.error('Failed to complete Google authorization', {
        error: error.message,
        userId,
        organizationId,
        state,
      });
      throw error;
    }
  }

  /**
   * Test Google Sheets connection
   */
  async testGoogleSheetsConnection(connectionId: string): Promise<{
    success: boolean;
    error?: string;
    details?: any;
  }> {
    try {
      this.logger.log('Testing Google Sheets connection', { connectionId });

      // Get connection details
      const connection = await this.prismaService.platformConnection.findUnique({
        where: { id: connectionId },
      });

      if (!connection || connection.platformType !== PlatformType.GOOGLE_SHEETS) {
        throw new Error('Google Sheets connection not found');
      }

      if (connection.status !== ConnectionStatus.ACTIVE) {
        throw new Error(`Connection is not active (status: ${connection.status})`);
      }

      // Get access token (this will handle refresh if needed)
      const accessToken = await this.oauth2Service.getAccessToken(connectionId);

      // Test API calls
      const [userInfo, driveInfo] = await Promise.all([
        this.getGoogleUserInfo(accessToken),
        this.testGoogleDriveAccess(accessToken),
      ]);

      // Update last sync time
      await this.prismaService.platformConnection.update({
        where: { id: connectionId },
        data: {
          lastSyncAt: new Date(),
          syncCount: { increment: 1 },
        },
      });

      this.logger.log('Google Sheets connection test successful', {
        connectionId,
        googleUserId: userInfo.id,
        googleEmail: userInfo.email,
      });

      return {
        success: true,
        details: {
          platform: 'Google Sheets',
          apiVersion: 'v4',
          responseTime: Date.now(),
          user: {
            id: userInfo.id,
            email: userInfo.email,
            name: userInfo.name,
            verified: userInfo.verified_email,
          },
          drive: driveInfo,
          features: [
            'read_spreadsheets',
            'write_spreadsheets',
            'create_spreadsheets',
            'read_drive_files',
          ],
          lastTested: new Date().toISOString(),
        },
      };
    } catch (error) {
      this.logger.error('Google Sheets connection test failed', {
        error: error.message,
        connectionId,
      });

      // Update connection with error information
      await this.prismaService.platformConnection.update({
        where: { id: connectionId },
        data: {
          lastErrorAt: new Date(),
          lastErrorMessage: error.message,
          ...(error.message.includes('token') && {
            status: ConnectionStatus.EXPIRED,
          }),
        },
      });

      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Get Google user information
   */
  async getGoogleUserInfo(accessToken: string): Promise<GoogleUserInfo> {
    try {
      const response = await this.googleApiClient.get('/oauth2/v2/userinfo', {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      const userData = response.data;
      return {
        id: userData.id,
        email: userData.email,
        name: userData.name,
        picture: userData.picture,
        locale: userData.locale,
        verified_email: userData.verified_email || false,
      };
    } catch (error) {
      this.logger.error('Failed to get Google user info', {
        error: error.message,
        status: error.response?.status,
        data: error.response?.data,
      });
      throw new Error(`Failed to get user information: ${error.message}`);
    }
  }

  /**
   * Test Google Drive access
   */
  async testGoogleDriveAccess(accessToken: string): Promise<any> {
    try {
      const response = await this.googleApiClient.get('/drive/v3/about', {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
        params: {
          fields: 'user,storageQuota',
        },
      });

      return {
        user: response.data.user,
        storageQuota: response.data.storageQuota,
        accessible: true,
      };
    } catch (error) {
      this.logger.error('Failed to test Google Drive access', {
        error: error.message,
        status: error.response?.status,
      });
      return {
        accessible: false,
        error: error.message,
      };
    }
  }

  /**
   * Create a new Google Spreadsheet
   */
  async createSpreadsheet(
    accessToken: string,
    title: string,
    sheets?: Array<{ title: string; rowCount?: number; columnCount?: number }>,
  ): Promise<GoogleSpreadsheet> {
    try {
      const requestBody: any = {
        properties: {
          title,
          locale: 'en_US',
          autoRecalc: 'ON_CHANGE',
          timeZone: 'UTC',
        },
      };

      // Add custom sheets if provided
      if (sheets && sheets.length > 0) {
        requestBody.sheets = sheets.map((sheet, index) => ({
          properties: {
            title: sheet.title,
            index,
            sheetType: 'GRID',
            gridProperties: {
              rowCount: sheet.rowCount || 1000,
              columnCount: sheet.columnCount || 26,
            },
          },
        }));
      }

      const response = await this.sheetsApiClient.post('/v4/spreadsheets', requestBody, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      this.logger.log('Created Google Spreadsheet', {
        spreadsheetId: response.data.spreadsheetId,
        title,
        sheetsCount: response.data.sheets?.length || 0,
      });

      return response.data;
    } catch (error) {
      this.logger.error('Failed to create Google Spreadsheet', {
        error: error.message,
        title,
        status: error.response?.status,
        data: error.response?.data,
      });
      throw new Error(`Failed to create spreadsheet: ${error.message}`);
    }
  }

  /**
   * Get spreadsheet information
   */
  async getSpreadsheet(
    accessToken: string,
    spreadsheetId: string,
    includeGridData: boolean = false,
  ): Promise<GoogleSpreadsheet> {
    try {
      const params: any = {};
      if (includeGridData) {
        params.includeGridData = true;
      }

      const response = await this.sheetsApiClient.get(`/v4/spreadsheets/${spreadsheetId}`, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
        params,
      });

      return response.data;
    } catch (error) {
      this.logger.error('Failed to get Google Spreadsheet', {
        error: error.message,
        spreadsheetId,
        status: error.response?.status,
        data: error.response?.data,
      });
      throw new Error(`Failed to get spreadsheet: ${error.message}`);
    }
  }

  /**
   * Read values from a spreadsheet range
   */
  async getSpreadsheetValues(
    accessToken: string,
    spreadsheetId: string,
    range: string,
    valueRenderOption: 'FORMATTED_VALUE' | 'UNFORMATTED_VALUE' | 'FORMULA' = 'FORMATTED_VALUE',
  ): Promise<any[][]> {
    try {
      const response = await this.sheetsApiClient.get(
        `/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
          params: {
            valueRenderOption,
          },
        },
      );

      return response.data.values || [];
    } catch (error) {
      this.logger.error('Failed to get spreadsheet values', {
        error: error.message,
        spreadsheetId,
        range,
        status: error.response?.status,
        data: error.response?.data,
      });
      throw new Error(`Failed to get spreadsheet values: ${error.message}`);
    }
  }

  /**
   * Write values to a spreadsheet range
   */
  async updateSpreadsheetValues(
    accessToken: string,
    spreadsheetId: string,
    range: string,
    values: any[][],
    valueInputOption: 'RAW' | 'USER_ENTERED' = 'USER_ENTERED',
  ): Promise<any> {
    try {
      const response = await this.sheetsApiClient.put(
        `/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}`,
        {
          values,
          majorDimension: 'ROWS',
        },
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
          params: {
            valueInputOption,
          },
        },
      );

      this.logger.log('Updated spreadsheet values', {
        spreadsheetId,
        range,
        rowsUpdated: response.data.updatedRows,
        cellsUpdated: response.data.updatedCells,
      });

      return response.data;
    } catch (error) {
      this.logger.error('Failed to update spreadsheet values', {
        error: error.message,
        spreadsheetId,
        range,
        status: error.response?.status,
        data: error.response?.data,
      });
      throw new Error(`Failed to update spreadsheet values: ${error.message}`);
    }
  }

  /**
   * Append values to a spreadsheet
   */
  async appendSpreadsheetValues(
    accessToken: string,
    spreadsheetId: string,
    range: string,
    values: any[][],
    valueInputOption: 'RAW' | 'USER_ENTERED' = 'USER_ENTERED',
  ): Promise<any> {
    try {
      const response = await this.sheetsApiClient.post(
        `/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}:append`,
        {
          values,
          majorDimension: 'ROWS',
        },
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
          params: {
            valueInputOption,
            insertDataOption: 'INSERT_ROWS',
          },
        },
      );

      this.logger.log('Appended values to spreadsheet', {
        spreadsheetId,
        range,
        rowsAdded: response.data.updates?.updatedRows,
        cellsAdded: response.data.updates?.updatedCells,
      });

      return response.data;
    } catch (error) {
      this.logger.error('Failed to append spreadsheet values', {
        error: error.message,
        spreadsheetId,
        range,
        status: error.response?.status,
        data: error.response?.data,
      });
      throw new Error(`Failed to append spreadsheet values: ${error.message}`);
    }
  }

  /**
   * Batch update spreadsheet (multiple operations)
   */
  async batchUpdateSpreadsheet(
    accessToken: string,
    spreadsheetId: string,
    requests: any[],
  ): Promise<any> {
    try {
      const response = await this.sheetsApiClient.post(
        `/v4/spreadsheets/${spreadsheetId}:batchUpdate`,
        {
          requests,
        },
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        },
      );

      this.logger.log('Batch updated spreadsheet', {
        spreadsheetId,
        requestsCount: requests.length,
        repliesCount: response.data.replies?.length || 0,
      });

      return response.data;
    } catch (error) {
      this.logger.error('Failed to batch update spreadsheet', {
        error: error.message,
        spreadsheetId,
        requestsCount: requests.length,
        status: error.response?.status,
        data: error.response?.data,
      });
      throw new Error(`Failed to batch update spreadsheet: ${error.message}`);
    }
  }

  /**
   * List available spreadsheets for a connection
   */
  async listSpreadsheets(
    connectionId: string,
    pageSize: number = 20,
    pageToken?: string,
  ): Promise<{
    spreadsheets: Array<{
      id: string;
      name: string;
      createdTime: string;
      modifiedTime: string;
      webViewLink: string;
    }>;
    nextPageToken?: string;
    scopeInfo: {
      scope: string;
      limitation: string;
    };
  }> {
    try {
      this.logger.log('Starting to list spreadsheets with drive.file scope', {
        connectionId,
        pageSize,
        pageToken,
      });

      const accessToken = await this.oauth2Service.getAccessToken(connectionId);

      const params = new URLSearchParams({
        q: "mimeType='application/vnd.google-apps.spreadsheet' and trashed=false",
        pageSize: pageSize.toString(),
        fields: 'nextPageToken,files(id,name,createdTime,modifiedTime,webViewLink,parents)',
        orderBy: 'modifiedTime desc',
      });

      if (pageToken) {
        params.append('pageToken', pageToken);
      }

      const response = await this.googleApiClient.get(`/drive/v3/files?${params.toString()}`, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      const files = response.data.files || [];
      const spreadsheets = files.map((file: any) => ({
        id: file.id,
        name: file.name,
        createdTime: file.createdTime,
        modifiedTime: file.modifiedTime,
        webViewLink: file.webViewLink,
      }));

      return {
        spreadsheets,
        nextPageToken: response.data.nextPageToken,
        scopeInfo: {
          scope: 'drive.file',
          limitation: 'Only shows spreadsheets created by this app or explicitly opened by the user',
        },
      };
    } catch (error) {
      this.logger.error('Failed to list spreadsheets', {
        error: error.message,
        connectionId,
        status: error.response?.status,
      });

      if (error.response?.status === 403) {
        const errorMessage = error.response?.data?.error?.message || error.message;
        if (errorMessage.includes('insufficient') || errorMessage.includes('scope')) {
          throw new Error(`Insufficient permissions to list spreadsheets. Error: ${errorMessage}`);
        }
        throw new Error(`Access denied when listing spreadsheets: ${errorMessage}`);
      } else if (error.response?.status === 401) {
        throw new Error(`Authentication failed when listing spreadsheets: ${error.message}`);
      }

      throw new Error(`Failed to list spreadsheets: ${error.message}`);
    }
  }

  /**
   * Add an existing spreadsheet to the accessible list
   */
  async addExistingSpreadsheet(
    connectionId: string,
    spreadsheetId: string,
  ): Promise<{
    success: boolean;
    spreadsheet?: any;
    error?: string;
  }> {
    try {
      this.logger.log('Adding existing spreadsheet to accessible list', {
        connectionId,
        spreadsheetId,
      });

      const accessToken = await this.oauth2Service.getAccessToken(connectionId);

      try {
        const spreadsheet = await this.getSpreadsheet(accessToken, spreadsheetId);

        return {
          success: true,
          spreadsheet: {
            id: spreadsheetId,
            name: spreadsheet.properties.title,
            sheets: spreadsheet.sheets.map(sheet => ({
              id: sheet.properties.sheetId,
              name: sheet.properties.title,
              index: sheet.properties.index,
            })),
          },
        };
      } catch (accessError) {
        if (accessError.message.includes('403') || accessError.message.includes('404')) {
          return {
            success: false,
            error: `Cannot access spreadsheet. Please ensure the spreadsheet is shared with your Google account.`,
          };
        }
        throw accessError;
      }
    } catch (error) {
      this.logger.error('Failed to add existing spreadsheet', {
        error: error.message,
        connectionId,
        spreadsheetId,
      });

      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Extract spreadsheet ID from various Google Sheets URL formats
   */
  extractSpreadsheetId(urlOrId: string): string | null {
    // If it's already just an ID (no slashes or special characters)
    if (!/[\/\?\#]/.test(urlOrId) && urlOrId.length > 20) {
      return urlOrId;
    }

    // Extract from various Google Sheets URL formats
    const patterns = [
      /\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/,
      /\/spreadsheets\/u\/\d+\/d\/([a-zA-Z0-9-_]+)/,
      /id=([a-zA-Z0-9-_]+)/,
    ];

    for (const pattern of patterns) {
      const match = urlOrId.match(pattern);
      if (match) {
        return match[1];
      }
    }

    return null;
  }

  /**
   * Create a new Orders spreadsheet with predefined template
   */
  async createOrdersSpreadsheet(
    connectionId: string,
    name: string,
  ): Promise<{
    success: boolean;
    spreadsheet?: {
      id: string;
      name: string;
      webViewLink: string;
      sheets: Array<{
        id: number;
        name: string;
        index: number;
      }>;
    };
    error?: string;
  }> {
    try {
      this.logger.log('Creating Orders spreadsheet', {
        connectionId,
        name,
      });

      const accessToken = await this.oauth2Service.getAccessToken(connectionId);

      // Create spreadsheet
      const spreadsheet = await this.createSpreadsheet(
        accessToken,
        name,
        [
          {
            title: 'Orders',
            rowCount: 1000,
            columnCount: 12,
          },
        ],
      );

      // Set up the Orders sheet with headers and formatting
      try {
        await this.setupOrdersSheet(accessToken, spreadsheet.spreadsheetId);
      } catch (formatError) {
        this.logger.warn('Failed to format Orders sheet, but spreadsheet was created successfully', {
          spreadsheetId: spreadsheet.spreadsheetId,
          formatError: formatError.message,
        });
      }

      const result = {
        id: spreadsheet.spreadsheetId,
        name: spreadsheet.properties.title,
        webViewLink: `https://docs.google.com/spreadsheets/d/${spreadsheet.spreadsheetId}`,
        sheets: spreadsheet.sheets.map(sheet => ({
          id: sheet.properties.sheetId,
          name: sheet.properties.title,
          index: sheet.properties.index,
        })),
      };

      return {
        success: true,
        spreadsheet: result,
      };
    } catch (error) {
      this.logger.error('Failed to create Orders spreadsheet', {
        error: error.message,
        connectionId,
        name,
      });

      if (error.message.includes('403')) {
        return {
          success: false,
          error: 'Permission denied. Please reconnect your Google account.',
        };
      }

      if (error.message.includes('quota')) {
        return {
          success: false,
          error: 'Google API quota exceeded. Please try again later.',
        };
      }

      return {
        success: false,
        error: 'Failed to create spreadsheet. Please try again.',
      };
    }
  }

  /**
   * Set up Orders sheet with headers and formatting
   */
  private async setupOrdersSheet(accessToken: string, spreadsheetId: string): Promise<void> {
    const headers = [
      'Order ID',
      'Date',
      'Name',
      'Phone',
      'Address',
      'City',
      'Product',
      'Product SKU',
      'Product Qty',
      'Product Variant',
      'Price',
      'Page URL',
    ];

    // Get the spreadsheet to find the correct sheet ID
    const spreadsheet = await this.getSpreadsheet(accessToken, spreadsheetId);
    const ordersSheet = spreadsheet.sheets.find(sheet => sheet.properties.title === 'Orders');

    if (!ordersSheet) {
      throw new Error('Orders sheet not found in created spreadsheet');
    }

    const sheetId = ordersSheet.properties.sheetId;

    // Add headers to the first row
    await this.updateSpreadsheetValues(
      accessToken,
      spreadsheetId,
      'Orders!A1:L1',
      [headers],
      'USER_ENTERED',
    );

    // Format the header row
    const formatRequests = [
      {
        repeatCell: {
          range: {
            sheetId: sheetId,
            startRowIndex: 0,
            endRowIndex: 1,
            startColumnIndex: 0,
            endColumnIndex: 12,
          },
          cell: {
            userEnteredFormat: {
              backgroundColor: {
                red: 0.26,
                green: 0.52,
                blue: 0.96,
              },
              textFormat: {
                foregroundColor: {
                  red: 1.0,
                  green: 1.0,
                  blue: 1.0,
                },
                bold: true,
              },
            },
          },
          fields: 'userEnteredFormat(backgroundColor,textFormat)',
        },
      },
    ];

    // Apply formatting
    await this.batchUpdateSpreadsheet(accessToken, spreadsheetId, formatRequests);
  }

  /**
   * Connect to a specific spreadsheet
   */
  async connectToSpreadsheet(
    connectionId: string,
    spreadsheetId: string,
  ): Promise<{
    spreadsheet: GoogleSpreadsheet;
    connection: any;
  }> {
    try {
      this.logger.log('Connecting to spreadsheet using new SpreadsheetConnectionService', {
        connectionId,
        spreadsheetId,
      });

      // Get access token for the connection
      const accessToken = await this.oauth2Service.getAccessToken(connectionId);

      // Get the spreadsheet details from Google API
      const spreadsheet = await this.getSpreadsheet(accessToken, spreadsheetId);

      // Transform sheets data for the SpreadsheetConnectionService
      const sheetsData = spreadsheet.sheets.map(sheet => ({
        id: sheet.properties.sheetId,
        name: sheet.properties.title,
        index: sheet.properties.index,
        rowCount: sheet.properties.gridProperties.rowCount,
        columnCount: sheet.properties.gridProperties.columnCount,
      }));

      // Use SpreadsheetConnectionService to create the connection
      const spreadsheetConnection = await this.spreadsheetConnectionService.connectSpreadsheet({
        connectionId,
        spreadsheetId,
        spreadsheetName: spreadsheet.properties.title,
        webViewLink: `https://docs.google.com/spreadsheets/d/${spreadsheetId}`,
        sheets: sheetsData,
        permissions: {
          canEdit: true,
          canShare: false,
          canComment: true,
          role: 'editor',
        },
      });

      // Get the updated platform connection
      const connection = await this.prismaService.platformConnection.findUnique({
        where: { id: connectionId },
      });

      this.logger.log('Successfully connected to spreadsheet', {
        connectionId,
        spreadsheetId,
        spreadsheetName: spreadsheet.properties.title,
        sheetsCount: spreadsheet.sheets.length,
        spreadsheetConnectionId: spreadsheetConnection.id,
      });

      return {
        spreadsheet,
        connection,
      };
    } catch (error) {
      this.logger.error('Failed to connect to spreadsheet', {
        error: error.message,
        connectionId,
        spreadsheetId,
      });

      if (error.message.includes('404')) {
        throw new Error(`Spreadsheet not found or not accessible.`);
      } else if (error.message.includes('403')) {
        throw new Error(`Access denied to spreadsheet.`);
      } else if (error.message.includes('401')) {
        throw new Error(`Authentication failed. Please refresh your Google Sheets connection.`);
      }

      throw new Error(`Failed to connect to spreadsheet: ${error.message}`);
    }
  }

  /**
   * Get connected spreadsheets (multi-spreadsheet support)
   */
  async getConnectedSpreadsheets(connectionId: string, page?: number, limit?: number): Promise<{
    spreadsheets: any[];
    total: number;
    hasMore: boolean;
    page: number;
    limit: number;
  }> {
    try {
      this.logger.log('Getting connected spreadsheets from SpreadsheetConnection table', {
        connectionId,
        page,
        limit,
      });

      // Use the new SpreadsheetConnectionService to get connected spreadsheets
      const result = await this.spreadsheetConnectionService.listConnectedSpreadsheets(
        connectionId,
        false, // includeInactive
        page || 1,
        limit || 50,
      );

      // Transform the data to match the expected format
      const transformedSpreadsheets = result.spreadsheets.map(spreadsheet => ({
        id: spreadsheet.spreadsheetId,
        name: spreadsheet.spreadsheetName,
        connected_at: spreadsheet.connectedAt?.toISOString(),
        webViewLink: spreadsheet.webViewLink,
        sheets: spreadsheet.sheetsData || [],
        permissions: spreadsheet.permissions,
        lastSyncAt: spreadsheet.lastSyncAt?.toISOString(),
        syncCount: spreadsheet.syncCount,
        hasError: !!spreadsheet.lastErrorAt,
        lastError: spreadsheet.lastErrorMessage,
      }));

      this.logger.log('Successfully retrieved connected spreadsheets', {
        connectionId,
        total: result.total,
        returned: transformedSpreadsheets.length,
        hasMore: result.hasMore,
      });

      return {
        spreadsheets: transformedSpreadsheets,
        total: result.total,
        hasMore: result.hasMore,
        page: result.page,
        limit: result.limit,
      };
    } catch (error) {
      this.logger.error('Failed to get connected spreadsheets', {
        error: error.message,
        connectionId,
      });
      throw new Error(`Failed to get connected spreadsheets: ${error.message}`);
    }
  }

  /**
   * Disconnect from spreadsheet
   */
  async disconnectFromSpreadsheet(connectionId: string, spreadsheetId?: string): Promise<void> {
    try {
      this.logger.log('Disconnecting from spreadsheet using SpreadsheetConnectionService', {
        connectionId,
        spreadsheetId,
      });

      if (spreadsheetId) {
        // Disconnect from specific spreadsheet using the new service
        await this.spreadsheetConnectionService.disconnectSpreadsheet(connectionId, spreadsheetId);
        
        this.logger.log('Successfully disconnected from specific spreadsheet', {
          connectionId,
          spreadsheetId,
        });
      } else {
        // Disconnect from all spreadsheets for this connection
        const connectedSpreadsheets = await this.spreadsheetConnectionService.listConnectedSpreadsheets(
          connectionId,
          false, // includeInactive
          1,
          100, // Get all active spreadsheets
        );

        // Disconnect from each spreadsheet
        const disconnectPromises = connectedSpreadsheets.spreadsheets.map(spreadsheet =>
          this.spreadsheetConnectionService.disconnectSpreadsheet(connectionId, spreadsheet.spreadsheetId)
        );

        await Promise.all(disconnectPromises);

        this.logger.log('Successfully disconnected from all spreadsheets', {
          connectionId,
          disconnectedCount: connectedSpreadsheets.spreadsheets.length,
        });
      }
    } catch (error) {
      this.logger.error('Failed to disconnect from spreadsheet', {
        error: error.message,
        connectionId,
        spreadsheetId,
      });
      throw new Error(`Failed to disconnect from spreadsheet: ${error.message}`);
    }
  }

  /**
   * List connected Google accounts for multi-account support
   */
  async listConnectedGoogleAccounts(userId: string, organizationId: string): Promise<any[]> {
    try {
      const connections = await this.prismaService.platformConnection.findMany({
        where: {
          userId,
          organizationId,
          platformType: PlatformType.GOOGLE_SHEETS,
          status: ConnectionStatus.ACTIVE,
        },
        select: {
          id: true,
          platformName: true,
          platformData: true,
          createdAt: true,
          lastSyncAt: true,
          status: true,
        },
      });

      return connections.map(connection => {
        const platformData = connection.platformData as any;
        return {
          connectionId: connection.id,
          email: platformData?.google_email || 'Unknown',
          name: platformData?.google_name || 'Unknown',
          picture: platformData?.google_picture,
          platformName: connection.platformName,
          status: connection.status,
          createdAt: connection.createdAt,
          lastSyncAt: connection.lastSyncAt,
          connectedSpreadsheets: platformData?.connected_spreadsheets?.length ||
            (platformData?.connected_spreadsheet ? 1 : 0),
        };
      });
    } catch (error) {
      this.logger.error('Failed to list connected Google accounts', {
        error: error.message,
        userId,
        organizationId,
      });
      throw new Error(`Failed to list connected Google accounts: ${error.message}`);
    }
  }

  /**
   * Switch to specific Google account
   */
  async switchToGoogleAccount(userId: string, organizationId: string, googleEmail: string): Promise<string> {
    try {
      const connection = await this.prismaService.platformConnection.findFirst({
        where: {
          userId,
          organizationId,
          platformType: PlatformType.GOOGLE_SHEETS,
          status: ConnectionStatus.ACTIVE,
        },
        select: {
          id: true,
          platformData: true,
        },
      });

      if (!connection) {
        throw new Error('No active Google Sheets connection found');
      }

      const platformData = connection.platformData as any;
      if (platformData?.google_email !== googleEmail) {
        throw new Error('Google account not found in connections');
      }

      return connection.id;
    } catch (error) {
      this.logger.error('Failed to switch to Google account', {
        error: error.message,
        userId,
        organizationId,
        googleEmail,
      });
      throw new Error(`Failed to switch to Google account: ${error.message}`);
    }
  }

  /**
   * Refresh Google Sheets connection token
   */
  async refreshGoogleToken(connectionId: string): Promise<void> {
    try {
      this.logger.log('Refreshing Google token', { connectionId });

      const config = await this.oauth2ConfigService.getConfig(PlatformType.GOOGLE_SHEETS);
      if (!config) {
        throw new Error('Google Sheets OAuth2 configuration not found');
      }

      await this.oauth2Service.refreshAccessToken(connectionId, config);

      this.logger.log('Successfully refreshed Google token', { connectionId });
    } catch (error) {
      this.logger.error('Failed to refresh Google token', {
        error: error.message,
        connectionId,
      });
      throw error;
    }
  }

  /**
   * Test current OAuth2 scopes and permissions
   */
  async testCurrentScopes(connectionId: string): Promise<{
    scopes: string[];
    driveAccess: boolean;
    sheetsAccess: boolean;
    userInfoAccess: boolean;
    availableScopes: string[];
    missingScopes: string[];
    details: any;
  }> {
    try {
      const accessToken = await this.oauth2Service.getAccessToken(connectionId);

      const results = {
        scopes: [],
        driveAccess: false,
        sheetsAccess: false,
        userInfoAccess: false,
        availableScopes: [],
        missingScopes: [],
        details: {} as any,
      };

      // Test user info access
      try {
        const userResponse = await this.googleApiClient.get('/oauth2/v2/userinfo', {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        results.userInfoAccess = true;
        results.details.userInfo = userResponse.data;
        results.availableScopes.push('https://www.googleapis.com/auth/userinfo.profile');
        results.availableScopes.push('https://www.googleapis.com/auth/userinfo.email');
      } catch (error) {
        results.details.userInfoError = error.response?.data || error.message;
        results.missingScopes.push('https://www.googleapis.com/auth/userinfo.profile');
        results.missingScopes.push('https://www.googleapis.com/auth/userinfo.email');
      }

      // Test Drive access
      try {
        const driveResponse = await this.googleApiClient.get('/drive/v3/about', {
          headers: { Authorization: `Bearer ${accessToken}` },
          params: { fields: 'user' },
        });
        results.driveAccess = true;
        results.details.driveInfo = driveResponse.data;
        results.availableScopes.push('https://www.googleapis.com/auth/drive.file');
      } catch (error) {
        results.details.driveError = error.response?.data || error.message;
        results.missingScopes.push('https://www.googleapis.com/auth/drive.file');
      }

      // Test token info to get actual scopes
      try {
        const tokenInfoResponse = await this.googleApiClient.get(`/oauth2/v1/tokeninfo?access_token=${accessToken}`);
        results.scopes = tokenInfoResponse.data.scope?.split(' ') || [];
        results.details.tokenInfo = tokenInfoResponse.data;
      } catch (error) {
        results.details.tokenInfoError = error.response?.data || error.message;
      }

      // Test basic Sheets access
      try {
        // Try to create a simple test spreadsheet to test sheets access
        const testResponse = await this.sheetsApiClient.post('/v4/spreadsheets', {
          properties: { title: 'Confirmelo Test - Delete Me' }
        }, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        results.sheetsAccess = true;
        results.details.sheetsTest = { created: testResponse.data.spreadsheetId };
        results.availableScopes.push('https://www.googleapis.com/auth/spreadsheets');

        // Clean up the test spreadsheet
        try {
          await this.googleApiClient.delete(`/drive/v3/files/${testResponse.data.spreadsheetId}`, {
            headers: { Authorization: `Bearer ${accessToken}` },
          });
        } catch (cleanupError) {
          // Ignore cleanup errors
        }
      } catch (error) {
        results.details.sheetsError = error.response?.data || error.message;
        results.missingScopes.push('https://www.googleapis.com/auth/spreadsheets');
      }

      this.logger.log('Scope test completed', {
        connectionId,
        results,
      });

      return results;
    } catch (error) {
      this.logger.error('Failed to test scopes', {
        error: error.message,
        connectionId,
      });
      throw new Error(`Failed to test scopes: ${error.message}`);
    }
  }

  /**
   * Setup Google API client interceptors
   */
  private setupGoogleApiInterceptors(): void {
    // Setup interceptors for general Google API client
    this.setupInterceptorsForClient(this.googleApiClient, 'Google API');

    // Setup interceptors for Sheets API client
    this.setupInterceptorsForClient(this.sheetsApiClient, 'Sheets API');
  }

  private setupInterceptorsForClient(client: AxiosInstance, clientName: string): void {
    // Request interceptor
    client.interceptors.request.use(
      (config) => {
        this.logger.debug(`${clientName} Request`, {
          method: config.method?.toUpperCase(),
          url: config.url,
          params: config.params,
        });
        return config;
      },
      (error) => {
        this.logger.error(`${clientName} Request Error`, { error: error.message });
        return Promise.reject(error);
      },
    );

    // Response interceptor
    client.interceptors.response.use(
      (response) => {
        this.logger.debug(`${clientName} Response`, {
          status: response.status,
          url: response.config.url,
          dataKeys: Object.keys(response.data || {}),
        });
        return response;
      },
      (error) => {
        this.logger.error(`${clientName} Response Error`, {
          status: error.response?.status,
          url: error.config?.url,
          error: error.message,
          data: error.response?.data,
        });
        return Promise.reject(error);
      },
    );
  }
}