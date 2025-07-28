import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';
import { RealtimeNotificationService } from '../services/realtime-notification.service';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { Permissions } from '../../../common/decorators/permissions.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { PERMISSIONS } from '../../../common/constants/permissions';
import {
  PermissionUpdateEventDto,
  SessionUpdateEventDto,
  SecurityEventDto,
  UserStatusUpdateEventDto,
  TeamAssignmentEventDto,
  StoreAssignmentEventDto,
  GetNotificationsResponseDto,
  MarkNotificationsReadDto,
} from '../dto/realtime-events.dto';

@ApiTags('Real-time Notifications')
@ApiBearerAuth()
@Controller('notifications')
@UseGuards(JwtAuthGuard, RolesGuard)
export class RealtimeNotificationController {
  constructor(
    private readonly realtimeNotificationService: RealtimeNotificationService,
  ) {}

  @Get()
  @Permissions(PERMISSIONS.USERS.VIEW)
  @ApiOperation({
    summary: 'Get user notifications',
    description: 'Get stored notifications for the current user',
  })
  @ApiQuery({
    name: 'limit',
    description: 'Maximum number of notifications to return',
    example: 50,
    required: false,
  })
  @ApiResponse({
    status: 200,
    description: 'Notifications retrieved successfully',
    type: GetNotificationsResponseDto,
  })
  async getUserNotifications(
    @CurrentUser() currentUser: any,
    @Query('limit') limit?: string,
  ): Promise<GetNotificationsResponseDto> {
    const limitNum = limit ? parseInt(limit, 10) : 50;
    const notifications = await this.realtimeNotificationService.getUserNotifications(
      currentUser.id,
      limitNum,
    );

    const unreadCount = notifications.filter(n => !n.read).length;

    return {
      notifications,
      total: notifications.length,
      unread: unreadCount,
    };
  }

  @Post('mark-read')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Permissions(PERMISSIONS.USERS.VIEW)
  @ApiOperation({
    summary: 'Mark notifications as read',
    description: 'Mark specific notifications as read for the current user',
  })
  @ApiResponse({
    status: 204,
    description: 'Notifications marked as read successfully',
  })
  async markNotificationsAsRead(
    @CurrentUser() currentUser: any,
    @Body() dto: MarkNotificationsReadDto,
  ): Promise<void> {
    await this.realtimeNotificationService.markNotificationsAsRead(
      currentUser.id,
      dto.notificationIds,
    );
  }

  @Delete()
  @HttpCode(HttpStatus.NO_CONTENT)
  @Permissions(PERMISSIONS.USERS.VIEW)
  @ApiOperation({
    summary: 'Clear all notifications',
    description: 'Clear all notifications for the current user',
  })
  @ApiResponse({
    status: 204,
    description: 'All notifications cleared successfully',
  })
  async clearNotifications(@CurrentUser() currentUser: any): Promise<void> {
    await this.realtimeNotificationService.clearUserNotifications(currentUser.id);
  }

  // Admin endpoints for broadcasting events

  @Post('broadcast/permission-update')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Permissions(PERMISSIONS.USERS.MANAGE_ROLES)
  @ApiOperation({
    summary: 'Broadcast permission update',
    description: 'Broadcast a permission update event to affected users',
  })
  @ApiResponse({
    status: 204,
    description: 'Permission update broadcasted successfully',
  })
  async broadcastPermissionUpdate(
    @Body() dto: PermissionUpdateEventDto,
  ): Promise<void> {
    await this.realtimeNotificationService.broadcastPermissionUpdate(dto);
  }

  @Post('broadcast/session-update')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Permissions(PERMISSIONS.SYSTEM.MANAGE_SETTINGS)
  @ApiOperation({
    summary: 'Broadcast session update',
    description: 'Broadcast a session update event to affected users',
  })
  @ApiResponse({
    status: 204,
    description: 'Session update broadcasted successfully',
  })
  async broadcastSessionUpdate(
    @Body() dto: SessionUpdateEventDto,
  ): Promise<void> {
    await this.realtimeNotificationService.broadcastSessionUpdate(dto);
  }

  @Post('broadcast/security-event')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Permissions(PERMISSIONS.SYSTEM.VIEW_AUDIT_LOGS)
  @ApiOperation({
    summary: 'Broadcast security event',
    description: 'Broadcast a security event to affected users and admins',
  })
  @ApiResponse({
    status: 204,
    description: 'Security event broadcasted successfully',
  })
  async broadcastSecurityEvent(
    @Body() dto: SecurityEventDto,
  ): Promise<void> {
    await this.realtimeNotificationService.broadcastSecurityEvent(dto);
  }

  @Post('broadcast/status-update')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Permissions(PERMISSIONS.USERS.MANAGE_ROLES)
  @ApiOperation({
    summary: 'Broadcast user status update',
    description: 'Broadcast a user status update event',
  })
  @ApiResponse({
    status: 204,
    description: 'User status update broadcasted successfully',
  })
  async broadcastUserStatusUpdate(
    @Body() dto: UserStatusUpdateEventDto,
  ): Promise<void> {
    await this.realtimeNotificationService.broadcastUserStatusUpdate(dto);
  }

  @Post('broadcast/team-assignment')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Permissions(PERMISSIONS.TEAM_MANAGEMENT.ASSIGN_MEMBERS)
  @ApiOperation({
    summary: 'Broadcast team assignment update',
    description: 'Broadcast a team assignment update event',
  })
  @ApiResponse({
    status: 204,
    description: 'Team assignment update broadcasted successfully',
  })
  async broadcastTeamAssignmentUpdate(
    @Body() dto: TeamAssignmentEventDto,
  ): Promise<void> {
    await this.realtimeNotificationService.broadcastTeamAssignmentUpdate(dto);
  }

  @Post('broadcast/store-assignment')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Permissions(PERMISSIONS.TEAM_MANAGEMENT.ASSIGN_STORES)
  @ApiOperation({
    summary: 'Broadcast store assignment update',
    description: 'Broadcast a store assignment update event',
  })
  @ApiResponse({
    status: 204,
    description: 'Store assignment update broadcasted successfully',
  })
  async broadcastStoreAssignmentUpdate(
    @Body() dto: StoreAssignmentEventDto,
  ): Promise<void> {
    await this.realtimeNotificationService.broadcastStoreAssignmentUpdate(dto);
  }
}