import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
} from '@nestjs/swagger';
import { WebsocketService } from './websocket.service';
import { WebsocketGateway } from './websocket.gateway';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { PERMISSIONS } from '../../common/constants/permissions';
import {
  UserPresenceResponseDto,
  OnlineUsersResponseDto,
  ConnectionStatsDto,
} from './dto/websocket.dto';

@ApiTags('WebSocket Management')
@ApiBearerAuth()
@Controller('websocket')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class WebsocketController {
  constructor(
    private readonly websocketService: WebsocketService,
    private readonly websocketGateway: WebsocketGateway,
  ) {}

  @Get('stats')
  @RequirePermissions(PERMISSIONS.SYSTEM.SYSTEM_HEALTH)
  @ApiOperation({
    summary: 'Get WebSocket connection statistics',
    description: 'Get real-time statistics about WebSocket connections',
  })
  @ApiResponse({
    status: 200,
    description: 'Connection statistics retrieved successfully',
    type: ConnectionStatsDto,
  })
  getConnectionStats(): ConnectionStatsDto {
    return this.websocketGateway.getConnectionStats();
  }

  @Get('presence/:userId')
  @RequirePermissions(PERMISSIONS.USERS.VIEW)
  @ApiOperation({
    summary: 'Get user presence information',
    description: 'Get online status and presence information for a specific user',
  })
  @ApiParam({
    name: 'userId',
    description: 'ID of the user to get presence for',
    example: 'clp123456789',
  })
  @ApiResponse({
    status: 200,
    description: 'User presence information retrieved successfully',
    type: UserPresenceResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: 'User not found',
  })
  async getUserPresence(@Param('userId') userId: string): Promise<UserPresenceResponseDto | null> {
    return await this.websocketService.getUserPresence(userId);
  }

  @Get('online/:organizationId')
  @RequirePermissions(PERMISSIONS.USERS.VIEW)
  @ApiOperation({
    summary: 'Get online users in organization',
    description: 'Get list of currently online users in a specific organization',
  })
  @ApiParam({
    name: 'organizationId',
    description: 'ID of the organization',
    example: 'clp987654321',
  })
  @ApiResponse({
    status: 200,
    description: 'Online users retrieved successfully',
    type: OnlineUsersResponseDto,
  })
  async getOnlineUsers(
    @Param('organizationId') organizationId: string,
  ): Promise<OnlineUsersResponseDto> {
    const users = await this.websocketService.getOnlineUsersInOrganization(organizationId);
    
    return {
      organizationId,
      users,
      timestamp: new Date(),
    };
  }

  @Post('broadcast/user/:userId')
  @RequirePermissions(PERMISSIONS.SYSTEM.MANAGE_SETTINGS)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Broadcast message to user',
    description: 'Send a message to all connections of a specific user',
  })
  @ApiParam({
    name: 'userId',
    description: 'ID of the user to broadcast to',
    example: 'clp123456789',
  })
  @ApiResponse({
    status: 204,
    description: 'Message broadcasted successfully',
  })
  async broadcastToUser(
    @Param('userId') userId: string,
    @Body() body: { event: string; data: any },
  ): Promise<void> {
    await this.websocketGateway.broadcastToUser(userId, body.event, body.data);
  }

  @Post('broadcast/organization/:organizationId')
  @RequirePermissions(PERMISSIONS.SYSTEM.MANAGE_SETTINGS)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Broadcast message to organization',
    description: 'Send a message to all users in a specific organization',
  })
  @ApiParam({
    name: 'organizationId',
    description: 'ID of the organization to broadcast to',
    example: 'clp987654321',
  })
  @ApiResponse({
    status: 204,
    description: 'Message broadcasted successfully',
  })
  async broadcastToOrganization(
    @Param('organizationId') organizationId: string,
    @Body() body: { event: string; data: any },
  ): Promise<void> {
    await this.websocketGateway.broadcastToOrganization(organizationId, body.event, body.data);
  }

  @Delete('disconnect/:userId')
  @RequirePermissions(PERMISSIONS.USERS.MANAGE_ROLES)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Disconnect user sessions',
    description: 'Force disconnect all WebSocket sessions for a specific user',
  })
  @ApiParam({
    name: 'userId',
    description: 'ID of the user to disconnect',
    example: 'clp123456789',
  })
  @ApiResponse({
    status: 204,
    description: 'User disconnected successfully',
  })
  async disconnectUser(
    @Param('userId') userId: string,
    @Body() body: { reason?: string } = {},
    @CurrentUser() currentUser: any,
  ): Promise<void> {
    const reason = body.reason || `Disconnected by ${currentUser.firstName} ${currentUser.lastName}`;
    await this.websocketGateway.disconnectUser(userId, reason);
  }

  @Post('cleanup')
  @RequirePermissions(PERMISSIONS.SYSTEM.MANAGE_SETTINGS)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Cleanup expired connections',
    description: 'Manually trigger cleanup of expired WebSocket connections',
  })
  @ApiResponse({
    status: 204,
    description: 'Cleanup completed successfully',
  })
  async cleanupConnections(): Promise<void> {
    await this.websocketService.cleanupExpiredConnections();
  }

  @Get('health')
  @ApiOperation({
    summary: 'WebSocket health check',
    description: 'Check the health status of the WebSocket service',
  })
  @ApiResponse({
    status: 200,
    description: 'WebSocket service is healthy',
    schema: {
      type: 'object',
      properties: {
        status: { type: 'string', example: 'healthy' },
        service: { type: 'string', example: 'WebsocketService' },
        connections: { type: 'number', example: 150 },
        uptime: { type: 'number', example: 3600 },
      },
    },
  })
  healthCheck() {
    const stats = this.websocketGateway.getConnectionStats();
    
    return {
      status: 'healthy',
      service: 'WebsocketService',
      connections: stats.totalConnections,
      uptime: process.uptime(),
      timestamp: new Date(),
    };
  }
}