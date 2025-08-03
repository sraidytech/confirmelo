import {
  Controller,
  Post,
  Get,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Logger,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { Roles } from '../../../common/decorators/roles.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { PrismaService } from '../../../common/database/prisma.service';
import { GoogleSheetsOAuth2Service } from '../services/google-sheets-oauth2.service';
import { UserRole, PlatformType, ConnectionStatus } from '@prisma/client';

export interface InitiateGoogleAuthDto {
  platformName?: string;
}

export interface CompleteGoogleAuthDto {
  code: string;
  state: string;
  error?: string;
  error_description?: string;
}

export interface GoogleAuthorizationResponseDto {
  authorizationUrl: string;
  state: string;
}

export interface GoogleConnectionResponseDto {
  id: string;
  platformType: PlatformType;
  platformName: string;
  status: ConnectionStatus;
  scopes: string[];
  tokenExpiresAt?: Date;
  lastSyncAt?: Date;
  syncCount: number;
  platformData?: any;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateSpreadsheetDto {
  title: string;
  sheets?: Array<{
    title: string;
    rowCount?: number;
    columnCount?: number;
  }>;
}

export interface GetSpreadsheetValuesDto {
  range: string;
  valueRenderOption?: 'FORMATTED_VALUE' | 'UNFORMATTED_VALUE' | 'FORMULA';
}

export interface UpdateSpreadsheetValuesDto {
  range: string;
  values: any[][];
  valueInputOption?: 'RAW' | 'USER_ENTERED';
}

export interface AppendSpreadsheetValuesDto {
  range: string;
  values: any[][];
  valueInputOption?: 'RAW' | 'USER_ENTERED';
}

export interface BatchUpdateSpreadsheetDto {
  requests: any[];
}

@ApiTags('Google Sheets OAuth2')
@Controller('auth/oauth2/google-sheets')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class GoogleSheetsOAuth2Controller {
  private readonly logger = new Logger(GoogleSheetsOAuth2Controller.name);

  constructor(
    private readonly googleSheetsService: GoogleSheetsOAuth2Service,
    private readonly prismaService: PrismaService,
  ) {}

  @Post('initiate')
  @ApiOperation({
    summary: 'Initiate Google Sheets OAuth2 authorization',
    description: 'Generate authorization URL for Google Sheets integration (will revoke existing connections)',
  })
  @ApiResponse({
    status: 200,
    description: 'Authorization URL generated successfully',
  })
  @ApiResponse({
    status: 400,
    description: 'Google Sheets OAuth2 not configured',
  })
  @ApiResponse({
    status: 403,
    description: 'Insufficient permissions',
  })
  @Roles(UserRole.ADMIN, UserRole.TEAM_LEADER, UserRole.CLIENT_ADMIN)
  async initiateGoogleAuthorization(
    @Body() dto: InitiateGoogleAuthDto,
    @CurrentUser() user: any,
  ): Promise<GoogleAuthorizationResponseDto> {
    try {
      this.logger.log('Initiating Google Sheets OAuth2 flow', {
        userId: user.id,
        organizationId: user.organizationId,
        platformName: dto.platformName,
      });

      const result = await this.googleSheetsService.initiateGoogleAuthorization(
        user.id,
        user.organizationId,
      );

      return result;
    } catch (error) {
      this.logger.error('Failed to initiate Google Sheets OAuth2 flow', {
        error: error.message,
        userId: user.id,
      });
      throw error;
    }
  }

  @Post('complete')
  @ApiOperation({
    summary: 'Complete Google Sheets OAuth2 authorization',
    description: 'Exchange authorization code for access token and store connection',
  })
  @ApiResponse({
    status: 200,
    description: 'Google Sheets connection established successfully',
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid authorization code or state',
  })
  @ApiResponse({
    status: 401,
    description: 'Authorization failed or expired',
  })
  @Roles(UserRole.ADMIN, UserRole.TEAM_LEADER, UserRole.CLIENT_ADMIN)
  async completeGoogleAuthorization(
    @Body() dto: CompleteGoogleAuthDto,
    @CurrentUser() user: any,
  ): Promise<GoogleConnectionResponseDto> {
    try {
      // Handle OAuth2 errors
      if (dto.error) {
        this.logger.warn('Google Sheets OAuth2 authorization error', {
          error: dto.error,
          description: dto.error_description,
          userId: user.id,
        });
        throw new BadRequestException(`Google authorization failed: ${dto.error_description || dto.error}`);
      }

      this.logger.log('Completing Google Sheets OAuth2 flow', {
        userId: user.id,
        state: dto.state,
      });

      const { connectionId, userInfo } = await this.googleSheetsService.completeGoogleAuthorization(
        dto.code,
        dto.state,
        user.id,
        user.organizationId,
      );

      // Retrieve and return the stored connection
      const connection = await this.prismaService.platformConnection.findUnique({
        where: { id: connectionId },
      });

      return this.mapConnectionToDto(connection);
    } catch (error) {
      this.logger.error('Failed to complete Google Sheets OAuth2 flow', {
        error: error.message,
        userId: user.id,
        state: dto.state,
      });
      throw error;
    }
  }

  @Get('connections')
  @ApiOperation({
    summary: 'List Google Sheets connections',
    description: 'Get list of Google Sheets connections for the current user/organization',
  })
  @ApiQuery({ name: 'status', required: false, type: String })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiResponse({
    status: 200,
    description: 'Google Sheets connections retrieved successfully',
  })
  @Roles(UserRole.ADMIN, UserRole.TEAM_LEADER, UserRole.CLIENT_ADMIN, UserRole.CLIENT_USER)
  async listGoogleConnections(
    @Query('status') status: string | undefined,
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 10,
    @CurrentUser() user: any,
  ): Promise<{
    connections: GoogleConnectionResponseDto[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
    try {
      const actualLimit = Math.min(limit, 50); // Max 50 items per page
      const skip = (page - 1) * actualLimit;

      const where: any = {
        organizationId: user.organizationId,
        platformType: PlatformType.GOOGLE_SHEETS,
        ...(status && { status: status as any }),
        // Non-admin users can only see their own connections
        ...(![UserRole.ADMIN, UserRole.CLIENT_ADMIN].includes(user.role) && { userId: user.id }),
      };

      const [connections, total] = await Promise.all([
        this.prismaService.platformConnection.findMany({
          where,
          skip,
          take: actualLimit,
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
        }),
        this.prismaService.platformConnection.count({ where }),
      ]);

      return {
        connections: connections.map(conn => this.mapConnectionToDto(conn)),
        total,
        page,
        limit: actualLimit,
        totalPages: Math.ceil(total / actualLimit),
      };
    } catch (error) {
      this.logger.error('Failed to list Google Sheets connections', {
        error: error.message,
        userId: user.id,
      });
      throw error;
    }
  }

  @Get('connections/:id')
  @ApiOperation({
    summary: 'Get Google Sheets connection details',
    description: 'Get detailed information about a specific Google Sheets connection',
  })
  @ApiParam({ name: 'id', description: 'Connection ID' })
  @ApiResponse({
    status: 200,
    description: 'Connection details retrieved successfully',
  })
  @ApiResponse({
    status: 404,
    description: 'Connection not found',
  })
  @ApiResponse({
    status: 403,
    description: 'Access denied to this connection',
  })
  @Roles(UserRole.ADMIN, UserRole.TEAM_LEADER, UserRole.CLIENT_ADMIN, UserRole.CLIENT_USER)
  async getGoogleConnection(
    @Param('id') id: string,
    @CurrentUser() user: any,
  ): Promise<GoogleConnectionResponseDto> {
    try {
      const connection = await this.prismaService.platformConnection.findFirst({
        where: {
          id,
          organizationId: user.organizationId,
          platformType: PlatformType.GOOGLE_SHEETS,
          // Non-admin users can only see their own connections
          ...(![UserRole.ADMIN, UserRole.CLIENT_ADMIN].includes(user.role) && { userId: user.id }),
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

      if (!connection) {
        throw new NotFoundException('Google Sheets connection not found');
      }

      return this.mapConnectionToDto(connection);
    } catch (error) {
      this.logger.error('Failed to get Google Sheets connection', {
        error: error.message,
        connectionId: id,
        userId: user.id,
      });
      throw error;
    }
  }

  @Post('connections/:id/test-scopes')
  @ApiOperation({
    summary: 'Test Google Sheets connection scopes',
    description: 'Test what permissions and scopes are available for the connection',
  })
  @ApiParam({ name: 'id', description: 'Connection ID' })
  @ApiResponse({
    status: 200,
    description: 'Scope test completed',
  })
  @Roles(UserRole.ADMIN, UserRole.TEAM_LEADER, UserRole.CLIENT_ADMIN, UserRole.CLIENT_USER)
  async testGoogleScopes(
    @Param('id') id: string,
    @CurrentUser() user: any,
  ): Promise<any> {
    try {
      // Verify connection exists and user has access
      const connection = await this.prismaService.platformConnection.findFirst({
        where: {
          id,
          organizationId: user.organizationId,
          platformType: PlatformType.GOOGLE_SHEETS,
          // Non-admin users can only test their own connections
          ...(![UserRole.ADMIN, UserRole.CLIENT_ADMIN].includes(user.role) && { userId: user.id }),
        },
      });

      if (!connection) {
        throw new NotFoundException('Google Sheets connection not found');
      }

      // Test the scopes
      const scopeResults = await this.googleSheetsService.testCurrentScopes(id);

      return {
        success: true,
        ...scopeResults,
        testedAt: new Date(),
      };
    } catch (error) {
      this.logger.error('Failed to test Google Sheets scopes', {
        error: error.message,
        connectionId: id,
        userId: user.id,
      });
      
      return {
        success: false,
        error: error.message,
        testedAt: new Date(),
      };
    }
  }

  @Post('connections/:id/test')
  @ApiOperation({
    summary: 'Test Google Sheets connection',
    description: 'Test if the Google Sheets connection is working properly',
  })
  @ApiParam({ name: 'id', description: 'Connection ID' })
  @ApiResponse({
    status: 200,
    description: 'Connection test completed',
  })
  @Roles(UserRole.ADMIN, UserRole.TEAM_LEADER, UserRole.CLIENT_ADMIN, UserRole.CLIENT_USER)
  async testGoogleConnection(
    @Param('id') id: string,
    @CurrentUser() user: any,
  ): Promise<{
    success: boolean;
    error?: string;
    details?: any;
    testedAt: Date;
  }> {
    try {
      // Verify connection exists and user has access
      const connection = await this.prismaService.platformConnection.findFirst({
        where: {
          id,
          organizationId: user.organizationId,
          platformType: PlatformType.GOOGLE_SHEETS,
          // Non-admin users can only test their own connections
          ...(![UserRole.ADMIN, UserRole.CLIENT_ADMIN].includes(user.role) && { userId: user.id }),
        },
      });

      if (!connection) {
        throw new NotFoundException('Google Sheets connection not found');
      }

      // Test the connection
      const testResult = await this.googleSheetsService.testGoogleSheetsConnection(id);

      return {
        success: testResult.success,
        error: testResult.error,
        details: testResult.details,
        testedAt: new Date(),
      };
    } catch (error) {
      this.logger.error('Failed to test Google Sheets connection', {
        error: error.message,
        connectionId: id,
        userId: user.id,
      });
      
      return {
        success: false,
        error: error.message,
        testedAt: new Date(),
      };
    }
  }

  @Post('connections/:id/spreadsheets')
  @ApiOperation({
    summary: 'Create a new Google Spreadsheet',
    description: 'Create a new spreadsheet using the Google Sheets connection',
  })
  @ApiParam({ name: 'id', description: 'Connection ID' })
  @ApiResponse({
    status: 200,
    description: 'Spreadsheet created successfully',
  })
  @Roles(UserRole.ADMIN, UserRole.TEAM_LEADER, UserRole.CLIENT_ADMIN)
  async createSpreadsheet(
    @Param('id') id: string,
    @Body() dto: CreateSpreadsheetDto,
    @CurrentUser() user: any,
  ): Promise<any> {
    try {
      // Verify connection exists and user has access
      const connection = await this.prismaService.platformConnection.findFirst({
        where: {
          id,
          organizationId: user.organizationId,
          platformType: PlatformType.GOOGLE_SHEETS,
          status: ConnectionStatus.ACTIVE,
          // Non-admin users can only use their own connections
          ...(![UserRole.ADMIN, UserRole.CLIENT_ADMIN].includes(user.role) && { userId: user.id }),
        },
      });

      if (!connection) {
        throw new NotFoundException('Active Google Sheets connection not found');
      }

      // Get access token
      const accessToken = await this.googleSheetsService['oauth2Service'].getAccessToken(id);

      // Create spreadsheet
      const spreadsheet = await this.googleSheetsService.createSpreadsheet(
        accessToken,
        dto.title,
        dto.sheets,
      );

      this.logger.log('Created Google Spreadsheet via API', {
        connectionId: id,
        spreadsheetId: spreadsheet.spreadsheetId,
        title: dto.title,
        userId: user.id,
      });

      return spreadsheet;
    } catch (error) {
      this.logger.error('Failed to create Google Spreadsheet', {
        error: error.message,
        connectionId: id,
        title: dto.title,
        userId: user.id,
      });
      throw error;
    }
  }

  @Get('connections/:id/spreadsheets/:spreadsheetId')
  @ApiOperation({
    summary: 'Get Google Spreadsheet information',
    description: 'Get information about a specific spreadsheet',
  })
  @ApiParam({ name: 'id', description: 'Connection ID' })
  @ApiParam({ name: 'spreadsheetId', description: 'Spreadsheet ID' })
  @ApiQuery({ name: 'includeGridData', required: false, type: Boolean })
  @ApiResponse({
    status: 200,
    description: 'Spreadsheet information retrieved successfully',
  })
  @Roles(UserRole.ADMIN, UserRole.TEAM_LEADER, UserRole.CLIENT_ADMIN, UserRole.CLIENT_USER)
  async getSpreadsheet(
    @Param('id') id: string,
    @Param('spreadsheetId') spreadsheetId: string,
    @Query('includeGridData') includeGridData: boolean = false,
    @CurrentUser() user: any,
  ): Promise<any> {
    try {
      // Verify connection exists and user has access
      const connection = await this.prismaService.platformConnection.findFirst({
        where: {
          id,
          organizationId: user.organizationId,
          platformType: PlatformType.GOOGLE_SHEETS,
          status: ConnectionStatus.ACTIVE,
          // Non-admin users can only use their own connections
          ...(![UserRole.ADMIN, UserRole.CLIENT_ADMIN].includes(user.role) && { userId: user.id }),
        },
      });

      if (!connection) {
        throw new NotFoundException('Active Google Sheets connection not found');
      }

      // Get access token
      const accessToken = await this.googleSheetsService['oauth2Service'].getAccessToken(id);

      // Get spreadsheet
      const spreadsheet = await this.googleSheetsService.getSpreadsheet(
        accessToken,
        spreadsheetId,
        includeGridData,
      );

      return spreadsheet;
    } catch (error) {
      this.logger.error('Failed to get Google Spreadsheet', {
        error: error.message,
        connectionId: id,
        spreadsheetId,
        userId: user.id,
      });
      throw error;
    }
  }

  @Get('connections/:id/spreadsheets/:spreadsheetId/values')
  @ApiOperation({
    summary: 'Get values from Google Spreadsheet range',
    description: 'Read values from a specific range in a spreadsheet',
  })
  @ApiParam({ name: 'id', description: 'Connection ID' })
  @ApiParam({ name: 'spreadsheetId', description: 'Spreadsheet ID' })
  @ApiQuery({ name: 'range', required: true, type: String })
  @ApiQuery({ name: 'valueRenderOption', required: false, enum: ['FORMATTED_VALUE', 'UNFORMATTED_VALUE', 'FORMULA'] })
  @ApiResponse({
    status: 200,
    description: 'Spreadsheet values retrieved successfully',
  })
  @Roles(UserRole.ADMIN, UserRole.TEAM_LEADER, UserRole.CLIENT_ADMIN, UserRole.CLIENT_USER)
  async getSpreadsheetValues(
    @Param('id') id: string,
    @Param('spreadsheetId') spreadsheetId: string,
    @Query() query: GetSpreadsheetValuesDto,
    @CurrentUser() user: any,
  ): Promise<{ values: any[][] }> {
    try {
      // Verify connection exists and user has access
      const connection = await this.prismaService.platformConnection.findFirst({
        where: {
          id,
          organizationId: user.organizationId,
          platformType: PlatformType.GOOGLE_SHEETS,
          status: ConnectionStatus.ACTIVE,
          // Non-admin users can only use their own connections
          ...(![UserRole.ADMIN, UserRole.CLIENT_ADMIN].includes(user.role) && { userId: user.id }),
        },
      });

      if (!connection) {
        throw new NotFoundException('Active Google Sheets connection not found');
      }

      // Get access token
      const accessToken = await this.googleSheetsService['oauth2Service'].getAccessToken(id);

      // Get values
      const values = await this.googleSheetsService.getSpreadsheetValues(
        accessToken,
        spreadsheetId,
        query.range,
        query.valueRenderOption,
      );

      return { values };
    } catch (error) {
      this.logger.error('Failed to get spreadsheet values', {
        error: error.message,
        connectionId: id,
        spreadsheetId,
        range: query.range,
        userId: user.id,
      });
      throw error;
    }
  }

  @Put('connections/:id/spreadsheets/:spreadsheetId/values')
  @ApiOperation({
    summary: 'Update values in Google Spreadsheet range',
    description: 'Write values to a specific range in a spreadsheet',
  })
  @ApiParam({ name: 'id', description: 'Connection ID' })
  @ApiParam({ name: 'spreadsheetId', description: 'Spreadsheet ID' })
  @ApiResponse({
    status: 200,
    description: 'Spreadsheet values updated successfully',
  })
  @Roles(UserRole.ADMIN, UserRole.TEAM_LEADER, UserRole.CLIENT_ADMIN)
  async updateSpreadsheetValues(
    @Param('id') id: string,
    @Param('spreadsheetId') spreadsheetId: string,
    @Body() dto: UpdateSpreadsheetValuesDto,
    @CurrentUser() user: any,
  ): Promise<any> {
    try {
      // Verify connection exists and user has access
      const connection = await this.prismaService.platformConnection.findFirst({
        where: {
          id,
          organizationId: user.organizationId,
          platformType: PlatformType.GOOGLE_SHEETS,
          status: ConnectionStatus.ACTIVE,
          // Non-admin users can only use their own connections
          ...(![UserRole.ADMIN, UserRole.CLIENT_ADMIN].includes(user.role) && { userId: user.id }),
        },
      });

      if (!connection) {
        throw new NotFoundException('Active Google Sheets connection not found');
      }

      // Get access token
      const accessToken = await this.googleSheetsService['oauth2Service'].getAccessToken(id);

      // Update values
      const result = await this.googleSheetsService.updateSpreadsheetValues(
        accessToken,
        spreadsheetId,
        dto.range,
        dto.values,
        dto.valueInputOption,
      );

      return result;
    } catch (error) {
      this.logger.error('Failed to update spreadsheet values', {
        error: error.message,
        connectionId: id,
        spreadsheetId,
        range: dto.range,
        userId: user.id,
      });
      throw error;
    }
  }

  @Post('connections/:id/spreadsheets/:spreadsheetId/values:append')
  @ApiOperation({
    summary: 'Append values to Google Spreadsheet',
    description: 'Append values to a spreadsheet range',
  })
  @ApiParam({ name: 'id', description: 'Connection ID' })
  @ApiParam({ name: 'spreadsheetId', description: 'Spreadsheet ID' })
  @ApiResponse({
    status: 200,
    description: 'Values appended successfully',
  })
  @Roles(UserRole.ADMIN, UserRole.TEAM_LEADER, UserRole.CLIENT_ADMIN)
  async appendSpreadsheetValues(
    @Param('id') id: string,
    @Param('spreadsheetId') spreadsheetId: string,
    @Body() dto: AppendSpreadsheetValuesDto,
    @CurrentUser() user: any,
  ): Promise<any> {
    try {
      // Verify connection exists and user has access
      const connection = await this.prismaService.platformConnection.findFirst({
        where: {
          id,
          organizationId: user.organizationId,
          platformType: PlatformType.GOOGLE_SHEETS,
          status: ConnectionStatus.ACTIVE,
          // Non-admin users can only use their own connections
          ...(![UserRole.ADMIN, UserRole.CLIENT_ADMIN].includes(user.role) && { userId: user.id }),
        },
      });

      if (!connection) {
        throw new NotFoundException('Active Google Sheets connection not found');
      }

      // Get access token
      const accessToken = await this.googleSheetsService['oauth2Service'].getAccessToken(id);

      // Append values
      const result = await this.googleSheetsService.appendSpreadsheetValues(
        accessToken,
        spreadsheetId,
        dto.range,
        dto.values,
        dto.valueInputOption,
      );

      return result;
    } catch (error) {
      this.logger.error('Failed to append spreadsheet values', {
        error: error.message,
        connectionId: id,
        spreadsheetId,
        range: dto.range,
        userId: user.id,
      });
      throw error;
    }
  }

  @Post('connections/:id/spreadsheets/:spreadsheetId:batchUpdate')
  @ApiOperation({
    summary: 'Batch update Google Spreadsheet',
    description: 'Perform multiple operations on a spreadsheet in a single request',
  })
  @ApiParam({ name: 'id', description: 'Connection ID' })
  @ApiParam({ name: 'spreadsheetId', description: 'Spreadsheet ID' })
  @ApiResponse({
    status: 200,
    description: 'Batch update completed successfully',
  })
  @Roles(UserRole.ADMIN, UserRole.TEAM_LEADER, UserRole.CLIENT_ADMIN)
  async batchUpdateSpreadsheet(
    @Param('id') id: string,
    @Param('spreadsheetId') spreadsheetId: string,
    @Body() dto: BatchUpdateSpreadsheetDto,
    @CurrentUser() user: any,
  ): Promise<any> {
    try {
      // Verify connection exists and user has access
      const connection = await this.prismaService.platformConnection.findFirst({
        where: {
          id,
          organizationId: user.organizationId,
          platformType: PlatformType.GOOGLE_SHEETS,
          status: ConnectionStatus.ACTIVE,
          // Non-admin users can only use their own connections
          ...(![UserRole.ADMIN, UserRole.CLIENT_ADMIN].includes(user.role) && { userId: user.id }),
        },
      });

      if (!connection) {
        throw new NotFoundException('Active Google Sheets connection not found');
      }

      // Get access token
      const accessToken = await this.googleSheetsService['oauth2Service'].getAccessToken(id);

      // Batch update
      const result = await this.googleSheetsService.batchUpdateSpreadsheet(
        accessToken,
        spreadsheetId,
        dto.requests,
      );

      return result;
    } catch (error) {
      this.logger.error('Failed to batch update spreadsheet', {
        error: error.message,
        connectionId: id,
        spreadsheetId,
        requestsCount: dto.requests.length,
        userId: user.id,
      });
      throw error;
    }
  }

  @Post('connections/:id/add-spreadsheet')
  @ApiOperation({
    summary: 'Add existing spreadsheet to accessible list',
    description: 'Add an existing Google Spreadsheet by URL or ID (works with drive.file scope)',
  })
  @ApiParam({ name: 'id', description: 'Connection ID' })
  @ApiResponse({
    status: 200,
    description: 'Spreadsheet added successfully',
  })
  @Roles(UserRole.ADMIN, UserRole.TEAM_LEADER, UserRole.CLIENT_ADMIN)
  async addExistingSpreadsheet(
    @Param('id') id: string,
    @Body() body: { spreadsheetUrl: string },
    @CurrentUser() user: any,
  ): Promise<{
    success: boolean;
    spreadsheet?: any;
    error?: string;
  }> {
    try {
      // Verify connection exists and user has access
      const connection = await this.prismaService.platformConnection.findFirst({
        where: {
          id,
          organizationId: user.organizationId,
          platformType: PlatformType.GOOGLE_SHEETS,
          status: ConnectionStatus.ACTIVE,
          // Non-admin users can only use their own connections
          ...(![UserRole.ADMIN, UserRole.CLIENT_ADMIN].includes(user.role) && { userId: user.id }),
        },
      });

      if (!connection) {
        throw new NotFoundException('Active Google Sheets connection not found');
      }

      // Extract spreadsheet ID from URL
      const spreadsheetId = this.googleSheetsService.extractSpreadsheetId(body.spreadsheetUrl);
      if (!spreadsheetId) {
        throw new BadRequestException('Invalid Google Sheets URL or ID provided');
      }

      const result = await this.googleSheetsService.addExistingSpreadsheet(id, spreadsheetId);

      return result;
    } catch (error) {
      this.logger.error('Failed to add existing spreadsheet', {
        error: error.message,
        connectionId: id,
        spreadsheetUrl: body.spreadsheetUrl,
        userId: user.id,
      });
      throw error;
    }
  }

  @Get('connections/:id/available-spreadsheets')
  @ApiOperation({
    summary: 'List available spreadsheets',
    description: 'Get list of available Google Spreadsheets for the connection (limited by drive.file scope)',
  })
  @ApiParam({ name: 'id', description: 'Connection ID' })
  @ApiQuery({ name: 'pageSize', required: false, type: Number })
  @ApiQuery({ name: 'pageToken', required: false, type: String })
  @ApiResponse({
    status: 200,
    description: 'Available spreadsheets retrieved successfully',
  })
  @Roles(UserRole.ADMIN, UserRole.TEAM_LEADER, UserRole.CLIENT_ADMIN, UserRole.CLIENT_USER)
  async listAvailableSpreadsheets(
    @Param('id') id: string,
    @Query('pageSize') pageSize: number = 20,
    @Query('pageToken') pageToken: string | undefined,
    @CurrentUser() user: any,
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
      // Verify connection exists and user has access
      const connection = await this.prismaService.platformConnection.findFirst({
        where: {
          id,
          organizationId: user.organizationId,
          platformType: PlatformType.GOOGLE_SHEETS,
          status: ConnectionStatus.ACTIVE,
          // Non-admin users can only use their own connections
          ...(![UserRole.ADMIN, UserRole.CLIENT_ADMIN].includes(user.role) && { userId: user.id }),
        },
      });

      if (!connection) {
        throw new NotFoundException('Active Google Sheets connection not found');
      }

      const result = await this.googleSheetsService.listSpreadsheets(
        id,
        Math.min(pageSize, 50), // Max 50 items per page
        pageToken,
      );

      return result;
    } catch (error) {
      this.logger.error('Failed to list available spreadsheets', {
        error: error.message,
        connectionId: id,
        userId: user.id,
      });
      throw error;
    }
  }

  @Post('connections/:id/connect-spreadsheet')
  @ApiOperation({
    summary: 'Connect to a specific spreadsheet',
    description: 'Connect the Google Sheets connection to a specific spreadsheet',
  })
  @ApiParam({ name: 'id', description: 'Connection ID' })
  @ApiResponse({
    status: 200,
    description: 'Connected to spreadsheet successfully',
  })
  @Roles(UserRole.ADMIN, UserRole.TEAM_LEADER, UserRole.CLIENT_ADMIN)
  async connectToSpreadsheet(
    @Param('id') id: string,
    @Body() body: { spreadsheetId: string },
    @CurrentUser() user: any,
  ): Promise<{
    spreadsheet: any;
    connection: any;
  }> {
    try {
      // Verify connection exists and user has access
      const connection = await this.prismaService.platformConnection.findFirst({
        where: {
          id,
          organizationId: user.organizationId,
          platformType: PlatformType.GOOGLE_SHEETS,
          status: ConnectionStatus.ACTIVE,
          // Non-admin users can only use their own connections
          ...(![UserRole.ADMIN, UserRole.CLIENT_ADMIN].includes(user.role) && { userId: user.id }),
        },
      });

      if (!connection) {
        throw new NotFoundException('Active Google Sheets connection not found');
      }

      const result = await this.googleSheetsService.connectToSpreadsheet(
        id,
        body.spreadsheetId,
      );

      return result;
    } catch (error) {
      this.logger.error('Failed to connect to spreadsheet', {
        error: error.message,
        connectionId: id,
        spreadsheetId: body.spreadsheetId,
        userId: user.id,
      });
      throw error;
    }
  }

  @Get('connections/:id/connected-spreadsheet')
  @ApiOperation({
    summary: 'Get connected spreadsheet information',
    description: 'Get information about the currently connected spreadsheet',
  })
  @ApiParam({ name: 'id', description: 'Connection ID' })
  @ApiResponse({
    status: 200,
    description: 'Connected spreadsheet information retrieved successfully',
  })
  @Roles(UserRole.ADMIN, UserRole.TEAM_LEADER, UserRole.CLIENT_ADMIN, UserRole.CLIENT_USER)
  async getConnectedSpreadsheet(
    @Param('id') id: string,
    @CurrentUser() user: any,
  ): Promise<{
    spreadsheet?: any;
    sheets?: any[];
  }> {
    try {
      // Verify connection exists and user has access
      const connection = await this.prismaService.platformConnection.findFirst({
        where: {
          id,
          organizationId: user.organizationId,
          platformType: PlatformType.GOOGLE_SHEETS,
          // Non-admin users can only use their own connections
          ...(![UserRole.ADMIN, UserRole.CLIENT_ADMIN].includes(user.role) && { userId: user.id }),
        },
      });

      if (!connection) {
        throw new NotFoundException('Google Sheets connection not found');
      }

      const result = await this.googleSheetsService.getConnectedSpreadsheet(id);

      return result;
    } catch (error) {
      this.logger.error('Failed to get connected spreadsheet', {
        error: error.message,
        connectionId: id,
        userId: user.id,
      });
      throw error;
    }
  }

  @Delete('connections/:id/connected-spreadsheet')
  @ApiOperation({
    summary: 'Disconnect from current spreadsheet',
    description: 'Disconnect the Google Sheets connection from the current spreadsheet',
  })
  @ApiParam({ name: 'id', description: 'Connection ID' })
  @ApiResponse({
    status: 200,
    description: 'Disconnected from spreadsheet successfully',
  })
  @Roles(UserRole.ADMIN, UserRole.TEAM_LEADER, UserRole.CLIENT_ADMIN)
  async disconnectFromSpreadsheet(
    @Param('id') id: string,
    @CurrentUser() user: any,
  ): Promise<{ success: boolean }> {
    try {
      // Verify connection exists and user has access
      const connection = await this.prismaService.platformConnection.findFirst({
        where: {
          id,
          organizationId: user.organizationId,
          platformType: PlatformType.GOOGLE_SHEETS,
          // Non-admin users can only use their own connections
          ...(![UserRole.ADMIN, UserRole.CLIENT_ADMIN].includes(user.role) && { userId: user.id }),
        },
      });

      if (!connection) {
        throw new NotFoundException('Google Sheets connection not found');
      }

      await this.googleSheetsService.disconnectFromSpreadsheet(id);

      return { success: true };
    } catch (error) {
      this.logger.error('Failed to disconnect from spreadsheet', {
        error: error.message,
        connectionId: id,
        userId: user.id,
      });
      throw error;
    }
  }

  @Post('connections/:id/create-test-spreadsheet')
  @ApiOperation({
    summary: 'Create a test spreadsheet',
    description: 'Create a new test spreadsheet and connect to it',
  })
  @ApiParam({ name: 'id', description: 'Connection ID' })
  @ApiResponse({
    status: 200,
    description: 'Test spreadsheet created and connected successfully',
  })
  @Roles(UserRole.ADMIN, UserRole.TEAM_LEADER, UserRole.CLIENT_ADMIN)
  async createTestSpreadsheet(
    @Param('id') id: string,
    @CurrentUser() user: any,
  ): Promise<{
    spreadsheetId: string;
    spreadsheetUrl: string;
    title: string;
  }> {
    try {
      // Verify connection exists and user has access
      const connection = await this.prismaService.platformConnection.findFirst({
        where: {
          id,
          organizationId: user.organizationId,
          platformType: PlatformType.GOOGLE_SHEETS,
          status: ConnectionStatus.ACTIVE,
          // Non-admin users can only use their own connections
          ...(![UserRole.ADMIN, UserRole.CLIENT_ADMIN].includes(user.role) && { userId: user.id }),
        },
      });

      if (!connection) {
        throw new NotFoundException('Active Google Sheets connection not found');
      }

      const result = await this.googleSheetsService.createTestSpreadsheet(id);

      // Automatically connect to the newly created spreadsheet
      await this.googleSheetsService.connectToSpreadsheet(id, result.spreadsheetId);

      this.logger.log('Created and connected to test spreadsheet', {
        connectionId: id,
        spreadsheetId: result.spreadsheetId,
        userId: user.id,
      });

      return result;
    } catch (error) {
      this.logger.error('Failed to create test spreadsheet', {
        error: error.message,
        connectionId: id,
        userId: user.id,
      });
      throw error;
    }
  }

  @Post('connections/:id/test-scopes')
  @ApiOperation({
    summary: 'Test OAuth2 scopes and permissions',
    description: 'Test what OAuth2 scopes are granted and what APIs are accessible',
  })
  @ApiParam({ name: 'id', description: 'Connection ID' })
  @ApiResponse({
    status: 200,
    description: 'Scope test completed',
  })
  @Roles(UserRole.ADMIN, UserRole.TEAM_LEADER, UserRole.CLIENT_ADMIN, UserRole.CLIENT_USER)
  async testOAuth2Scopes(
    @Param('id') id: string,
    @CurrentUser() user: any,
  ): Promise<{
    scopes: string[];
    driveAccess: boolean;
    sheetsAccess: boolean;
    userInfoAccess: boolean;
    details: any;
    recommendations: string[];
    testedAt: Date;
  }> {
    try {
      // Verify connection exists and user has access
      const connection = await this.prismaService.platformConnection.findFirst({
        where: {
          id,
          organizationId: user.organizationId,
          platformType: PlatformType.GOOGLE_SHEETS,
          // Non-admin users can only test their own connections
          ...(![UserRole.ADMIN, UserRole.CLIENT_ADMIN].includes(user.role) && { userId: user.id }),
        },
      });

      if (!connection) {
        throw new NotFoundException('Google Sheets connection not found');
      }

      // Test current scopes
      const scopeTest = await this.googleSheetsService.testCurrentScopes(id);

      // Generate recommendations based on test results
      const recommendations: string[] = [];
      
      if (!scopeTest.driveAccess) {
        recommendations.push('Add drive.file scope to access existing spreadsheets');
      }
      
      if (!scopeTest.sheetsAccess) {
        recommendations.push('Ensure spreadsheets scope is properly configured');
      }

      if (scopeTest.scopes.includes('https://www.googleapis.com/auth/drive.file')) {
        recommendations.push('Using drive.file scope for secure access to specific files');
      }

      if (scopeTest.scopes.includes('https://www.googleapis.com/auth/spreadsheets.readonly')) {
        recommendations.push('Consider upgrading from spreadsheets.readonly to spreadsheets for full access');
      }

      if (recommendations.length === 0) {
        recommendations.push('All scopes are properly configured');
      }

      this.logger.log('OAuth2 scope test completed', {
        connectionId: id,
        userId: user.id,
        scopes: scopeTest.scopes,
        driveAccess: scopeTest.driveAccess,
        sheetsAccess: scopeTest.sheetsAccess,
      });

      return {
        scopes: scopeTest.scopes,
        driveAccess: scopeTest.driveAccess,
        sheetsAccess: scopeTest.sheetsAccess,
        userInfoAccess: scopeTest.userInfoAccess,
        details: scopeTest.details,
        recommendations,
        testedAt: new Date(),
      };
    } catch (error) {
      this.logger.error('Failed to test OAuth2 scopes', {
        error: error.message,
        connectionId: id,
        userId: user.id,
      });
      throw error;
    }
  }

  @Get('connections/:id/available-spreadsheets')
  @ApiOperation({
    summary: 'List available Google Spreadsheets',
    description: 'Get list of spreadsheets accessible with current OAuth2 scopes',
  })
  @ApiParam({ name: 'id', description: 'Connection ID' })
  @ApiQuery({ name: 'pageSize', required: false, type: Number })
  @ApiQuery({ name: 'pageToken', required: false, type: String })
  @ApiResponse({
    status: 200,
    description: 'Available spreadsheets retrieved successfully',
  })
  @Roles(UserRole.ADMIN, UserRole.TEAM_LEADER, UserRole.CLIENT_ADMIN, UserRole.CLIENT_USER)
  async listAvailableSpreadsheets(
    @Param('id') id: string,
    @Query('pageSize') pageSize: number = 20,
    @Query('pageToken') pageToken: string | undefined,
    @CurrentUser() user: any,
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
      // Verify connection exists and user has access
      const connection = await this.prismaService.platformConnection.findFirst({
        where: {
          id,
          organizationId: user.organizationId,
          platformType: PlatformType.GOOGLE_SHEETS,
          status: ConnectionStatus.ACTIVE,
          // Non-admin users can only use their own connections
          ...(![UserRole.ADMIN, UserRole.CLIENT_ADMIN].includes(user.role) && { userId: user.id }),
        },
      });

      if (!connection) {
        throw new NotFoundException('Active Google Sheets connection not found');
      }

      // List available spreadsheets
      const result = await this.googleSheetsService.listSpreadsheets(
        id,
        Math.min(pageSize, 50), // Max 50 items per page
        pageToken,
      );

      this.logger.log('Listed available spreadsheets', {
        connectionId: id,
        userId: user.id,
        count: result.spreadsheets.length,
        scope: result.scopeInfo.scope,
      });

      return result;
    } catch (error) {
      this.logger.error('Failed to list available spreadsheets', {
        error: error.message,
        connectionId: id,
        userId: user.id,
      });
      throw error;
    }
  }

  @Post('connections/:id/add-existing-spreadsheet')
  @ApiOperation({
    summary: 'Import existing Google Spreadsheet',
    description: 'Add an existing spreadsheet to the accessible list by URL or ID',
  })
  @ApiParam({ name: 'id', description: 'Connection ID' })
  @ApiResponse({
    status: 200,
    description: 'Spreadsheet imported successfully',
  })
  @Roles(UserRole.ADMIN, UserRole.TEAM_LEADER, UserRole.CLIENT_ADMIN)
  async addExistingSpreadsheet(
    @Param('id') id: string,
    @Body() dto: { spreadsheetUrl: string },
    @CurrentUser() user: any,
  ): Promise<{
    success: boolean;
    spreadsheet?: {
      id: string;
      name: string;
      sheets: Array<{
        id: number;
        name: string;
        index: number;
      }>;
    };
    error?: string;
  }> {
    try {
      // Verify connection exists and user has access
      const connection = await this.prismaService.platformConnection.findFirst({
        where: {
          id,
          organizationId: user.organizationId,
          platformType: PlatformType.GOOGLE_SHEETS,
          status: ConnectionStatus.ACTIVE,
          // Non-admin users can only use their own connections
          ...(![UserRole.ADMIN, UserRole.CLIENT_ADMIN].includes(user.role) && { userId: user.id }),
        },
      });

      if (!connection) {
        throw new NotFoundException('Active Google Sheets connection not found');
      }

      // Extract spreadsheet ID from URL
      const spreadsheetId = this.googleSheetsService.extractSpreadsheetId(dto.spreadsheetUrl);
      
      if (!spreadsheetId) {
        throw new BadRequestException('Invalid Google Sheets URL or ID');
      }

      // Add existing spreadsheet
      const result = await this.googleSheetsService.addExistingSpreadsheet(id, spreadsheetId);

      if (result.success) {
        this.logger.log('Successfully imported existing spreadsheet', {
          connectionId: id,
          spreadsheetId,
          spreadsheetName: result.spreadsheet?.name,
          userId: user.id,
        });
      } else {
        this.logger.warn('Failed to import existing spreadsheet', {
          connectionId: id,
          spreadsheetId,
          error: result.error,
          userId: user.id,
        });
      }

      return result;
    } catch (error) {
      this.logger.error('Failed to add existing spreadsheet', {
        error: error.message,
        connectionId: id,
        spreadsheetUrl: dto.spreadsheetUrl,
        userId: user.id,
      });
      
      return {
        success: false,
        error: error.message,
      };
    }
  }

  @Post('connections/:id/create-orders-spreadsheet')
  @ApiOperation({
    summary: 'Create new Orders spreadsheet',
    description: 'Create a new Google Spreadsheet with predefined Orders template',
  })
  @ApiParam({ name: 'id', description: 'Connection ID' })
  @ApiResponse({
    status: 200,
    description: 'Orders spreadsheet created successfully',
  })
  @Roles(UserRole.ADMIN, UserRole.TEAM_LEADER, UserRole.CLIENT_ADMIN)
  async createOrdersSpreadsheet(
    @Param('id') id: string,
    @Body() dto: { name: string },
    @CurrentUser() user: any,
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
      // Verify connection exists and user has access
      const connection = await this.prismaService.platformConnection.findFirst({
        where: {
          id,
          organizationId: user.organizationId,
          platformType: PlatformType.GOOGLE_SHEETS,
          status: ConnectionStatus.ACTIVE,
          // Non-admin users can only use their own connections
          ...(![UserRole.ADMIN, UserRole.CLIENT_ADMIN].includes(user.role) && { userId: user.id }),
        },
      });

      if (!connection) {
        throw new NotFoundException('Active Google Sheets connection not found');
      }

      // Validate spreadsheet name
      if (!dto.name || dto.name.trim().length === 0) {
        throw new BadRequestException('Spreadsheet name is required');
      }

      if (dto.name.length > 100) {
        throw new BadRequestException('Spreadsheet name must be less than 100 characters');
      }

      // Create Orders spreadsheet
      const result = await this.googleSheetsService.createOrdersSpreadsheet(id, dto.name.trim());

      if (result.success) {
        this.logger.log('Successfully created Orders spreadsheet', {
          connectionId: id,
          spreadsheetId: result.spreadsheet?.id,
          spreadsheetName: result.spreadsheet?.name,
          userId: user.id,
        });
      } else {
        this.logger.warn('Failed to create Orders spreadsheet', {
          connectionId: id,
          name: dto.name,
          error: result.error,
          userId: user.id,
        });
      }

      return result;
    } catch (error) {
      this.logger.error('Failed to create Orders spreadsheet', {
        error: error.message,
        connectionId: id,
        name: dto.name,
        userId: user.id,
      });
      
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Map database connection to DTO
   */
  private mapConnectionToDto(connection: any): GoogleConnectionResponseDto {
    return {
      id: connection.id,
      platformType: connection.platformType,
      platformName: connection.platformName,
      status: connection.status,
      scopes: connection.scopes,
      tokenExpiresAt: connection.tokenExpiresAt,
      lastSyncAt: connection.lastSyncAt,
      syncCount: connection.syncCount,
      platformData: connection.platformData,
      createdAt: connection.createdAt,
      updatedAt: connection.updatedAt,
    };
  }
}