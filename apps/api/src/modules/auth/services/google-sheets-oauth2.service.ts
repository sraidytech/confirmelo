import { Injectable, Logger, BadRequestException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../common/database/prisma.service';
import { OAuth2Service, OAuth2Config } from './oauth2.service';
import { OAuth2ConfigService } from './oauth2-config.service';
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

  constructor(
    private readonly configService: ConfigService,
    private readonly prismaService: PrismaService,
    private readonly oauth2Service: OAuth2Service,
    private readonly oauth2ConfigService: OAuth2ConfigService,
  ) {
    // Initialize Google API client
    this.googleApiClient = axios.create({
      baseURL: 'https://www.googleapis.com',
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

      // Check for existing active connection
      const existingConnection = await this.prismaService.platformConnection.findFirst({
        where: {
          userId,
          organizationId,
          platformType: PlatformType.GOOGLE_SHEETS,
          status: ConnectionStatus.ACTIVE,
        },
      });

      if (existingConnection) {
        throw new BadRequestException('Active Google Sheets connection already exists');
      }

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

      // Store the connection with user information
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
          responseTime: Date.now(), // This would be calculated properly in real implementation
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

      const response = await this.googleApiClient.post('/sheets/v4/spreadsheets', requestBody, {
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

      const response = await this.googleApiClient.get(`/sheets/v4/spreadsheets/${spreadsheetId}`, {
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
      const response = await this.googleApiClient.get(
        `/sheets/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}`,
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
      const response = await this.googleApiClient.put(
        `/sheets/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}`,
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
      const response = await this.googleApiClient.post(
        `/sheets/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}:append`,
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
      const response = await this.googleApiClient.post(
        `/sheets/v4/spreadsheets/${spreadsheetId}:batchUpdate`,
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
   * Setup Google API client interceptors
   */
  private setupGoogleApiInterceptors(): void {
    // Request interceptor
    this.googleApiClient.interceptors.request.use(
      (config) => {
        this.logger.debug('Google API Request', {
          method: config.method?.toUpperCase(),
          url: config.url,
          params: config.params,
        });
        return config;
      },
      (error) => {
        this.logger.error('Google API Request Error', { error: error.message });
        return Promise.reject(error);
      },
    );

    // Response interceptor
    this.googleApiClient.interceptors.response.use(
      (response) => {
        this.logger.debug('Google API Response', {
          status: response.status,
          url: response.config.url,
          dataKeys: Object.keys(response.data || {}),
        });
        return response;
      },
      (error) => {
        this.logger.error('Google API Response Error', {
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