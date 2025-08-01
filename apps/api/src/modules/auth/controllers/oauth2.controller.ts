import {
  Controller,
  Post,
  Get,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
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
import { OAuth2Service } from '../services/oauth2.service';
import { OAuth2ConfigService } from '../services/oauth2-config.service';
import {
  InitiateOAuth2Dto,
  CompleteOAuth2Dto,
  OAuth2AuthorizationResponseDto,
  OAuth2ConnectionResponseDto,
  RefreshTokenDto,
  RevokeConnectionDto,
  TestConnectionDto,
  ConnectionTestResultDto,
  ListConnectionsQueryDto,
  ConnectionListResponseDto,
} from '../dto/oauth2.dto';
import { UserRole, PlatformType, ConnectionStatus } from '@prisma/client';

@ApiTags('OAuth2 Integration')
@Controller('auth/oauth2')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class OAuth2Controller {
  private readonly logger = new Logger(OAuth2Controller.name);

  constructor(
    private readonly oauth2Service: OAuth2Service,
    private readonly oauth2ConfigService: OAuth2ConfigService,
    private readonly prismaService: PrismaService,
  ) {}

  @Post('initiate')
  @ApiOperation({
    summary: 'Initiate OAuth2 authorization flow',
    description: 'Generate authorization URL for OAuth2 platform integration',
  })
  @ApiResponse({
    status: 200,
    description: 'Authorization URL generated successfully',
    type: OAuth2AuthorizationResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid platform type or configuration',
  })
  @ApiResponse({
    status: 403,
    description: 'Insufficient permissions',
  })
  @Roles(UserRole.ADMIN, UserRole.TEAM_LEADER, UserRole.CLIENT_ADMIN)
  async initiateOAuth2(
    @Body() dto: InitiateOAuth2Dto,
    @CurrentUser() user: any,
  ): Promise<OAuth2AuthorizationResponseDto> {
    try {
      this.logger.log('Initiating OAuth2 flow', {
        userId: user.id,
        organizationId: user.organizationId,
        platformType: dto.platformType,
        platformName: dto.platformName,
      });

      // Get OAuth2 configuration for the platform
      const config = await this.oauth2ConfigService.getConfig(dto.platformType);
      
      if (!config) {
        throw new BadRequestException(`OAuth2 not configured for platform: ${dto.platformType}`);
      }

      // Check if user already has a connection for this platform
      const existingConnection = await this.prismaService.platformConnection.findFirst({
        where: {
          userId: user.id,
          organizationId: user.organizationId,
          platformType: dto.platformType,
          status: ConnectionStatus.ACTIVE,
        },
      });

      if (existingConnection) {
        throw new BadRequestException(
          `Active connection already exists for ${dto.platformType}. Please revoke the existing connection first.`,
        );
      }

      // Generate authorization URL
      const authRequest = await this.oauth2Service.generateAuthorizationUrl(
        dto.platformType,
        config,
        user.id,
        user.organizationId,
      );

      return {
        authorizationUrl: authRequest.authorizationUrl,
        state: authRequest.state,
        // Don't expose PKCE details to client for security
      };
    } catch (error) {
      this.logger.error('Failed to initiate OAuth2 flow', {
        error: error.message,
        userId: user.id,
        platformType: dto.platformType,
      });
      throw error;
    }
  }

  @Post('complete')
  @ApiOperation({
    summary: 'Complete OAuth2 authorization flow',
    description: 'Exchange authorization code for access token and store connection',
  })
  @ApiResponse({
    status: 200,
    description: 'OAuth2 connection established successfully',
    type: OAuth2ConnectionResponseDto,
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
  async completeOAuth2(
    @Body() dto: CompleteOAuth2Dto,
    @CurrentUser() user: any,
  ): Promise<OAuth2ConnectionResponseDto> {
    try {
      // Handle OAuth2 errors
      if (dto.error) {
        this.logger.warn('OAuth2 authorization error', {
          error: dto.error,
          description: dto.error_description,
          userId: user.id,
        });
        throw new BadRequestException(`OAuth2 authorization failed: ${dto.error_description || dto.error}`);
      }

      this.logger.log('Completing OAuth2 flow', {
        userId: user.id,
        state: dto.state,
      });

      // First validate state to get platform type
      const { stateData } = await this.oauth2Service.exchangeCodeForToken(
        dto.code,
        dto.state,
        null, // Just validate state first
      );
      
      // Now get the proper config and exchange for real
      const config = await this.oauth2ConfigService.getConfig(stateData.platformType);
      const { tokenResponse } = await this.oauth2Service.exchangeCodeForToken(
        dto.code,
        dto.state,
        config,
      );

      // Verify the state data matches the current user
      if (stateData.userId !== user.id || stateData.organizationId !== user.organizationId) {
        throw new ForbiddenException('State validation failed - user mismatch');
      }

      // Store the connection
      const connectionId = await this.oauth2Service.storeConnection(
        user.id,
        user.organizationId,
        stateData.platformType,
        `${stateData.platformType} Connection`, // Default name, can be updated later
        tokenResponse,
        config.scopes,
        stateData.platformData,
      );

      // Retrieve and return the stored connection
      const connection = await this.prismaService.platformConnection.findUnique({
        where: { id: connectionId },
      });

      return this.mapConnectionToDto(connection);
    } catch (error) {
      this.logger.error('Failed to complete OAuth2 flow', {
        error: error.message,
        userId: user.id,
        state: dto.state,
      });
      throw error;
    }
  }

  @Get('connections')
  @ApiOperation({
    summary: 'List OAuth2 connections',
    description: 'Get list of OAuth2 connections for the current user/organization',
  })
  @ApiQuery({ name: 'platformType', required: false, enum: PlatformType })
  @ApiQuery({ name: 'status', required: false, type: String })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiResponse({
    status: 200,
    description: 'Connections retrieved successfully',
    type: ConnectionListResponseDto,
  })
  @Roles(UserRole.ADMIN, UserRole.TEAM_LEADER, UserRole.CLIENT_ADMIN, UserRole.CLIENT_USER)
  async listConnections(
    @Query() query: ListConnectionsQueryDto,
    @CurrentUser() user: any,
  ): Promise<ConnectionListResponseDto> {
    try {
      const page = query.page || 1;
      const limit = Math.min(query.limit || 10, 50); // Max 50 items per page
      const skip = (page - 1) * limit;

      const where: any = {
        organizationId: user.organizationId,
        ...(query.platformType && { platformType: query.platformType }),
        ...(query.status && { status: query.status as any }),
        // Non-admin users can only see their own connections
        ...(![UserRole.ADMIN, UserRole.CLIENT_ADMIN].includes(user.role) && { userId: user.id }),
      };

      const [connections, total] = await Promise.all([
        this.prismaService.platformConnection.findMany({
          where,
          skip,
          take: limit,
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
        limit,
        totalPages: Math.ceil(total / limit),
      };
    } catch (error) {
      this.logger.error('Failed to list connections', {
        error: error.message,
        userId: user.id,
      });
      throw error;
    }
  }

  @Get('connections/:id')
  @ApiOperation({
    summary: 'Get OAuth2 connection details',
    description: 'Get detailed information about a specific OAuth2 connection',
  })
  @ApiParam({ name: 'id', description: 'Connection ID' })
  @ApiResponse({
    status: 200,
    description: 'Connection details retrieved successfully',
    type: OAuth2ConnectionResponseDto,
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
  async getConnection(
    @Param('id') id: string,
    @CurrentUser() user: any,
  ): Promise<OAuth2ConnectionResponseDto> {
    try {
      const connection = await this.prismaService.platformConnection.findFirst({
        where: {
          id,
          organizationId: user.organizationId,
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
        throw new NotFoundException('Connection not found');
      }

      return this.mapConnectionToDto(connection);
    } catch (error) {
      this.logger.error('Failed to get connection', {
        error: error.message,
        connectionId: id,
        userId: user.id,
      });
      throw error;
    }
  }

  @Post('connections/:id/refresh')
  @ApiOperation({
    summary: 'Refresh OAuth2 access token',
    description: 'Refresh the access token for a specific connection',
  })
  @ApiParam({ name: 'id', description: 'Connection ID' })
  @ApiResponse({
    status: 200,
    description: 'Token refreshed successfully',
    type: OAuth2ConnectionResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: 'Connection not found',
  })
  @ApiResponse({
    status: 401,
    description: 'Token refresh failed',
  })
  @Roles(UserRole.ADMIN, UserRole.TEAM_LEADER, UserRole.CLIENT_ADMIN)
  async refreshToken(
    @Param('id') id: string,
    @CurrentUser() user: any,
  ): Promise<OAuth2ConnectionResponseDto> {
    try {
      // Verify connection exists and user has access
      const connection = await this.prismaService.platformConnection.findFirst({
        where: {
          id,
          organizationId: user.organizationId,
          // Non-admin users can only refresh their own connections
          ...(![UserRole.ADMIN, UserRole.CLIENT_ADMIN].includes(user.role) && { userId: user.id }),
        },
      });

      if (!connection) {
        throw new NotFoundException('Connection not found');
      }

      // Get platform configuration
      const config = await this.oauth2ConfigService.getConfig(connection.platformType);
      
      // Refresh the token
      await this.oauth2Service.refreshAccessToken(id, config);

      // Return updated connection
      const updatedConnection = await this.prismaService.platformConnection.findUnique({
        where: { id },
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

      return this.mapConnectionToDto(updatedConnection);
    } catch (error) {
      this.logger.error('Failed to refresh token', {
        error: error.message,
        connectionId: id,
        userId: user.id,
      });
      throw error;
    }
  }

  @Post('connections/:id/test')
  @ApiOperation({
    summary: 'Test OAuth2 connection',
    description: 'Test if the OAuth2 connection is working properly',
  })
  @ApiParam({ name: 'id', description: 'Connection ID' })
  @ApiResponse({
    status: 200,
    description: 'Connection test completed',
    type: ConnectionTestResultDto,
  })
  @ApiResponse({
    status: 404,
    description: 'Connection not found',
  })
  @Roles(UserRole.ADMIN, UserRole.TEAM_LEADER, UserRole.CLIENT_ADMIN, UserRole.CLIENT_USER)
  async testConnection(
    @Param('id') id: string,
    @CurrentUser() user: any,
  ): Promise<ConnectionTestResultDto> {
    try {
      // Verify connection exists and user has access
      const connection = await this.prismaService.platformConnection.findFirst({
        where: {
          id,
          organizationId: user.organizationId,
          // Non-admin users can only test their own connections
          ...(![UserRole.ADMIN, UserRole.CLIENT_ADMIN].includes(user.role) && { userId: user.id }),
        },
      });

      if (!connection) {
        throw new NotFoundException('Connection not found');
      }

      // Test the connection using platform-specific service
      const testResult = await this.oauth2ConfigService.testConnection(id, connection.platformType);

      return {
        success: testResult.success,
        error: testResult.error,
        details: testResult.details,
        testedAt: new Date(),
      };
    } catch (error) {
      this.logger.error('Failed to test connection', {
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

  @Delete('connections/:id')
  @ApiOperation({
    summary: 'Revoke OAuth2 connection',
    description: 'Revoke and delete an OAuth2 connection',
  })
  @ApiParam({ name: 'id', description: 'Connection ID' })
  @ApiResponse({
    status: 200,
    description: 'Connection revoked successfully',
  })
  @ApiResponse({
    status: 404,
    description: 'Connection not found',
  })
  @Roles(UserRole.ADMIN, UserRole.TEAM_LEADER, UserRole.CLIENT_ADMIN)
  async revokeConnection(
    @Param('id') id: string,
    @CurrentUser() user: any,
  ): Promise<{ message: string }> {
    try {
      // Verify connection exists and user has access
      const connection = await this.prismaService.platformConnection.findFirst({
        where: {
          id,
          organizationId: user.organizationId,
          // Non-admin users can only revoke their own connections
          ...(![UserRole.ADMIN, UserRole.CLIENT_ADMIN].includes(user.role) && { userId: user.id }),
        },
      });

      if (!connection) {
        throw new NotFoundException('Connection not found');
      }

      // Mark connection as revoked
      await this.prismaService.platformConnection.update({
        where: { id },
        data: {
          status: ConnectionStatus.REVOKED,
          lastErrorAt: new Date(),
          lastErrorMessage: 'Connection revoked by user',
        },
      });

      this.logger.log('OAuth2 connection revoked', {
        connectionId: id,
        platformType: connection.platformType,
        userId: user.id,
      });

      return { message: 'Connection revoked successfully' };
    } catch (error) {
      this.logger.error('Failed to revoke connection', {
        error: error.message,
        connectionId: id,
        userId: user.id,
      });
      throw error;
    }
  }

  /**
   * Map database connection to DTO
   */
  private mapConnectionToDto(connection: any): OAuth2ConnectionResponseDto {
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