import { IsString, IsOptional, IsUUID, IsEnum, IsDate, IsArray, IsObject } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { UserRole, UserStatus } from '@prisma/client';

export class PermissionUpdateEventDto {
  @ApiProperty({
    description: 'User ID whose permissions were updated',
    example: 'clp123456789',
  })
  @IsString()
  @IsUUID()
  userId: string;

  @ApiProperty({
    description: 'Previous user role',
    enum: UserRole,
    required: false,
  })
  @IsOptional()
  @IsEnum(UserRole)
  oldRole?: UserRole;

  @ApiProperty({
    description: 'New user role',
    enum: UserRole,
    example: UserRole.TEAM_LEADER,
  })
  @IsEnum(UserRole)
  newRole: UserRole;

  @ApiProperty({
    description: 'ID of user who made the change',
    example: 'clp987654321',
  })
  @IsString()
  @IsUUID()
  updatedBy: string;

  @ApiProperty({
    description: 'Timestamp of the update',
    example: '2024-01-15T10:30:00Z',
  })
  @IsDate()
  timestamp: Date;

  @ApiProperty({
    description: 'Organization ID',
    example: 'clp111222333',
  })
  @IsString()
  @IsUUID()
  organizationId: string;
}

export class SessionUpdateEventDto {
  @ApiProperty({
    description: 'User ID whose session was updated',
    example: 'clp123456789',
  })
  @IsString()
  @IsUUID()
  userId: string;

  @ApiProperty({
    description: 'Session ID (if applicable)',
    example: 'sess_abc123',
    required: false,
  })
  @IsOptional()
  @IsString()
  sessionId?: string;

  @ApiProperty({
    description: 'Session action',
    enum: ['created', 'updated', 'terminated', 'expired'],
    example: 'terminated',
  })
  @IsEnum(['created', 'updated', 'terminated', 'expired'])
  action: 'created' | 'updated' | 'terminated' | 'expired';

  @ApiProperty({
    description: 'Reason for the action',
    example: 'User logged out',
    required: false,
  })
  @IsOptional()
  @IsString()
  reason?: string;

  @ApiProperty({
    description: 'Timestamp of the update',
    example: '2024-01-15T10:30:00Z',
  })
  @IsDate()
  timestamp: Date;

  @ApiProperty({
    description: 'Organization ID',
    example: 'clp111222333',
  })
  @IsString()
  @IsUUID()
  organizationId: string;
}

export class SecurityEventDto {
  @ApiProperty({
    description: 'User ID associated with the security event',
    example: 'clp123456789',
  })
  @IsString()
  @IsUUID()
  userId: string;

  @ApiProperty({
    description: 'Type of security event',
    enum: ['login_attempt', 'login_success', 'login_failed', 'password_changed', 'account_locked', 'account_unlocked', 'suspicious_activity'],
    example: 'login_failed',
  })
  @IsEnum(['login_attempt', 'login_success', 'login_failed', 'password_changed', 'account_locked', 'account_unlocked', 'suspicious_activity'])
  eventType: 'login_attempt' | 'login_success' | 'login_failed' | 'password_changed' | 'account_locked' | 'account_unlocked' | 'suspicious_activity';

  @ApiProperty({
    description: 'Event details',
    example: { attempts: 3, lastAttempt: '2024-01-15T10:30:00Z' },
  })
  @IsObject()
  details: any;

  @ApiProperty({
    description: 'IP address of the event',
    example: '192.168.1.1',
    required: false,
  })
  @IsOptional()
  @IsString()
  ipAddress?: string;

  @ApiProperty({
    description: 'User agent string',
    example: 'Mozilla/5.0...',
    required: false,
  })
  @IsOptional()
  @IsString()
  userAgent?: string;

  @ApiProperty({
    description: 'Timestamp of the event',
    example: '2024-01-15T10:30:00Z',
  })
  @IsDate()
  timestamp: Date;

  @ApiProperty({
    description: 'Organization ID',
    example: 'clp111222333',
  })
  @IsString()
  @IsUUID()
  organizationId: string;

  @ApiProperty({
    description: 'Event severity level',
    enum: ['low', 'medium', 'high', 'critical'],
    example: 'high',
  })
  @IsEnum(['low', 'medium', 'high', 'critical'])
  severity: 'low' | 'medium' | 'high' | 'critical';
}

export class UserStatusUpdateEventDto {
  @ApiProperty({
    description: 'User ID whose status was updated',
    example: 'clp123456789',
  })
  @IsString()
  @IsUUID()
  userId: string;

