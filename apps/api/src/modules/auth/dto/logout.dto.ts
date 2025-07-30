import { IsOptional, IsBoolean, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class LogoutDto {
  @ApiProperty({
    description: 'Session ID to logout from (optional)',
    required: false,
    example: 'session_123456789',
  })
  @IsOptional()
  @IsString()
  sessionId?: string;

  @ApiProperty({
    description: 'Whether to logout from all devices/sessions',
    required: false,
    default: false,
    example: false,
  })
  @IsOptional()
  @IsBoolean()
  logoutFromAll?: boolean;
}

export class LogoutResponse {
  @ApiProperty({
    description: 'Success message',
    example: 'Logout successful',
  })
  message: string;

  @ApiProperty({
    description: 'User ID that was logged out',
    example: 'user_123456789',
  })
  userId: string;

  @ApiProperty({
    description: 'Timestamp of logout',
    example: '2024-01-15T10:30:00.000Z',
  })
  timestamp: string;
}