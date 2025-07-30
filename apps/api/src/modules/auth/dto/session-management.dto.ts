import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsOptional, IsBoolean, IsDateString, MinLength, MaxLength } from 'class-validator';
import { Transform } from 'class-transformer';
import { NoSqlInjection, NoXss } from '../../../common/validation/decorators/validation.decorators';

export class GetSessionsDto {
  @ApiProperty({ description: 'Include expired sessions', required: false })
  @IsOptional()
  @IsBoolean()
  includeExpired?: boolean;
}

export class TerminateSessionDto {
  @ApiProperty({ description: 'Session ID to terminate' })
  @IsString({ message: 'Session ID must be a string' })
  @MinLength(10, { message: 'Invalid session ID format' })
  @MaxLength(128, { message: 'Session ID is too long' })
  @NoSqlInjection()
  @NoXss()
  @Transform(({ value }) => value?.trim())
  sessionId: string;

  @ApiProperty({ description: 'Reason for termination', required: false })
  @IsOptional()
  @IsString({ message: 'Reason must be a string' })
  @MaxLength(255, { message: 'Reason must be no more than 255 characters long' })
  @NoSqlInjection()
  @NoXss()
  @Transform(({ value }) => value?.trim())
  reason?: string;
}

export class SessionInfoDto {
  @ApiProperty({ description: 'Session ID' })
  id: string;

  @ApiProperty({ description: 'Session token (masked)' })
  sessionToken: string;

  @ApiProperty({ description: 'User ID' })
  userId: string;

  @ApiProperty({ description: 'IP address' })
  ipAddress?: string;

  @ApiProperty({ description: 'User agent' })
  userAgent?: string;

  @ApiProperty({ description: 'Device information' })
  deviceInfo: {
    browser?: string;
    os?: string;
    device?: string;
    isMobile: boolean;
  };

  @ApiProperty({ description: 'Location information' })
  locationInfo: {
    country?: string;
    city?: string;
    region?: string;
    timezone?: string;
  };

  @ApiProperty({ description: 'Session creation date' })
  createdAt: Date;

  @ApiProperty({ description: 'Session expiration date' })
  expiresAt: Date;

  @ApiProperty({ description: 'Last activity timestamp' })
  lastActivity?: Date;

  @ApiProperty({ description: 'Whether this is the current session' })
  isCurrent: boolean;

  @ApiProperty({ description: 'Whether session is suspicious' })
  isSuspicious: boolean;

  @ApiProperty({ description: 'Suspicious activity reasons' })
  suspiciousReasons?: string[];
}

export class SessionActivityDto {
  @ApiProperty({ description: 'Activity ID' })
  id: string;

  @ApiProperty({ description: 'Session ID' })
  sessionId: string;

  @ApiProperty({ description: 'Activity type' })
  type: string;

  @ApiProperty({ description: 'Activity description' })
  description: string;

  @ApiProperty({ description: 'IP address' })
  ipAddress?: string;

  @ApiProperty({ description: 'User agent' })
  userAgent?: string;

  @ApiProperty({ description: 'Activity timestamp' })
  timestamp: Date;

  @ApiProperty({ description: 'Additional metadata' })
  metadata?: Record<string, any>;
}

export class GetSessionsResponse {
  @ApiProperty({ description: 'List of user sessions', type: [SessionInfoDto] })
  sessions: SessionInfoDto[];

  @ApiProperty({ description: 'Total number of sessions' })
  total: number;

  @ApiProperty({ description: 'Number of active sessions' })
  activeCount: number;

  @ApiProperty({ description: 'Number of suspicious sessions' })
  suspiciousCount: number;
}

export class TerminateSessionResponse {
  @ApiProperty({ description: 'Success message' })
  message: string;

  @ApiProperty({ description: 'Terminated session ID' })
  sessionId: string;

  @ApiProperty({ description: 'Termination timestamp' })
  timestamp: string;
}

export class SessionStatsDto {
  @ApiProperty({ description: 'Total sessions' })
  totalSessions: number;

  @ApiProperty({ description: 'Active sessions' })
  activeSessions: number;

  @ApiProperty({ description: 'Expired sessions' })
  expiredSessions: number;

  @ApiProperty({ description: 'Suspicious sessions' })
  suspiciousSessions: number;

  @ApiProperty({ description: 'Sessions by device type' })
  deviceBreakdown: {
    desktop: number;
    mobile: number;
    tablet: number;
    unknown: number;
  };

  @ApiProperty({ description: 'Sessions by location' })
  locationBreakdown: Record<string, number>;

  @ApiProperty({ description: 'Recent activity count (last 24h)' })
  recentActivityCount: number;
}