import {
  Controller,
  Post,
  Get,
  Put,
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
    description: 'Generate authorization URL for Google Sheets integration',
  })
  @ApiResponse({
    status: 200,
    description: 'Authorization URL generated successfully',
  })
  @ApiResponse({
    status: 400,
    description: 'Google Sheets OAuth2 not configured or connection already exists',
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