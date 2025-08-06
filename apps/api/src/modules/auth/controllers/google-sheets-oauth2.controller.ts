import {
  Controller,
  Post,
  Get,
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
  @Roles(UserRole.ADMIN, UserRole.TEAM_LEADER, UserRole.CLIENT_ADMIN)
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
  @Roles(UserRole.ADMIN, UserRole.TEAM_LEADER, UserRole.CLIENT_ADMIN)
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
  @Roles(UserRole.ADMIN, UserRole.TEAM_LEADER, UserRole.CLIENT_ADMIN, UserRole.CLIENT_USER)
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
  @Roles(UserRole.ADMIN, UserRole.TEAM_LEADER, UserRole.CLIENT_ADMIN)
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
  @Roles(UserRole.ADMIN, UserRole.TEAM_LEADER, UserRole.CLIENT_ADMIN)
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
  @Roles(UserRole.ADMIN, UserRole.TEAM_LEADER, UserRole.CLIENT_ADMIN, UserRole.CLIENT_USER)
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
  @Roles(UserRole.ADMIN, UserRole.TEAM_LEADER, UserRole.CLIENT_ADMIN)
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

  @Get('accounts')
  @ApiOperation({
    summary: 'List connected Google accounts',
    description: 'Get all connected Google accounts for the current user',
  })
  @Roles(UserRole.ADMIN, UserRole.TEAM_LEADER, UserRole.CLIENT_ADMIN, UserRole.CLIENT_USER)
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
  @Roles(UserRole.ADMIN, UserRole.TEAM_LEADER, UserRole.CLIENT_ADMIN)
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