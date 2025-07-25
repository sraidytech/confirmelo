import { IsString, IsOptional, IsUUID, IsBoolean, IsDate } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class WebSocketAuthDto {
  @ApiProperty({
    description: 'JWT token for authentication',
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
  })
  @IsString()
  token: string;
}

export class JoinRoomDto {
  @ApiProperty({
    description: 'Room name to join',
    example: 'team:123',
  })
  @IsString()
  room: string;
}

export class LeaveRoomDto {
  @ApiProperty({
    description: 'Room name to leave',
    example: 'team:123',
  })
  @IsString()
  room: string;
}

export class GetPresenceDto {
  @ApiProperty({
    description: 'User ID to get presence for',
    example: 'clp123456789',
  })
  @IsString()
  @IsUUID()
  userId: string;
}

export class GetOnlineUsersDto {
  @ApiProperty({
    description: 'Organization ID to get online users for',
    example: 'clp987654321',
  })
  @IsString()
  @IsUUID()
  organizationId: string;
}

export class PingDto {
  @ApiProperty({
    description: 'Optional data to include with ping',
    required: false,
  })
  @IsOptional()
  data?: any;
}

export class UserPresenceResponseDto {
  @ApiProperty({
    description: 'User ID',
    example: 'clp123456789',
  })
  userId: string;

  @ApiProperty({
    description: 'Whether user is currently online',
    example: true,
  })
  @IsBoolean()
  isOnline: boolean;

  @ApiProperty({
    description: 'Last seen timestamp',
    example: '2024-01-15T10:30:00Z',
  })
  @IsDate()
  lastSeen: Date;

  @ApiProperty({
    description: 'Number of active connections',
    example: 2,
  })
  activeConnections: number;
}

export class OnlineUsersResponseDto {
  @ApiProperty({
    description: 'Organization ID',
    example: 'clp987654321',
  })
  organizationId: string;

  @ApiProperty({
    description: 'List of online user IDs',
    example: ['clp123456789', 'clp111222333'],
    type: [String],
  })
  users: string[];

  @ApiProperty({
    description: 'Response timestamp',
    example: '2024-01-15T10:30:00Z',
  })
  @IsDate()
  timestamp: Date;
}

export class AuthenticatedResponseDto {
  @ApiProperty({
    description: 'Authenticated user ID',
    example: 'clp123456789',
  })
  userId: string;

  @ApiProperty({
    description: 'Connection timestamp',
    example: '2024-01-15T10:30:00Z',
  })
  @IsDate()
  connectedAt: Date;
}

export class UserOnlineEventDto {
  @ApiProperty({
    description: 'User ID that came online',
    example: 'clp123456789',
  })
  userId: string;

  @ApiProperty({
    description: 'Event timestamp',
    example: '2024-01-15T10:30:00Z',
  })
  @IsDate()
  timestamp: Date;
}

export class UserOfflineEventDto {
  @ApiProperty({
    description: 'User ID that went offline',
    example: 'clp123456789',
  })
  userId: string;

  @ApiProperty({
    description: 'Event timestamp',
    example: '2024-01-15T10:30:00Z',
  })
  @IsDate()
  timestamp: Date;
}

export class ForceDisconnectEventDto {
  @ApiProperty({
    description: 'Reason for disconnection',
    example: 'Session expired',
  })
  reason: string;

  @ApiProperty({
    description: 'Disconnection timestamp',
    example: '2024-01-15T10:30:00Z',
  })
  @IsDate()
  timestamp: Date;
}

export class RoomJoinedEventDto {
  @ApiProperty({
    description: 'Room that was joined',
    example: 'team:123',
  })
  room: string;

  @ApiProperty({
    description: 'Join timestamp',
    example: '2024-01-15T10:30:00Z',
  })
  @IsDate()
  timestamp: Date;
}

export class RoomLeftEventDto {
  @ApiProperty({
    description: 'Room that was left',
    example: 'team:123',
  })
  room: string;

  @ApiProperty({
    description: 'Leave timestamp',
    example: '2024-01-15T10:30:00Z',
  })
  @IsDate()
  timestamp: Date;
}

export class PongResponseDto {
  @ApiProperty({
    description: 'Response timestamp',
    example: '2024-01-15T10:30:00Z',
  })
  @IsDate()
  timestamp: Date;

  @ApiProperty({
    description: 'Original ping data',
    required: false,
  })
  @IsOptional()
  data?: any;
}

export class WebSocketErrorDto {
  @ApiProperty({
    description: 'Event that caused the error',
    example: 'get_presence',
  })
  event: string;

  @ApiProperty({
    description: 'Error message',
    example: 'Failed to get user presence',
  })
  message: string;
}

export class ConnectionStatsDto {
  @ApiProperty({
    description: 'Total number of active connections',
    example: 150,
  })
  totalConnections: number;

  @ApiProperty({
    description: 'Number of unique connected users',
    example: 75,
  })
  uniqueUsers: number;

  @ApiProperty({
    description: 'Connections grouped by organization',
    example: { 'org1': 50, 'org2': 100 },
  })
  connectionsByOrganization: Record<string, number>;
}