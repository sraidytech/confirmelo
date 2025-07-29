import { IsEnum, IsOptional, IsString, IsBoolean, IsDateString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { UserStatus } from '@prisma/client';

export class UpdateUserStatusDto {
  @ApiProperty({ 
    enum: UserStatus, 
    example: 'ACTIVE', 
    description: 'User status' 
  })
  @IsEnum(UserStatus)
  status: UserStatus;

  @ApiPropertyOptional({ 
    example: 'Account suspended due to policy violation', 
    description: 'Reason for status change' 
  })
  @IsOptional()
  @IsString()
  reason?: string;
}

export class UserPresenceDto {
  @ApiProperty({ example: 'user-123', description: 'User ID' })
  @IsString()
  userId: string;

  @ApiProperty({ example: true, description: 'Whether user is currently online' })
  @IsBoolean()
  isOnline: boolean;

  @ApiProperty({ example: '2024-01-01T00:00:00Z', description: 'Last activity timestamp' })
  @IsDateString()
  lastActiveAt: Date;

  @ApiPropertyOptional({ example: 'ACTIVE', description: 'User status' })
  @IsOptional()
  @IsEnum(UserStatus)
  status?: UserStatus;
}

export class BulkUserPresenceDto {
  @ApiProperty({ 
    type: [UserPresenceDto], 
    description: 'Array of user presence information' 
  })
  users: UserPresenceDto[];

  @ApiProperty({ example: '2024-01-01T00:00:00Z', description: 'Timestamp of the presence data' })
  @IsDateString()
  timestamp: Date;
}

export class UserStatusHistoryDto {
  @ApiProperty({ example: 'status-123', description: 'Status change ID' })
  @IsString()
  id: string;

  @ApiProperty({ example: 'user-123', description: 'User ID' })
  @IsString()
  userId: string;

  @ApiProperty({ enum: UserStatus, example: 'SUSPENDED', description: 'Previous status' })
  @IsEnum(UserStatus)
  previousStatus: UserStatus;

  @ApiProperty({ enum: UserStatus, example: 'ACTIVE', description: 'New status' })
  @IsEnum(UserStatus)
  newStatus: UserStatus;

  @ApiPropertyOptional({ 
    example: 'Account reactivated after verification', 
    description: 'Reason for status change' 
  })
  @IsOptional()
  @IsString()
  reason?: string;

  @ApiProperty({ example: 'admin-123', description: 'ID of user who made the change' })
  @IsString()
  changedBy: string;

  @ApiProperty({ example: '2024-01-01T00:00:00Z', description: 'When the status was changed' })
  @IsDateString()
  changedAt: Date;
}

export class OnlineUsersResponseDto {
  @ApiProperty({ 
    type: [String], 
    example: ['user-1', 'user-2', 'user-3'], 
    description: 'Array of online user IDs' 
  })
  onlineUserIds: string[];

  @ApiProperty({ example: 3, description: 'Total count of online users' })
  totalOnline: number;

  @ApiProperty({ example: '2024-01-01T00:00:00Z', description: 'Timestamp of the data' })
  timestamp: Date;
}

export class UserActivitySummaryDto {
  @ApiProperty({ example: 'user-123', description: 'User ID' })
  userId: string;

  @ApiProperty({ example: true, description: 'Current online status' })
  isOnline: boolean;

  @ApiProperty({ example: '2024-01-01T00:00:00Z', description: 'Last activity timestamp' })
  lastActiveAt: Date;

  @ApiProperty({ example: 5, description: 'Number of active sessions' })
  activeSessions: number;

  @ApiProperty({ example: 'ACTIVE', description: 'Current user status' })
  status: UserStatus;

  @ApiProperty({ example: '192.168.1.1', description: 'Last known IP address' })
  lastIpAddress?: string;

  @ApiProperty({ example: 'Mozilla/5.0...', description: 'Last known user agent' })
  lastUserAgent?: string;
}