  @ApiProperty({
    description: 'Previous user status',
    enum: UserStatus,
    required: false,
  })
  @IsOptional()
  @IsEnum(UserStatus)
  oldStatus?: UserStatus;

  @ApiProperty({
    description: 'New user status',
    enum: UserStatus,
    example: UserStatus.SUSPENDED,
  })
  @IsEnum(UserStatus)
  newStatus: UserStatus;

  @ApiProperty({
    description: 'ID of user who made the change',
    example: 'clp987654321',
    required: false,
  })
  @IsOptional()
  @IsString()
  @IsUUID()
  updatedBy?: string;

  @ApiProperty({
    description: 'Timestamp of the update',
    example: '2024-01-15T10:30:00Z',
  })
  @IsDate()
  timestamp: Date;

  @ApiProperty({
    description: 'Organization ID',
    example: 'clp111222333',
  })
  @IsString()
  @IsUUID()
  organizationId: string;
}

export class TeamAssignmentEventDto {
  @ApiProperty({
    description: 'User ID who was assigned/removed',
    example: 'clp123456789',
  })
  @IsString()
  @IsUUID()
  userId: string;

  @ApiProperty({
    description: 'Team ID',
    example: 'clp555666777',
  })
  @IsString()
  @IsUUID()
  teamId: string;

  @ApiProperty({
    description: 'Assignment action',
    enum: ['assigned', 'removed'],
    example: 'assigned',
  })
  @IsEnum(['assigned', 'removed'])
  action: 'assigned' | 'removed';

  @ApiProperty({
    description: 'ID of user who made the change',
    example: 'clp987654321',
  })
  @IsString()
  @IsUUID()
  updatedBy: string;

  @ApiProperty({
    description: 'Timestamp of the update',
    example: '2024-01-15T10:30:00Z',
  })
  @IsDate()
  timestamp: Date;

  @ApiProperty({
    description: 'Organization ID',
    example: 'clp111222333',
  })
  @IsString()
  @IsUUID()
  organizationId: string;
}

export class StoreAssignmentEventDto {
  @ApiProperty({
    description: 'Team ID',
    example: 'clp555666777',
  })
  @IsString()
  @IsUUID()
  teamId: string;

  @ApiProperty({
    description: 'Store ID',
    example: 'clp888999000',
  })
  @IsString()
  @IsUUID()
  storeId: string;

  @ApiProperty({
    description: 'Assignment action',
    enum: ['assigned', 'removed'],
    example: 'assigned',
  })
  @IsEnum(['assigned', 'removed'])
  action: 'assigned' | 'removed';

  @ApiProperty({
    description: 'ID of user who made the change',
    example: 'clp987654321',
  })
  @IsString()
  @IsUUID()
  updatedBy: string;

  @ApiProperty({
    description: 'Timestamp of the update',
    example: '2024-01-15T10:30:00Z',
  })
  @IsDate()
  timestamp: Date;

  @ApiProperty({
    description: 'Organization ID',
    example: 'clp111222333',
  })
  @IsString()
  @IsUUID()
  organizationId: string;

  @ApiProperty({
    description: 'List of affected user IDs',
    example: ['clp123456789', 'clp111222333'],
    type: [String],
  })
  @IsArray()
  @IsString({ each: true })
  @IsUUID(undefined, { each: true })
  affectedUsers: string[];
}

export class NotificationDto {
  @ApiProperty({
    description: 'Notification ID',
    example: 'notif_abc123',
  })
  @IsString()
  id: string;

  @ApiProperty({
    description: 'Notification type',
    example: 'permission_update',
  })
  @IsString()
  type: string;

  @ApiProperty({
    description: 'Notification data',
    example: { message: 'Your role has been updated' },
  })
  @IsObject()
  data: any;

  @ApiProperty({
    description: 'Notification timestamp',
    example: '2024-01-15T10:30:00Z',
  })
  @IsDate()
  timestamp: Date;

  @ApiProperty({
    description: 'Whether notification has been read',
    example: false,
  })
  read: boolean;
}

export class GetNotificationsResponseDto {
  @ApiProperty({
    description: 'List of notifications',
    type: [NotificationDto],
  })
  notifications: NotificationDto[];

  @ApiProperty({
    description: 'Total count of notifications',
    example: 25,
  })
  total: number;

  @ApiProperty({
    description: 'Number of unread notifications',
    example: 5,
  })
  unread: number;
}

export class MarkNotificationsReadDto {
  @ApiProperty({
    description: 'Array of notification IDs to mark as read',
    example: ['notif_abc123', 'notif_def456'],
    type: [String],
  })
  @IsArray()
  @IsString({ each: true })
  notificationIds: string[];
}