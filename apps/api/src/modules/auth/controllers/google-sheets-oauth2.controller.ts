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
import { GoogleSheetsOrderService } from '../services/google-sheets-order.service';
import { QueueIntegrationService } from '../../queue-integration/services/queue-integration.service';
import { UserRole, PlatformType, ConnectionStatus } from '@prisma/client';
import {
  CreateOrderSheetDto,
  EnableOrderSyncDto,
  TriggerManualSyncDto,
  UpdateOrderSyncConfigDto,
  OrderSheetResponseDto,
} from '../../../common/dto/google-sheets-order-sync.dto';

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

@ApiTags('Google Sheets OAuth2')
@Controller('auth/oauth2/google-sheets')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class GoogleSheetsOAuth2Controller {
  private readonly logger = new Logger(GoogleSheetsOAuth2Controller.name);

  constructor(
    private readonly googleSheetsService: GoogleSheetsOAuth2Service,
    private readonly googleSheetsOrderService: GoogleSheetsOrderService,
    private readonly queueIntegrationService: QueueIntegrationService,
    private readonly prismaService: PrismaService,
  ) { }

  @Post('initiate')
  @ApiOperation({
    summary: 'Initiate Google Sheets OAuth2 authorization',
    description: 'Generate authorization URL for Google Sheets integration',
  })
  @ApiResponse({
    status: 200,
    description: 'Authorization URL generated successfully',
  })
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.TEAM_LEADER, UserRole.CLIENT_ADMIN)
  async initiateGoogleAuthorization(
    @Body() _dto: InitiateGoogleAuthDto,
    @CurrentUser() user: any,
  ): Promise<GoogleAuthorizationResponseDto> {
    try {
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
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.TEAM_LEADER, UserRole.CLIENT_ADMIN)
  async completeGoogleAuthorization(
    @Body() dto: CompleteGoogleAuthDto,
    @CurrentUser() user: any,
  ): Promise<GoogleConnectionResponseDto> {
    try {
      if (dto.error) {
        throw new BadRequestException(`Google authorization failed: ${dto.error_description || dto.error}`);
      }

      const { connectionId } = await this.googleSheetsService.completeGoogleAuthorization(
        dto.code,
        dto.state,
        user.id,
        user.organizationId,
      );

      const connection = await this.prismaService.platformConnection.findUnique({
        where: { id: connectionId },
      });

      return this.mapConnectionToDto(connection);
    } catch (error) {
      this.logger.error('Failed to complete Google Sheets OAuth2 flow', {
        error: error.message,
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
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.TEAM_LEADER, UserRole.CLIENT_ADMIN, UserRole.CLIENT_USER)
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
      const connection = await this.prismaService.platformConnection.findFirst({
        where: {
          id,
          organizationId: user.organizationId,
          platformType: PlatformType.GOOGLE_SHEETS,
          ...(![UserRole.ADMIN, UserRole.CLIENT_ADMIN].includes(user.role) && { userId: user.id }),
        },
      });

      if (!connection) {
        throw new NotFoundException('Google Sheets connection not found');
      }

      const testResult = await this.googleSheetsService.testGoogleSheetsConnection(id);

      return {
        success: testResult.success,
        error: testResult.error,
        details: testResult.details,
        testedAt: new Date(),
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        testedAt: new Date(),
      };
    }
  }

  @Get('connections/:id/connected-spreadsheets')
  @ApiOperation({
    summary: 'Get connected spreadsheets',
    description: 'Get all spreadsheets connected to this Google Sheets connection',
  })
  @ApiParam({ name: 'id', description: 'Connection ID' })
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.TEAM_LEADER, UserRole.CLIENT_ADMIN, UserRole.CLIENT_USER)
  async getConnectedSpreadsheets(
    @Param('id') id: string,
    @CurrentUser() user: any,
  ): Promise<{
    spreadsheets: any[];
    count: number;
  }> {
    try {
      const connection = await this.prismaService.platformConnection.findFirst({
        where: {
          id,
          organizationId: user.organizationId,
          platformType: PlatformType.GOOGLE_SHEETS,
          ...(![UserRole.ADMIN, UserRole.CLIENT_ADMIN].includes(user.role) && { userId: user.id }),
        },
      });

      if (!connection) {
        throw new NotFoundException('Google Sheets connection not found');
      }

      const result = await this.googleSheetsService.getConnectedSpreadsheets(id);

      return {
        spreadsheets: result.spreadsheets,
        count: result.spreadsheets.length,
      };
    } catch (error) {
      this.logger.error('Failed to get connected spreadsheets', {
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
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.TEAM_LEADER, UserRole.CLIENT_ADMIN)
  async connectToSpreadsheet(
    @Param('id') id: string,
    @Body() body: { spreadsheetId: string },
    @CurrentUser() user: any,
  ): Promise<{
    spreadsheet: any;
    connection: any;
  }> {
    try {
      const connection = await this.prismaService.platformConnection.findFirst({
        where: {
          id,
          organizationId: user.organizationId,
          platformType: PlatformType.GOOGLE_SHEETS,
          status: ConnectionStatus.ACTIVE,
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

  @Delete('connections/:id/spreadsheets/:spreadsheetId/disconnect')
  @ApiOperation({
    summary: 'Disconnect from specific spreadsheet',
    description: 'Disconnect from a specific spreadsheet while keeping the connection active',
  })
  @ApiParam({ name: 'id', description: 'Connection ID' })
  @ApiParam({ name: 'spreadsheetId', description: 'Spreadsheet ID' })
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.TEAM_LEADER, UserRole.CLIENT_ADMIN)
  async disconnectFromSpecificSpreadsheet(
    @Param('id') id: string,
    @Param('spreadsheetId') spreadsheetId: string,
    @CurrentUser() user: any,
  ): Promise<{ success: boolean }> {
    try {
      const connection = await this.prismaService.platformConnection.findFirst({
        where: {
          id,
          organizationId: user.organizationId,
          platformType: PlatformType.GOOGLE_SHEETS,
          ...(![UserRole.ADMIN, UserRole.CLIENT_ADMIN].includes(user.role) && { userId: user.id }),
        },
      });

      if (!connection) {
        throw new NotFoundException('Google Sheets connection not found');
      }

      await this.googleSheetsService.disconnectFromSpreadsheet(id, spreadsheetId);

      return { success: true };
    } catch (error) {
      this.logger.error('Failed to disconnect from specific spreadsheet', {
        error: error.message,
        connectionId: id,
        spreadsheetId,
        userId: user.id,
      });
      throw error;
    }
  }

  @Post('connections/:id/create-orders-spreadsheet')
  @ApiOperation({
    summary: 'Create Orders spreadsheet',
    description: 'Create a new spreadsheet with predefined Orders template',
  })
  @ApiParam({ name: 'id', description: 'Connection ID' })
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.TEAM_LEADER, UserRole.CLIENT_ADMIN)
  async createOrdersSpreadsheet(
    @Param('id') id: string,
    @Body() body: { name: string },
    @CurrentUser() user: any,
  ): Promise<{
    spreadsheetId: string;
    spreadsheetUrl: string;
    title: string;
  }> {
    try {
      const connection = await this.prismaService.platformConnection.findFirst({
        where: {
          id,
          organizationId: user.organizationId,
          platformType: PlatformType.GOOGLE_SHEETS,
          status: ConnectionStatus.ACTIVE,
          ...(![UserRole.ADMIN, UserRole.CLIENT_ADMIN].includes(user.role) && { userId: user.id }),
        },
      });

      if (!connection) {
        throw new NotFoundException('Active Google Sheets connection not found');
      }

      const result = await this.googleSheetsService.createOrdersSpreadsheet(id, body.name);

      if (!result.success) {
        throw new BadRequestException(result.error);
      }

      return {
        spreadsheetId: result.spreadsheet!.id,
        spreadsheetUrl: result.spreadsheet!.webViewLink,
        title: result.spreadsheet!.name,
      };
    } catch (error) {
      this.logger.error('Failed to create Orders spreadsheet', {
        error: error.message,
        connectionId: id,
        name: body.name,
        userId: user.id,
      });
      throw error;
    }
  }

  @Get('connections/:id/available-spreadsheets')
  @ApiOperation({
    summary: 'List available spreadsheets',
    description: 'Get list of available spreadsheets that can be connected',
  })
  @ApiParam({ name: 'id', description: 'Connection ID' })
  @ApiQuery({ name: 'pageSize', required: false, type: Number })
  @ApiQuery({ name: 'pageToken', required: false, type: String })
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.TEAM_LEADER, UserRole.CLIENT_ADMIN, UserRole.CLIENT_USER)
  async listAvailableSpreadsheets(
    @Param('id') id: string,
    @CurrentUser() user: any,
    @Query('pageSize') pageSize: number = 20,
    @Query('pageToken') pageToken?: string,
  ): Promise<any> {
    try {
      const connection = await this.prismaService.platformConnection.findFirst({
        where: {
          id,
          organizationId: user.organizationId,
          platformType: PlatformType.GOOGLE_SHEETS,
          status: ConnectionStatus.ACTIVE,
          ...(![UserRole.ADMIN, UserRole.CLIENT_ADMIN].includes(user.role) && { userId: user.id }),
        },
      });

      if (!connection) {
        throw new NotFoundException('Active Google Sheets connection not found');
      }

      const result = await this.googleSheetsService.listSpreadsheets(id, pageSize, pageToken);
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
    summary: 'Add existing spreadsheet',
    description: 'Add an existing spreadsheet to the connection by URL or ID',
  })
  @ApiParam({ name: 'id', description: 'Connection ID' })
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.TEAM_LEADER, UserRole.CLIENT_ADMIN)
  async addExistingSpreadsheet(
    @Param('id') id: string,
    @Body() body: { spreadsheetUrl: string },
    @CurrentUser() user: any,
  ): Promise<any> {
    try {
      const connection = await this.prismaService.platformConnection.findFirst({
        where: {
          id,
          organizationId: user.organizationId,
          platformType: PlatformType.GOOGLE_SHEETS,
          status: ConnectionStatus.ACTIVE,
          ...(![UserRole.ADMIN, UserRole.CLIENT_ADMIN].includes(user.role) && { userId: user.id }),
        },
      });

      if (!connection) {
        throw new NotFoundException('Active Google Sheets connection not found');
      }

      const spreadsheetId = this.googleSheetsService.extractSpreadsheetId(body.spreadsheetUrl);

      if (!spreadsheetId) {
        throw new BadRequestException('Invalid Google Sheets URL');
      }

      const result = await this.googleSheetsService.addExistingSpreadsheet(id, spreadsheetId);

      if (!result.success) {
        throw new BadRequestException(result.error);
      }

      await this.googleSheetsService.connectToSpreadsheet(id, spreadsheetId);

      return {
        success: true,
        spreadsheet: result.spreadsheet,
      };
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

  @Get('connections')
  @ApiOperation({
    summary: 'List Google Sheets connections',
    description: 'Get all Google Sheets connections for the organization',
  })
  @ApiQuery({ name: 'status', required: false, enum: ConnectionStatus })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.TEAM_LEADER, UserRole.CLIENT_ADMIN, UserRole.CLIENT_USER)
  async listGoogleConnections(
    @Query('status') status: ConnectionStatus | undefined,
    @Query('page') page: number,
    @Query('limit') limit: number,
    @CurrentUser() user: any,
  ): Promise<{
    connections: GoogleConnectionResponseDto[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
    try {
      // Set defaults and limit maximum page size
      const currentPage = page || 1;
      const currentLimit = limit || 10;
      const maxLimit = Math.min(currentLimit, 50);
      const skip = (currentPage - 1) * maxLimit;

      const where: any = {
        organizationId: user.organizationId,
        platformType: PlatformType.GOOGLE_SHEETS,
      };

      if (status) {
        where.status = status;
      }

      // Non-admin users can only see their own connections
      if (![UserRole.ADMIN, UserRole.CLIENT_ADMIN].includes(user.role)) {
        where.userId = user.id;
      }

      const [connections, total] = await Promise.all([
        this.prismaService.platformConnection.findMany({
          where,
          skip,
          take: maxLimit,
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
        page: currentPage,
        limit: maxLimit,
        totalPages: Math.ceil(total / maxLimit),
      };
    } catch (error) {
      this.logger.error('Failed to list Google connections', {
        error: error.message,
        userId: user.id,
      });
      throw error;
    }
  }

  @Get('connections/:id')
  @ApiOperation({
    summary: 'Get Google Sheets connection',
    description: 'Get a specific Google Sheets connection by ID',
  })
  @ApiParam({ name: 'id', description: 'Connection ID' })
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.TEAM_LEADER, UserRole.CLIENT_ADMIN, UserRole.CLIENT_USER)
  async getGoogleConnection(
    @Param('id') id: string,
    @CurrentUser() user: any,
  ): Promise<GoogleConnectionResponseDto> {
    try {
      const where: any = {
        id,
        organizationId: user.organizationId,
        platformType: PlatformType.GOOGLE_SHEETS,
      };

      // Non-admin users can only see their own connections
      if (![UserRole.ADMIN, UserRole.CLIENT_ADMIN].includes(user.role)) {
        where.userId = user.id;
      }

      const connection = await this.prismaService.platformConnection.findFirst({
        where,
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
      this.logger.error('Failed to get Google connection', {
        error: error.message,
        connectionId: id,
        userId: user.id,
      });
      throw error;
    }
  }

  @Post('connections/:id/spreadsheets')
  @ApiOperation({
    summary: 'Create new spreadsheet',
    description: 'Create a new Google Sheets spreadsheet',
  })
  @ApiParam({ name: 'id', description: 'Connection ID' })
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.TEAM_LEADER, UserRole.CLIENT_ADMIN)
  async createSpreadsheet(
    @Param('id') id: string,
    @Body() dto: { title: string; sheets?: any[] },
    @CurrentUser() user: any,
  ): Promise<any> {
    try {
      const where: any = {
        id,
        organizationId: user.organizationId,
        platformType: PlatformType.GOOGLE_SHEETS,
        status: ConnectionStatus.ACTIVE,
      };

      // Non-admin users can only use their own connections
      if (![UserRole.ADMIN, UserRole.CLIENT_ADMIN].includes(user.role)) {
        where.userId = user.id;
      }

      const connection = await this.prismaService.platformConnection.findFirst({
        where,
      });

      if (!connection) {
        throw new NotFoundException('Active Google Sheets connection not found');
      }

      const accessToken = await this.googleSheetsService['oauth2Service'].getAccessToken(id);
      const result = await this.googleSheetsService.createSpreadsheet(
        accessToken,
        dto.title,
        dto.sheets,
      );

      return result;
    } catch (error) {
      this.logger.error('Failed to create spreadsheet', {
        error: error.message,
        connectionId: id,
        userId: user.id,
      });
      throw error;
    }
  }

  @Get('connections/:id/spreadsheets/:spreadsheetId/values')
  @ApiOperation({
    summary: 'Get spreadsheet values',
    description: 'Get values from a specific range in a spreadsheet',
  })
  @ApiParam({ name: 'id', description: 'Connection ID' })
  @ApiParam({ name: 'spreadsheetId', description: 'Spreadsheet ID' })
  @ApiQuery({ name: 'range', required: true, type: String })
  @ApiQuery({ name: 'majorDimension', required: false, type: String })
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.TEAM_LEADER, UserRole.CLIENT_ADMIN, UserRole.CLIENT_USER)
  async getSpreadsheetValues(
    @Param('id') id: string,
    @Param('spreadsheetId') spreadsheetId: string,
    @Query() query: { range: string; majorDimension?: string },
    @CurrentUser() user: any,
  ): Promise<{ values: any[][] }> {
    try {
      const where: any = {
        id,
        organizationId: user.organizationId,
        platformType: PlatformType.GOOGLE_SHEETS,
        status: ConnectionStatus.ACTIVE,
      };

      // Non-admin users can only use their own connections
      if (![UserRole.ADMIN, UserRole.CLIENT_ADMIN].includes(user.role)) {
        where.userId = user.id;
      }

      const connection = await this.prismaService.platformConnection.findFirst({
        where,
      });

      if (!connection) {
        throw new NotFoundException('Active Google Sheets connection not found');
      }

      const accessToken = await this.googleSheetsService['oauth2Service'].getAccessToken(id);
      const values = await this.googleSheetsService.getSpreadsheetValues(
        accessToken,
        spreadsheetId,
        query.range,
      );

      return { values };
    } catch (error) {
      this.logger.error('Failed to get spreadsheet values', {
        error: error.message,
        connectionId: id,
        spreadsheetId,
        userId: user.id,
      });
      throw error;
    }
  }

  @Put('connections/:id/spreadsheets/:spreadsheetId/values')
  @ApiOperation({
    summary: 'Update spreadsheet values',
    description: 'Update values in a specific range of a spreadsheet',
  })
  @ApiParam({ name: 'id', description: 'Connection ID' })
  @ApiParam({ name: 'spreadsheetId', description: 'Spreadsheet ID' })
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.TEAM_LEADER, UserRole.CLIENT_ADMIN)
  async updateSpreadsheetValues(
    @Param('id') id: string,
    @Param('spreadsheetId') spreadsheetId: string,
    @Body() dto: { range: string; values: any[][]; valueInputOption?: string },
    @CurrentUser() user: any,
  ): Promise<any> {
    try {
      const where: any = {
        id,
        organizationId: user.organizationId,
        platformType: PlatformType.GOOGLE_SHEETS,
        status: ConnectionStatus.ACTIVE,
      };

      // Non-admin users can only use their own connections
      if (![UserRole.ADMIN, UserRole.CLIENT_ADMIN].includes(user.role)) {
        where.userId = user.id;
      }

      const connection = await this.prismaService.platformConnection.findFirst({
        where,
      });

      if (!connection) {
        throw new NotFoundException('Active Google Sheets connection not found');
      }

      const accessToken = await this.googleSheetsService['oauth2Service'].getAccessToken(id);
      const result = await this.googleSheetsService.updateSpreadsheetValues(
        accessToken,
        spreadsheetId,
        dto.range,
        dto.values,
      );

      return result;
    } catch (error) {
      this.logger.error('Failed to update spreadsheet values', {
        error: error.message,
        connectionId: id,
        spreadsheetId,
        userId: user.id,
      });
      throw error;
    }
  }

  @Post('connections/:id/spreadsheets/:spreadsheetId/values:append')
  @ApiOperation({
    summary: 'Append spreadsheet values',
    description: 'Append values to a spreadsheet',
  })
  @ApiParam({ name: 'id', description: 'Connection ID' })
  @ApiParam({ name: 'spreadsheetId', description: 'Spreadsheet ID' })
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.TEAM_LEADER, UserRole.CLIENT_ADMIN)
  async appendSpreadsheetValues(
    @Param('id') id: string,
    @Param('spreadsheetId') spreadsheetId: string,
    @Body() dto: { range: string; values: any[][]; valueInputOption?: string },
    @CurrentUser() user: any,
  ): Promise<any> {
    try {
      const where: any = {
        id,
        organizationId: user.organizationId,
        platformType: PlatformType.GOOGLE_SHEETS,
        status: ConnectionStatus.ACTIVE,
      };

      // Non-admin users can only use their own connections
      if (![UserRole.ADMIN, UserRole.CLIENT_ADMIN].includes(user.role)) {
        where.userId = user.id;
      }

      const connection = await this.prismaService.platformConnection.findFirst({
        where,
      });

      if (!connection) {
        throw new NotFoundException('Active Google Sheets connection not found');
      }

      const accessToken = await this.googleSheetsService['oauth2Service'].getAccessToken(id);
      const result = await this.googleSheetsService.appendSpreadsheetValues(
        accessToken,
        spreadsheetId,
        dto.range,
        dto.values,
      );

      return result;
    } catch (error) {
      this.logger.error('Failed to append spreadsheet values', {
        error: error.message,
        connectionId: id,
        spreadsheetId,
        userId: user.id,
      });
      throw error;
    }
  }

  @Post('connections/:id/spreadsheets/:spreadsheetId:batchUpdate')
  @ApiOperation({
    summary: 'Batch update spreadsheet',
    description: 'Perform batch updates on a spreadsheet',
  })
  @ApiParam({ name: 'id', description: 'Connection ID' })
  @ApiParam({ name: 'spreadsheetId', description: 'Spreadsheet ID' })
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.TEAM_LEADER, UserRole.CLIENT_ADMIN)
  async batchUpdateSpreadsheet(
    @Param('id') id: string,
    @Param('spreadsheetId') spreadsheetId: string,
    @Body() dto: { requests: any[] },
    @CurrentUser() user: any,
  ): Promise<any> {
    try {
      const where: any = {
        id,
        organizationId: user.organizationId,
        platformType: PlatformType.GOOGLE_SHEETS,
        status: ConnectionStatus.ACTIVE,
      };

      // Non-admin users can only use their own connections
      if (![UserRole.ADMIN, UserRole.CLIENT_ADMIN].includes(user.role)) {
        where.userId = user.id;
      }

      const connection = await this.prismaService.platformConnection.findFirst({
        where,
      });

      if (!connection) {
        throw new NotFoundException('Active Google Sheets connection not found');
      }

      const accessToken = await this.googleSheetsService['oauth2Service'].getAccessToken(id);
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
        userId: user.id,
      });
      throw error;
    }
  }

  @Get('accounts')
  @ApiOperation({
    summary: 'List connected Google accounts',
    description: 'Get all connected Google accounts for the current user',
  })
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.TEAM_LEADER, UserRole.CLIENT_ADMIN, UserRole.CLIENT_USER)
  async listConnectedGoogleAccounts(
    @CurrentUser() user: any,
  ): Promise<{
    accounts: any[];
    count: number;
  }> {
    try {
      const accounts = await this.googleSheetsService.listConnectedGoogleAccounts(
        user.id,
        user.organizationId,
      );

      return {
        accounts,
        count: accounts.length,
      };
    } catch (error) {
      this.logger.error('Failed to list connected Google accounts', {
        error: error.message,
        userId: user.id,
      });
      throw error;
    }
  }

  @Post('accounts/:email/switch')
  @ApiOperation({
    summary: 'Switch to specific Google account',
    description: 'Switch to a specific Google account for operations',
  })
  @ApiParam({ name: 'email', description: 'Google account email' })
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.TEAM_LEADER, UserRole.CLIENT_ADMIN)
  async switchToGoogleAccount(
    @Param('email') email: string,
    @CurrentUser() user: any,
  ): Promise<{
    connectionId: string;
    email: string;
  }> {
    try {
      const connectionId = await this.googleSheetsService.switchToGoogleAccount(
        user.id,
        user.organizationId,
        email,
      );

      return {
        connectionId,
        email,
      };
    } catch (error) {
      this.logger.error('Failed to switch to Google account', {
        error: error.message,
        userId: user.id,
        email,
      });
      throw error;
    }
  }

  // ===== ORDER SHEET MANAGEMENT ENDPOINTS =====

  @Post('connections/:id/order-sheets')
  @ApiOperation({
    summary: 'Create order sheet',
    description: 'Create a new order sheet with predefined template for order sync',
  })
  @ApiParam({ name: 'id', description: 'Connection ID' })
  @ApiResponse({
    status: 201,
    description: 'Order sheet created successfully',
  })
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.TEAM_LEADER, UserRole.CLIENT_ADMIN)
  async createOrderSheet(
    @Param('id') connectionId: string,
    @Body() dto: {
      name: string;
      config?: {
        columnMapping?: any;
        headerRow?: number;
        dataStartRow?: number;
        sheetName?: string;
        autoSync?: boolean;
        duplicateHandling?: 'skip' | 'flag' | 'create';
        validationRules?: any;
      };
    },
    @CurrentUser() user: any,
  ): Promise<{
    spreadsheetId: string;
    spreadsheetName: string;
    webViewLink: string;
    connectionId: string;
    isOrderSyncEnabled: boolean;
    lastSyncRow: number;
    totalOrders: number;
  }> {
    try {
      // Verify connection ownership
      const connection = await this.validateConnectionAccess(connectionId, user);

      const result = await this.googleSheetsOrderService.createOrderSheet(connectionId, {
        name: dto.name,
        config: dto.config,
      });

      this.logger.log('Order sheet created successfully', {
        connectionId,
        spreadsheetId: result.spreadsheetId,
        userId: user.id,
      });

      return result;
    } catch (error) {
      this.logger.error('Failed to create order sheet', {
        error: error.message,
        connectionId,
        userId: user.id,
      });
      throw error;
    }
  }

  @Post('connections/:id/order-sync/enable')
  @ApiOperation({
    summary: 'Enable order sync on existing spreadsheet',
    description: 'Enable order synchronization on an existing spreadsheet',
  })
  @ApiParam({ name: 'id', description: 'Connection ID' })
  @ApiResponse({
    status: 200,
    description: 'Order sync enabled successfully',
  })
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.TEAM_LEADER, UserRole.CLIENT_ADMIN)
  async enableOrderSync(
    @Param('id') connectionId: string,
    @Body() dto: {
      spreadsheetId: string;
      sheetName?: string;
      enableWebhook?: boolean;
      config?: {
        columnMapping?: any;
        headerRow?: number;
        dataStartRow?: number;
        autoSync?: boolean;
        duplicateHandling?: 'skip' | 'flag' | 'create';
        validationRules?: any;
      };
    },
    @CurrentUser() user: any,
  ): Promise<{
    spreadsheetId: string;
    spreadsheetName: string;
    webViewLink: string;
    connectionId: string;
    isOrderSyncEnabled: boolean;
    webhookSubscriptionId?: string;
    lastSyncRow: number;
    totalOrders: number;
  }> {
    try {
      // Verify connection ownership
      await this.validateConnectionAccess(connectionId, user);

      const result = await this.googleSheetsOrderService.enableOrderSync(connectionId, {
        spreadsheetId: dto.spreadsheetId,
        sheetName: dto.sheetName,
        enableWebhook: dto.enableWebhook,
        config: dto.config,
      });

      this.logger.log('Order sync enabled successfully', {
        connectionId,
        spreadsheetId: dto.spreadsheetId,
        userId: user.id,
      });

      return result;
    } catch (error) {
      this.logger.error('Failed to enable order sync', {
        error: error.message,
        connectionId,
        spreadsheetId: dto.spreadsheetId,
        userId: user.id,
      });
      throw error;
    }
  }

  @Get('connections/:id/order-sheets')
  @ApiOperation({
    summary: 'List order sheets',
    description: 'Get all order sheets configured for this connection',
  })
  @ApiParam({ name: 'id', description: 'Connection ID' })
  @ApiResponse({
    status: 200,
    description: 'Order sheets retrieved successfully',
  })
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.TEAM_LEADER, UserRole.CLIENT_ADMIN, UserRole.CLIENT_USER)
  async listOrderSheets(
    @Param('id') connectionId: string,
    @CurrentUser() user: any,
  ): Promise<{
    orderSheets: Array<{
      spreadsheetId: string;
      spreadsheetName: string;
      webViewLink: string;
      isOrderSyncEnabled: boolean;
      lastSyncAt?: Date;
      totalOrders: number;
      config: {
        webhookEnabled: boolean;
        columnMapping: Record<string, string>;
      };
    }>;
    count: number;
  }> {
    try {
      // Verify connection ownership
      await this.validateConnectionAccess(connectionId, user);

      // Get all spreadsheet connections with order sync enabled
      const spreadsheetConnections = await this.prismaService.spreadsheetConnection.findMany({
        where: {
          connectionId,
          isOrderSync: true,
        },
        orderBy: { createdAt: 'desc' },
      });

      const orderSheets = await Promise.all(
        spreadsheetConnections.map(async (conn) => {
          // Get sync statistics
          const syncStats = await this.prismaService.syncOperation.aggregate({
            where: {
              connectionId,
              spreadsheetId: conn.spreadsheetId,
            },
            _sum: {
              ordersCreated: true,
            },
          });

          // Check if webhook is enabled
          const webhookSubscription = await this.prismaService.webhookSubscription.findFirst({
            where: {
              connectionId,
              spreadsheetId: conn.spreadsheetId,
              isActive: true,
            },
          });

          return {
            spreadsheetId: conn.spreadsheetId,
            spreadsheetName: conn.spreadsheetName,
            webViewLink: conn.webViewLink || '',
            isOrderSyncEnabled: conn.isOrderSync,
            lastSyncAt: conn.lastSyncAt,
            totalOrders: syncStats._sum.ordersCreated || 0,
            config: {
              webhookEnabled: !!webhookSubscription,
              columnMapping: conn.orderSyncConfig ? (conn.orderSyncConfig as any).columnMapping : {},
            },
          };
        })
      );

      return {
        orderSheets,
        count: orderSheets.length,
      };
    } catch (error) {
      this.logger.error('Failed to list order sheets', {
        error: error.message,
        connectionId,
        userId: user.id,
      });
      throw error;
    }
  }

  @Get('connections/:id/order-sheets/:spreadsheetId')
  @ApiOperation({
    summary: 'Get order sheet info',
    description: 'Get detailed information about a specific order sheet',
  })
  @ApiParam({ name: 'id', description: 'Connection ID' })
  @ApiParam({ name: 'spreadsheetId', description: 'Spreadsheet ID' })
  @ApiResponse({
    status: 200,
    description: 'Order sheet information retrieved successfully',
  })
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.TEAM_LEADER, UserRole.CLIENT_ADMIN, UserRole.CLIENT_USER)
  async getOrderSheetInfo(
    @Param('id') connectionId: string,
    @Param('spreadsheetId') spreadsheetId: string,
    @CurrentUser() user: any,
  ): Promise<{
    spreadsheetId: string;
    spreadsheetName: string;
    webViewLink: string;
    connectionId: string;
    isOrderSyncEnabled: boolean;
    webhookSubscriptionId?: string;
    lastSyncAt?: Date;
    lastSyncRow: number;
    totalOrders: number;
    orderSyncConfig?: any;
  }> {
    try {
      // Verify connection ownership
      await this.validateConnectionAccess(connectionId, user);

      const result = await this.googleSheetsOrderService.getOrderSheetInfo(
        connectionId,
        spreadsheetId
      );

      return result;
    } catch (error) {
      this.logger.error('Failed to get order sheet info', {
        error: error.message,
        connectionId,
        spreadsheetId,
        userId: user.id,
      });
      throw error;
    }
  }

  @Put('connections/:id/order-sheets/:spreadsheetId/config')
  @ApiOperation({
    summary: 'Update order sync configuration',
    description: 'Update the order sync configuration for a specific spreadsheet',
  })
  @ApiParam({ name: 'id', description: 'Connection ID' })
  @ApiParam({ name: 'spreadsheetId', description: 'Spreadsheet ID' })
  @ApiResponse({
    status: 200,
    description: 'Order sync configuration updated successfully',
  })
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.TEAM_LEADER, UserRole.CLIENT_ADMIN)
  async updateOrderSyncConfig(
    @Param('id') connectionId: string,
    @Param('spreadsheetId') spreadsheetId: string,
    @Body() dto: {
      columnMapping?: any;
      headerRow?: number;
      dataStartRow?: number;
      sheetName?: string;
      autoSync?: boolean;
      duplicateHandling?: 'skip' | 'flag' | 'create';
      validationRules?: any;
    },
    @CurrentUser() user: any,
  ): Promise<{
    spreadsheetId: string;
    spreadsheetName: string;
    webViewLink: string;
    connectionId: string;
    isOrderSyncEnabled: boolean;
    webhookSubscriptionId?: string;
    lastSyncAt?: Date;
    lastSyncRow: number;
    totalOrders: number;
  }> {
    try {
      // Verify connection ownership
      await this.validateConnectionAccess(connectionId, user);

      const result = await this.googleSheetsOrderService.updateOrderSyncConfig(
        connectionId,
        spreadsheetId,
        dto
      );

      this.logger.log('Order sync configuration updated successfully', {
        connectionId,
        spreadsheetId,
        userId: user.id,
      });

      return result;
    } catch (error) {
      this.logger.error('Failed to update order sync config', {
        error: error.message,
        connectionId,
        spreadsheetId,
        userId: user.id,
      });
      throw error;
    }
  }

  @Delete('connections/:id/order-sheets/:spreadsheetId')
  @ApiOperation({
    summary: 'Disable order sync',
    description: 'Disable order synchronization for a specific spreadsheet',
  })
  @ApiParam({ name: 'id', description: 'Connection ID' })
  @ApiParam({ name: 'spreadsheetId', description: 'Spreadsheet ID' })
  @ApiResponse({
    status: 200,
    description: 'Order sync disabled successfully',
  })
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.TEAM_LEADER, UserRole.CLIENT_ADMIN)
  async disableOrderSync(
    @Param('id') connectionId: string,
    @Param('spreadsheetId') spreadsheetId: string,
    @CurrentUser() user: any,
  ): Promise<{ success: boolean }> {
    try {
      // Verify connection ownership
      await this.validateConnectionAccess(connectionId, user);

      // Update spreadsheet connection to disable order sync
      await this.prismaService.spreadsheetConnection.updateMany({
        where: {
          connectionId,
          spreadsheetId,
        },
        data: {
          isOrderSync: false,
          updatedAt: new Date(),
        },
      });

      // Deactivate webhook subscription if exists
      await this.prismaService.webhookSubscription.updateMany({
        where: {
          connectionId,
          spreadsheetId,
        },
        data: {
          isActive: false,
          updatedAt: new Date(),
        },
      });

      this.logger.log('Order sync disabled successfully', {
        connectionId,
        spreadsheetId,
        userId: user.id,
      });

      return { success: true };
    } catch (error) {
      this.logger.error('Failed to disable order sync', {
        error: error.message,
        connectionId,
        spreadsheetId,
        userId: user.id,
      });
      throw error;
    }
  }

  @Post('connections/:id/order-sheets/:spreadsheetId/sync')
  @ApiOperation({
    summary: 'Trigger manual sync',
    description: 'Manually trigger order synchronization for a specific spreadsheet',
  })
  @ApiParam({ name: 'id', description: 'Connection ID' })
  @ApiParam({ name: 'spreadsheetId', description: 'Spreadsheet ID' })
  @ApiResponse({
    status: 200,
    description: 'Manual sync triggered successfully',
  })
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.TEAM_LEADER, UserRole.CLIENT_ADMIN)
  async triggerManualSync(
    @Param('id') connectionId: string,
    @Param('spreadsheetId') spreadsheetId: string,
    @Body() dto: {
      startRow?: number;
      endRow?: number;
      forceResync?: boolean;
    },
    @CurrentUser() user: any,
  ): Promise<{
    operationId: string;
    status: string;
    ordersProcessed: number;
    ordersCreated: number;
    ordersSkipped: number;
    errorCount: number;
    startedAt: Date;
  }> {
    try {
      // Verify connection ownership
      await this.validateConnectionAccess(connectionId, user);

      this.logger.log('Starting direct manual sync (bypassing queue)', {
        connectionId,
        spreadsheetId,
        userId: user.id,
      });

      // BYPASS QUEUE: Do direct sync to avoid Redis issues
      try {
        // First, ensure the spreadsheet is configured for order sync
        const result = await this.googleSheetsOrderService.enableOrderSync(connectionId, {
          spreadsheetId,
          enableWebhook: false, // Disable webhook for now
        });

        this.logger.log('Order sync enabled for spreadsheet', {
          connectionId,
          spreadsheetId,
          result,
        });

        // Now trigger the actual sync with force resync enabled
        const syncResult = await this.googleSheetsOrderService.triggerManualSync(
          connectionId,
          spreadsheetId,
          {
            ...dto,
            forceResync: true, // CRITICAL FIX: Force resync to import orders even if they have reference IDs
          }
        );

        this.logger.log('Direct manual sync completed', {
          connectionId,
          spreadsheetId,
          syncResult,
          userId: user.id,
        });

        return {
          operationId: syncResult.operationId,
          status: syncResult.status === 'pending' ? 'completed' : syncResult.status,
          ordersProcessed: syncResult.ordersProcessed,
          ordersCreated: syncResult.ordersCreated,
          ordersSkipped: syncResult.ordersSkipped,
          errorCount: syncResult.errorCount,
          startedAt: syncResult.startedAt,
        };
      } catch (syncError) {
        this.logger.error('Direct sync failed, trying queue fallback', {
          error: syncError.message,
          connectionId,
          spreadsheetId,
        });

        // Fallback to queue system if direct sync fails
        const jobId = await this.queueIntegrationService.triggerManualSync(
          connectionId,
          user.id,
          user.organizationId,
          spreadsheetId
        );

        return {
          operationId: jobId,
          status: 'queued',
          ordersProcessed: 0,
          ordersCreated: 0,
          ordersSkipped: 0,
          errorCount: 0,
          startedAt: new Date(),
        };
      }
    } catch (error) {
      this.logger.error('Failed to trigger manual sync', {
        error: error.message,
        connectionId,
        spreadsheetId,
        userId: user.id,
      });
      throw error;
    }
  }

  @Get('connections/:id/order-sheets/:spreadsheetId/sync-status')
  @ApiOperation({
    summary: 'Get sync status',
    description: 'Get the current sync status for a specific order sheet',
  })
  @ApiParam({ name: 'id', description: 'Connection ID' })
  @ApiParam({ name: 'spreadsheetId', description: 'Spreadsheet ID' })
  @ApiResponse({
    status: 200,
    description: 'Sync status retrieved successfully',
  })
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.TEAM_LEADER, UserRole.CLIENT_ADMIN, UserRole.CLIENT_USER)
  async getSyncStatus(
    @Param('id') connectionId: string,
    @Param('spreadsheetId') spreadsheetId: string,
    @CurrentUser() user: any,
  ): Promise<{
    connectionId: string;
    spreadsheetId: string;
    isEnabled: boolean;
    lastSyncAt?: Date;
    lastSyncResult?: 'success' | 'partial' | 'failed';
    totalSyncs: number;
    totalOrdersCreated: number;
    totalOrdersSkipped: number;
    totalErrors: number;
    webhookStatus: 'active' | 'expired' | 'failed' | 'none';
    webhookExpiration?: Date;
    recentErrors?: Array<{
      rowNumber: number;
      errorType: string;
      errorMessage: string;
      timestamp: Date;
    }>;
  }> {
    try {
      // Verify connection ownership
      await this.validateConnectionAccess(connectionId, user);

      const result = await this.googleSheetsOrderService.getSyncStatus(
        connectionId,
        spreadsheetId
      );

      return result;
    } catch (error) {
      this.logger.error('Failed to get sync status', {
        error: error.message,
        connectionId,
        spreadsheetId,
        userId: user.id,
      });
      throw error;
    }
  }

  @Get('connections/:id/sync-history')
  @ApiOperation({
    summary: 'Get sync history',
    description: 'Get sync operation history for a connection',
  })
  @ApiParam({ name: 'id', description: 'Connection ID' })
  @ApiQuery({ name: 'spreadsheetId', required: false, type: String })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiResponse({
    status: 200,
    description: 'Sync history retrieved successfully',
  })
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.TEAM_LEADER, UserRole.CLIENT_ADMIN, UserRole.CLIENT_USER)
  async getSyncHistory(
    @Param('id') connectionId: string,
    @CurrentUser() user: any,
    @Query('spreadsheetId') spreadsheetId?: string,
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 20,
  ): Promise<{
    syncOperations: Array<{
      id: string;
      spreadsheetId: string;
      operationType: string;
      status: string;
      ordersProcessed: number;
      ordersCreated: number;
      ordersSkipped: number;
      errorCount: number;
      startedAt: Date;
      completedAt?: Date;
      errorDetails?: any[];
    }>;
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
    try {
      // Verify connection ownership
      await this.validateConnectionAccess(connectionId, user);

      const maxLimit = Math.min(limit, 50);
      const skip = (page - 1) * maxLimit;

      const where: any = { connectionId };
      if (spreadsheetId) {
        where.spreadsheetId = spreadsheetId;
      }

      const [syncOperations, total] = await Promise.all([
        this.prismaService.syncOperation.findMany({
          where,
          skip,
          take: maxLimit,
          orderBy: { startedAt: 'desc' },
        }),
        this.prismaService.syncOperation.count({ where }),
      ]);

      return {
        syncOperations: syncOperations.map(op => ({
          id: op.id,
          spreadsheetId: op.spreadsheetId,
          operationType: op.operationType,
          status: op.status,
          ordersProcessed: op.ordersProcessed,
          ordersCreated: op.ordersCreated,
          ordersSkipped: op.ordersSkipped,
          errorCount: op.errorCount,
          startedAt: op.startedAt,
          completedAt: op.completedAt,
          errorDetails: Array.isArray(op.errorDetails) ? op.errorDetails : [],
        })),
        total,
        page,
        limit: maxLimit,
        totalPages: Math.ceil(total / maxLimit),
      };
    } catch (error) {
      this.logger.error('Failed to get sync history', {
        error: error.message,
        connectionId,
        userId: user.id,
      });
      throw error;
    }
  }



  // ===== TASK 8 SPECIFIC ENDPOINTS =====

  @Get('connections/:id/order-sync/status')
  @ApiOperation({
    summary: 'Get order sync status for connection',
    description: 'Get the overall order sync status for a Google Sheets connection',
  })
  @ApiParam({ name: 'id', description: 'Connection ID' })
  @ApiResponse({
    status: 200,
    description: 'Order sync status retrieved successfully',
  })
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.TEAM_LEADER, UserRole.CLIENT_ADMIN, UserRole.CLIENT_USER)
  async getOrderSyncStatus(
    @Param('id') connectionId: string,
    @CurrentUser() user: any,
  ): Promise<{
    connectionId: string;
    isEnabled: boolean;
    activeSheets: number;
    totalOrdersCreated: number;
    totalOrdersSkipped: number;
    totalErrors: number;
    lastSyncAt?: Date;
    webhookStatus: 'active' | 'expired' | 'failed' | 'none';
    recentActivity: Array<{
      spreadsheetId: string;
      spreadsheetName: string;
      lastSyncAt?: Date;
      status: 'success' | 'partial' | 'failed';
      ordersCreated: number;
      errorCount: number;
    }>;
  }> {
    try {
      // Verify connection ownership
      await this.validateConnectionAccess(connectionId, user);

      // Get all order-enabled spreadsheets for this connection
      const orderSheets = await this.prismaService.spreadsheetConnection.findMany({
        where: {
          connectionId,
          isOrderSync: true,
        },
      });

      // Get overall statistics
      const totalStats = await this.prismaService.syncOperation.aggregate({
        where: { connectionId },
        _sum: {
          ordersCreated: true,
          ordersSkipped: true,
          errorCount: true,
        },
      });

      // Get last sync time
      const lastSync = await this.prismaService.syncOperation.findFirst({
        where: { connectionId },
        orderBy: { startedAt: 'desc' },
      });

      // Check webhook status
      const activeWebhooks = await this.prismaService.webhookSubscription.count({
        where: {
          connectionId,
          isActive: true,
          expiration: { gt: new Date() },
        },
      });

      let webhookStatus: 'active' | 'expired' | 'failed' | 'none' = 'none';
      if (activeWebhooks > 0) {
        webhookStatus = 'active';
      } else {
        const expiredWebhooks = await this.prismaService.webhookSubscription.count({
          where: {
            connectionId,
            expiration: { lt: new Date() },
          },
        });
        if (expiredWebhooks > 0) {
          webhookStatus = 'expired';
        }
      }

      // Get recent sync operations for each sheet
      const recentActivity = [];
      for (const sheet of orderSheets) {
        const lastOperation = await this.prismaService.syncOperation.findFirst({
          where: {
            connectionId,
            spreadsheetId: sheet.spreadsheetId,
          },
          orderBy: { startedAt: 'desc' },
        });

        let status: 'success' | 'partial' | 'failed' = 'success';
        if (lastOperation) {
          if (lastOperation.status === 'failed') {
            status = 'failed';
          } else if (lastOperation.errorCount > 0) {
            status = 'partial';
          }
        }

        recentActivity.push({
          spreadsheetId: sheet.spreadsheetId,
          spreadsheetName: sheet.spreadsheetName || 'Unknown',
          lastSyncAt: lastOperation?.startedAt,
          status,
          ordersCreated: lastOperation?.ordersCreated || 0,
          errorCount: lastOperation?.errorCount || 0,
        });
      }

      return {
        connectionId,
        isEnabled: orderSheets.length > 0,
        activeSheets: orderSheets.length,
        totalOrdersCreated: totalStats._sum.ordersCreated || 0,
        totalOrdersSkipped: totalStats._sum.ordersSkipped || 0,
        totalErrors: totalStats._sum.errorCount || 0,
        lastSyncAt: lastSync?.startedAt,
        webhookStatus,
        recentActivity,
      };
    } catch (error) {
      this.logger.error('Failed to get order sync status', {
        error: error.message,
        connectionId,
        userId: user.id,
      });
      throw error;
    }
  }

  @Post('connections/:id/order-sync/manual-trigger')
  @ApiOperation({
    summary: 'Trigger manual sync for all order sheets',
    description: 'Manually trigger order synchronization for all order sheets in a connection',
  })
  @ApiParam({ name: 'id', description: 'Connection ID' })
  @ApiResponse({
    status: 200,
    description: 'Manual sync triggered successfully',
  })
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.TEAM_LEADER, UserRole.CLIENT_ADMIN)
  async triggerManualSyncForConnection(
    @Param('id') connectionId: string,
    @Body() dto: TriggerManualSyncDto,
    @CurrentUser() user: any,
  ): Promise<{
    connectionId: string;
    triggeredSheets: number;
    operations: Array<{
      spreadsheetId: string;
      operationId: string;
      status: string;
    }>;
  }> {
    try {
      // Verify connection ownership
      await this.validateConnectionAccess(connectionId, user);

      // Get all order-enabled spreadsheets for this connection
      const orderSheets = await this.prismaService.spreadsheetConnection.findMany({
        where: {
          connectionId,
          isOrderSync: true,
        },
      });

      if (orderSheets.length === 0) {
        throw new BadRequestException('No order sheets found for this connection');
      }

      // Trigger sync for each sheet through queue system
      const operations = [];
      for (const sheet of orderSheets) {
        try {
          const jobId = await this.queueIntegrationService.triggerManualSync(
            connectionId,
            user.id,
            user.organizationId,
            sheet.spreadsheetId
          );
          operations.push({
            spreadsheetId: sheet.spreadsheetId,
            operationId: jobId,
            status: 'queued',
          });
        } catch (error) {
          this.logger.error('Failed to queue sync for sheet', {
            error: error.message,
            connectionId,
            spreadsheetId: sheet.spreadsheetId,
          });
          operations.push({
            spreadsheetId: sheet.spreadsheetId,
            operationId: '',
            status: 'failed',
          });
        }
      }

      this.logger.log('Manual sync triggered for connection', {
        connectionId,
        triggeredSheets: operations.length,
        userId: user.id,
      });

      return {
        connectionId,
        triggeredSheets: operations.length,
        operations,
      };
    } catch (error) {
      this.logger.error('Failed to trigger manual sync for connection', {
        error: error.message,
        connectionId,
        userId: user.id,
      });
      throw error;
    }
  }

  @Post('connections/:id/create-order-sheet')
  @ApiOperation({
    summary: 'Create new order sheet',
    description: 'Create a new order sheet with predefined template for order sync',
  })
  @ApiParam({ name: 'id', description: 'Connection ID' })
  @ApiResponse({
    status: 201,
    description: 'Order sheet created successfully',
  })
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.TEAM_LEADER, UserRole.CLIENT_ADMIN)
  async createOrderSheetTask8(
    @Param('id') connectionId: string,
    @Body() dto: CreateOrderSheetDto,
    @CurrentUser() user: any,
  ): Promise<OrderSheetResponseDto> {
    try {
      // Verify connection ownership
      await this.validateConnectionAccess(connectionId, user);

      const result = await this.googleSheetsOrderService.createOrderSheet(
        connectionId,
        dto
      );

      this.logger.log('Order sheet created successfully', {
        connectionId,
        spreadsheetId: result.spreadsheetId,
        name: dto.name,
        userId: user.id,
      });

      return result;
    } catch (error) {
      this.logger.error('Failed to create order sheet', {
        error: error.message,
        connectionId,
        name: dto.name,
        userId: user.id,
      });
      throw error;
    }
  }

  @Put('order-sheets/:sheetId/config')
  @ApiOperation({
    summary: 'Update order sheet configuration',
    description: 'Update the configuration for a specific order sheet',
  })
  @ApiParam({ name: 'sheetId', description: 'Spreadsheet ID' })
  @ApiResponse({
    status: 200,
    description: 'Order sheet configuration updated successfully',
  })
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.TEAM_LEADER, UserRole.CLIENT_ADMIN)
  async updateOrderSheetConfigTask8(
    @Param('sheetId') spreadsheetId: string,
    @Body() dto: UpdateOrderSyncConfigDto,
    @CurrentUser() user: any,
  ): Promise<OrderSheetResponseDto> {
    try {
      // Find the spreadsheet connection and verify ownership
      const spreadsheetConnection = await this.prismaService.spreadsheetConnection.findFirst({
        where: {
          spreadsheetId,
          isOrderSync: true,
          connection: {
            organizationId: user.organizationId,
            platformType: PlatformType.GOOGLE_SHEETS,
            ...(![UserRole.ADMIN, UserRole.CLIENT_ADMIN].includes(user.role) && {
              userId: user.id,
            }),
          },
        },
        include: {
          connection: true,
        },
      });

      if (!spreadsheetConnection) {
        throw new NotFoundException('Order sheet not found or access denied');
      }

      const result = await this.googleSheetsOrderService.updateOrderSyncConfig(
        spreadsheetConnection.connectionId,
        spreadsheetId,
        dto
      );

      this.logger.log('Order sheet configuration updated successfully', {
        connectionId: spreadsheetConnection.connectionId,
        spreadsheetId,
        userId: user.id,
      });

      return result;
    } catch (error) {
      this.logger.error('Failed to update order sheet config', {
        error: error.message,
        spreadsheetId,
        userId: user.id,
      });
      throw error;
    }
  }

  @Delete('order-sheets/:sheetId')
  @ApiOperation({
    summary: 'Delete order sheet',
    description: 'Delete an order sheet and disable order synchronization',
  })
  @ApiParam({ name: 'sheetId', description: 'Spreadsheet ID' })
  @ApiResponse({
    status: 200,
    description: 'Order sheet deleted successfully',
  })
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.TEAM_LEADER, UserRole.CLIENT_ADMIN)
  async deleteOrderSheetTask8(
    @Param('sheetId') spreadsheetId: string,
    @CurrentUser() user: any,
  ): Promise<{ success: boolean }> {
    try {
      // Find the spreadsheet connection and verify ownership
      const spreadsheetConnection = await this.prismaService.spreadsheetConnection.findFirst({
        where: {
          spreadsheetId,
          isOrderSync: true,
          connection: {
            organizationId: user.organizationId,
            platformType: PlatformType.GOOGLE_SHEETS,
            ...(![UserRole.ADMIN, UserRole.CLIENT_ADMIN].includes(user.role) && {
              userId: user.id,
            }),
          },
        },
        include: {
          connection: true,
        },
      });

      if (!spreadsheetConnection) {
        throw new NotFoundException('Order sheet not found or access denied');
      }

      // Disable order sync
      await this.prismaService.spreadsheetConnection.update({
        where: { id: spreadsheetConnection.id },
        data: {
          isOrderSync: false,
          updatedAt: new Date(),
        },
      });

      // Deactivate webhook subscriptions
      await this.prismaService.webhookSubscription.updateMany({
        where: {
          connectionId: spreadsheetConnection.connectionId,
          spreadsheetId,
        },
        data: {
          isActive: false,
          updatedAt: new Date(),
        },
      });

      // Mark sync operations as cancelled
      await this.prismaService.syncOperation.updateMany({
        where: {
          connectionId: spreadsheetConnection.connectionId,
          spreadsheetId,
          status: 'pending',
        },
        data: {
          status: 'failed',
          completedAt: new Date(),
        },
      });

      this.logger.log('Order sheet deleted successfully', {
        connectionId: spreadsheetConnection.connectionId,
        spreadsheetId,
        userId: user.id,
      });

      return { success: true };
    } catch (error) {
      this.logger.error('Failed to delete order sheet', {
        error: error.message,
        spreadsheetId,
        userId: user.id,
      });
      throw error;
    }
  }

  // ===== CONNECTION HEALTH MONITORING =====

  @Get('connections/:id/health')
  @ApiOperation({
    summary: 'Get connection health status',
    description: 'Get comprehensive health status for a Google Sheets connection including order sync capabilities',
  })
  @ApiParam({ name: 'id', description: 'Connection ID' })
  @ApiResponse({
    status: 200,
    description: 'Connection health status retrieved successfully',
  })
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.TEAM_LEADER, UserRole.CLIENT_ADMIN, UserRole.CLIENT_USER)
  async getConnectionHealth(
    @Param('id') connectionId: string,
    @CurrentUser() user: any,
  ): Promise<{
    connectionId: string;
    status: 'healthy' | 'warning' | 'error';
    lastChecked: Date;
    oauth2Status: {
      isValid: boolean;
      tokenExpiry?: Date;
      scopes: string[];
    };
    orderSyncCapability: {
      isEnabled: boolean;
      activeSheets: number;
      lastSyncAt?: Date;
      webhookStatus: 'active' | 'expired' | 'failed' | 'none';
    };
    recentErrors: Array<{
      type: string;
      message: string;
      timestamp: Date;
    }>;
    recommendations: string[];
  }> {
    try {
      // Verify connection ownership
      const connection = await this.validateConnectionAccess(connectionId, user);

      // Test OAuth2 connection
      const testResult = await this.googleSheetsService.testGoogleSheetsConnection(connectionId);

      // Get order sync statistics
      const orderSheetCount = await this.prismaService.spreadsheetConnection.count({
        where: {
          connectionId,
          isOrderSync: true,
        },
      });

      const lastSync = await this.prismaService.syncOperation.findFirst({
        where: { connectionId },
        orderBy: { startedAt: 'desc' },
      });

      // Get webhook status
      const activeWebhooks = await this.prismaService.webhookSubscription.count({
        where: {
          connectionId,
          isActive: true,
          expiration: { gt: new Date() },
        },
      });

      // Get recent errors
      const recentErrors = await this.prismaService.syncOperation.findMany({
        where: {
          connectionId,
          errorCount: { gt: 0 },
        },
        orderBy: { startedAt: 'desc' },
        take: 5,
        select: {
          errorDetails: true,
          startedAt: true,
        },
      });

      // Determine overall health status
      let status: 'healthy' | 'warning' | 'error' = 'healthy';
      const recommendations: string[] = [];

      if (!testResult.success) {
        status = 'error';
        recommendations.push('Reconnect your Google account - authentication has failed');
      } else if (connection.tokenExpiresAt && connection.tokenExpiresAt < new Date()) {
        status = 'warning';
        recommendations.push('Token will expire soon - consider refreshing connection');
      }

      if (orderSheetCount > 0 && activeWebhooks === 0) {
        status = status === 'error' ? 'error' : 'warning';
        recommendations.push('Enable webhooks for real-time sync notifications');
      }

      if (recentErrors.length > 0) {
        status = status === 'error' ? 'error' : 'warning';
        recommendations.push('Review and resolve recent sync errors');
      }

      // Determine webhook status
      let webhookStatus: 'active' | 'expired' | 'failed' | 'none' = 'none';
      if (activeWebhooks > 0) {
        webhookStatus = 'active';
      } else {
        const expiredWebhooks = await this.prismaService.webhookSubscription.count({
          where: {
            connectionId,
            expiration: { lt: new Date() },
          },
        });
        if (expiredWebhooks > 0) {
          webhookStatus = 'expired';
        }
      }

      return {
        connectionId,
        status,
        lastChecked: new Date(),
        oauth2Status: {
          isValid: testResult.success,
          tokenExpiry: connection.tokenExpiresAt,
          scopes: connection.scopes,
        },
        orderSyncCapability: {
          isEnabled: orderSheetCount > 0,
          activeSheets: orderSheetCount,
          lastSyncAt: lastSync?.startedAt,
          webhookStatus,
        },
        recentErrors: recentErrors.flatMap(sync =>
          (sync.errorDetails as any[])?.map(error => ({
            type: error.errorType || 'sync_error',
            message: error.errorMessage || 'Unknown error',
            timestamp: sync.startedAt,
          })) || []
        ).slice(0, 10),
        recommendations,
      };
    } catch (error) {
      this.logger.error('Failed to get connection health', {
        error: error.message,
        connectionId,
        userId: user.id,
      });
      throw error;
    }
  }

  /**
   * Validate connection access for the current user
   */
  private async validateConnectionAccess(connectionId: string, user: any) {
    const where: any = {
      id: connectionId,
      organizationId: user.organizationId,
      platformType: PlatformType.GOOGLE_SHEETS,
    };

    // Non-admin users can only access their own connections
    if (![UserRole.ADMIN, UserRole.CLIENT_ADMIN].includes(user.role)) {
      where.userId = user.id;
    }

    const connection = await this.prismaService.platformConnection.findFirst({
      where,
    });

    if (!connection) {
      throw new NotFoundException('Google Sheets connection not found or access denied');
    }

    if (connection.status !== ConnectionStatus.ACTIVE) {
      throw new BadRequestException('Connection is not active');
    }

    return connection;
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

  /**
   * Set up automatic sync via webhook for a spreadsheet
   */
  @Post('connections/:connectionId/spreadsheets/:spreadsheetId/auto-sync')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'CLIENT_ADMIN', 'CLIENT_USER')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Set up automatic sync via webhook' })
  @ApiParam({ name: 'connectionId', description: 'Platform connection ID' })
  @ApiParam({ name: 'spreadsheetId', description: 'Google Spreadsheet ID' })
  @ApiResponse({ status: 200, description: 'Auto-sync webhook set up successfully' })
  async setupAutoSync(
    @Param('connectionId') connectionId: string,
    @Param('spreadsheetId') spreadsheetId: string,
    @CurrentUser() user: any,
  ) {
    try {
      this.logger.log('Setting up auto-sync webhook', {
        connectionId,
        spreadsheetId,
        userId: user.id,
      });

      // Check if webhook already exists
      const existingWebhook = await this.prismaService.webhookSubscription.findFirst({
        where: {
          connectionId,
          spreadsheetId,
          isActive: true,
        },
      });

      if (existingWebhook) {
        this.logger.log('Webhook already exists for spreadsheet', {
          connectionId,
          spreadsheetId,
          webhookId: existingWebhook.id,
        });
        return {
          success: true,
          message: 'Auto-sync webhook already active',
          webhookId: existingWebhook.id
        };
      }

      // Get access token
      const accessToken = await this.googleSheetsService['oauth2Service'].getAccessToken(connectionId);

      // Set up webhook with Google Drive API
      const webhookUrl = process.env.WEBHOOK_BASE_URL || process.env.API_BASE_URL
        ? `${process.env.WEBHOOK_BASE_URL || process.env.API_BASE_URL}/api/webhooks/google-drive`
        : 'https://your-domain.com/api/webhooks/google-drive';

      let webhookSubscription;
      let webhookResponse = null;

      // Check if we can set up real webhooks (production or accessible URL)
      let canSetupRealWebhook = process.env.NODE_ENV === 'production' &&
        process.env.API_BASE_URL &&
        !process.env.API_BASE_URL.includes('localhost');

      if (canSetupRealWebhook) {
        // Production: Set up real Google Drive webhook
        this.logger.log('Setting up real webhook with Google Drive API', {
          webhookUrl,
          spreadsheetId,
        });

        try {
          webhookResponse = await this.googleSheetsService.setupWebhook(
            accessToken,
            spreadsheetId,
            webhookUrl,
          );

          // Store webhook subscription in database
          webhookSubscription = await this.prismaService.webhookSubscription.create({
            data: {
              connectionId,
              spreadsheetId,
              subscriptionId: webhookResponse.id,
              resourceId: webhookResponse.resourceId,
              expiration: webhookResponse.expiration ? new Date(parseInt(webhookResponse.expiration)) : null,
              isActive: true,
            },
          });

          this.logger.log('Real webhook set up successfully', {
            subscriptionId: webhookResponse.id,
            resourceId: webhookResponse.resourceId,
          });
        } catch (webhookError) {
          this.logger.warn('Failed to set up real webhook, falling back to polling', {
            error: webhookError.message,
            spreadsheetId,
          });
          canSetupRealWebhook = false;
        }
      }

      if (!canSetupRealWebhook) {
        // Development or fallback: Create a mock webhook subscription and use polling
        this.logger.log('Development/fallback mode: Creating mock webhook with polling', {
          spreadsheetId,
          enablePolling: process.env.ENABLE_WEBHOOK_POLLING === 'true',
        });

        webhookSubscription = await this.prismaService.webhookSubscription.create({
          data: {
            connectionId,
            spreadsheetId,
            subscriptionId: `mock-${Date.now()}`,
            resourceId: `mock-resource-${Date.now()}`,
            expiration: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days from now
            isActive: true,
          },
        });

        // In development, use polling to simulate webhooks
        if (process.env.ENABLE_WEBHOOK_POLLING === 'true') {
          this.startPollingForChanges(connectionId, spreadsheetId);
        }
      }

      // Update spreadsheet connection to mark webhook as enabled
      await this.prismaService.spreadsheetConnection.updateMany({
        where: {
          connectionId,
          spreadsheetId,
        },
        data: {
          orderSyncConfig: {
            ...(await this.prismaService.spreadsheetConnection.findFirst({
              where: { connectionId, spreadsheetId },
              select: { orderSyncConfig: true }
            }))?.orderSyncConfig as any || {},
            webhookEnabled: true,
          },
        },
      });

      this.logger.log('Successfully set up auto-sync webhook', {
        connectionId,
        spreadsheetId,
        webhookId: webhookSubscription.id,
        subscriptionId: webhookResponse?.id || 'mock',
        resourceId: webhookResponse?.resourceId || 'mock',
        mode: canSetupRealWebhook ? 'real_webhook' : 'polling',
      });

      return {
        success: true,
        message: canSetupRealWebhook
          ? 'Auto-sync webhook set up successfully'
          : 'Auto-sync enabled with polling (development mode)',
        webhookId: webhookSubscription.id,
        mode: canSetupRealWebhook ? 'webhook' : 'polling',
      };
    } catch (error) {
      this.logger.error('Error setting up auto-sync webhook', {
        error: error.message,
        connectionId,
        spreadsheetId,
        userId: user.id,
      });
      throw new BadRequestException(`Failed to set up auto-sync webhook: ${error.message}`);
    }
  }

  /**
   * Remove automatic sync webhook for a spreadsheet
   */
  @Delete('connections/:connectionId/spreadsheets/:spreadsheetId/auto-sync')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'CLIENT_ADMIN', 'CLIENT_USER')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Remove automatic sync webhook' })
  @ApiParam({ name: 'connectionId', description: 'Platform connection ID' })
  @ApiParam({ name: 'spreadsheetId', description: 'Google Spreadsheet ID' })
  @ApiResponse({ status: 200, description: 'Auto-sync webhook removed successfully' })
  async removeAutoSync(
    @Param('connectionId') connectionId: string,
    @Param('spreadsheetId') spreadsheetId: string,
    @CurrentUser() user: any,
  ) {
    try {
      this.logger.log('Removing auto-sync webhook', {
        connectionId,
        spreadsheetId,
        userId: user.id,
      });

      // Find active webhook
      const webhook = await this.prismaService.webhookSubscription.findFirst({
        where: {
          connectionId,
          spreadsheetId,
          isActive: true,
        },
      });

      if (!webhook) {
        this.logger.log('No active webhook found to remove', {
          connectionId,
          spreadsheetId,
        });
        return {
          success: true,
          message: 'No active webhook found'
        };
      }

      // Check if this was a real webhook or polling
      const isRealWebhook = !webhook.subscriptionId.startsWith('mock-');

      if (isRealWebhook && process.env.NODE_ENV === 'production') {
        // Production: Remove real Google Drive webhook
        try {
          const accessToken = await this.googleSheetsService['oauth2Service'].getAccessToken(connectionId);
          await this.googleSheetsService.removeWebhook(
            accessToken,
            webhook.subscriptionId,
            webhook.resourceId,
          );
          this.logger.log('Removed real webhook from Google Drive', {
            subscriptionId: webhook.subscriptionId,
            resourceId: webhook.resourceId,
          });
        } catch (error) {
          this.logger.warn('Failed to remove webhook from Google Drive', {
            error: error.message,
            subscriptionId: webhook.subscriptionId,
          });
        }
      } else {
        // Development: Stop polling
        const pollingIntervals = (global as any).pollingIntervals;
        const lastModifiedTimes = (global as any).lastModifiedTimes;

        if (pollingIntervals) {
          const intervalKey = `${connectionId}-${spreadsheetId}`;
          const interval = pollingIntervals.get(intervalKey);
          if (interval) {
            clearInterval(interval);
            pollingIntervals.delete(intervalKey);

            // Clean up last modified time tracking
            if (lastModifiedTimes) {
              lastModifiedTimes.delete(`lastModified-${intervalKey}`);
            }

            this.logger.log('Stopped polling for spreadsheet changes', {
              connectionId,
              spreadsheetId,
            });
          }
        }
      }

      // Deactivate webhook in database
      await this.prismaService.webhookSubscription.update({
        where: { id: webhook.id },
        data: { isActive: false },
      });

      // Update spreadsheet connection to mark webhook as disabled
      await this.prismaService.spreadsheetConnection.updateMany({
        where: {
          connectionId,
          spreadsheetId,
        },
        data: {
          orderSyncConfig: {
            ...(await this.prismaService.spreadsheetConnection.findFirst({
              where: { connectionId, spreadsheetId },
              select: { orderSyncConfig: true }
            }))?.orderSyncConfig as any || {},
            webhookEnabled: false,
          },
        },
      });

      this.logger.log('Successfully removed auto-sync webhook', {
        connectionId,
        spreadsheetId,
        webhookId: webhook.id,
      });

      return {
        success: true,
        message: 'Auto-sync webhook removed successfully',
      };
    } catch (error) {
      this.logger.error('Error removing auto-sync webhook', {
        error: error.message,
        connectionId,
        spreadsheetId,
        userId: user.id,
      });
      throw new BadRequestException(`Failed to remove auto-sync webhook: ${error.message}`);
    }
  }





  /**
   * Start polling for spreadsheet changes (development mode)
   */
  private startPollingForChanges(connectionId: string, spreadsheetId: string): void {
    const intervalKey = `${connectionId}-${spreadsheetId}`;

    // Initialize global polling intervals map if it doesn't exist
    if (!(global as any).pollingIntervals) {
      (global as any).pollingIntervals = new Map();
    }

    const pollingIntervals = (global as any).pollingIntervals;

    // Clear existing interval if any
    if (pollingIntervals.has(intervalKey)) {
      clearInterval(pollingIntervals.get(intervalKey));
    }

    // Store last modified time to detect changes
    const lastModifiedKey = `lastModified-${intervalKey}`;
    if (!(global as any).lastModifiedTimes) {
      (global as any).lastModifiedTimes = new Map();
    }

    const lastModifiedTimes = (global as any).lastModifiedTimes;

    this.logger.log('Starting polling for spreadsheet changes', {
      connectionId,
      spreadsheetId,
      intervalSeconds: 30,
    });

    // Poll every 30 seconds
    const interval = setInterval(async () => {
      try {
        await this.checkForSpreadsheetChanges(connectionId, spreadsheetId, lastModifiedTimes, lastModifiedKey);
      } catch (error) {
        this.logger.error('Error during polling check', {
          error: error.message,
          connectionId,
          spreadsheetId,
        });
      }
    }, 30000); // 30 seconds

    pollingIntervals.set(intervalKey, interval);
  }

  /**
   * Check for spreadsheet changes via polling
   */
  private async checkForSpreadsheetChanges(
    connectionId: string,
    spreadsheetId: string,
    lastModifiedTimes: Map<string, string>,
    lastModifiedKey: string,
  ): Promise<void> {
    try {
      // Get access token
      const accessToken = await this.googleSheetsService['oauth2Service'].getAccessToken(connectionId);

      // Get spreadsheet metadata to check last modified time
      const response = await this.googleSheetsService['driveApiClient'].get(
        `/v3/files/${spreadsheetId}`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
          params: {
            fields: 'modifiedTime,name',
          },
        }
      );

      const currentModifiedTime = response.data.modifiedTime;
      const lastKnownModifiedTime = lastModifiedTimes.get(lastModifiedKey);

      if (!lastKnownModifiedTime) {
        // First time checking, just store the current time
        lastModifiedTimes.set(lastModifiedKey, currentModifiedTime);
        this.logger.debug('Initial polling check, storing modified time', {
          connectionId,
          spreadsheetId,
          modifiedTime: currentModifiedTime,
        });
        return;
      }

      if (currentModifiedTime !== lastKnownModifiedTime) {
        this.logger.log('Spreadsheet change detected via polling', {
          connectionId,
          spreadsheetId,
          lastModified: lastKnownModifiedTime,
          currentModified: currentModifiedTime,
        });

        // Update stored time
        lastModifiedTimes.set(lastModifiedKey, currentModifiedTime);

        // Trigger auto-sync
        this.triggerOrderSync(connectionId, spreadsheetId, 'polling').catch(error => {
          this.logger.error('Auto-sync failed after polling detection', {
            error: error.message,
            connectionId,
            spreadsheetId,
          });
        });
      }
    } catch (error) {
      this.logger.error('Error checking spreadsheet changes', {
        error: error.message,
        connectionId,
        spreadsheetId,
      });
    }
  }

  /**
   * Trigger order sync (used by polling and webhooks)
   */
  private async triggerOrderSync(
    connectionId: string,
    spreadsheetId: string,
    operationType: string,
  ): Promise<void> {
    try {
      // Create sync operation
      const syncOperation = await this.prismaService.syncOperation.create({
        data: {
          connectionId,
          spreadsheetId,
          operationType,
          status: 'pending',
        },
      });

      // Use the existing googleSheetsOrderService triggerManualSync method
      // This avoids complex dependency injection issues
      const result = await this.googleSheetsOrderService.triggerManualSync(
        connectionId,
        spreadsheetId,
        {
          forceResync: false, // Only sync new/changed orders
        }
      );

      this.logger.log('Auto-sync completed successfully', {
        connectionId,
        spreadsheetId,
        syncOperationId: syncOperation.id,
        ordersProcessed: result.ordersProcessed,
        ordersCreated: result.ordersCreated,
        ordersSkipped: result.ordersSkipped,
        operationType,
      });
    } catch (error) {
      this.logger.error('Auto-sync failed', {
        error: error.message,
        connectionId,
        spreadsheetId,
        operationType,
      });
      throw error;
    }
  }
}
