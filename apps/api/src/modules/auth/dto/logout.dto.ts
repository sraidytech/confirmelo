import { IsOptional, IsBoolean, IsString, MinLength, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { NoSqlInjection, NoXss } from '../../../common/validation/decorators/validation.decorators';

export class LogoutDto {
  @ApiProperty({
    description: 'Session ID to logout from (optional)',
    required: false,
    example: 'session_123456789',
  })
  @IsOptional()
  @IsString({ message: 'Session ID must be a string' })
  @MinLength(10, { message: 'Invalid session ID format' })
  @MaxLength(128, { message: 'Session ID is too long' })
  @NoSqlInjection()
  @NoXss()
  @Transform(({ value }) => value?.trim())
  sessionId?: string;

  @ApiProperty({
    description: 'Whether to logout from all devices/sessions',
    required: false,
    default: false,
    example: false,
  })
  @IsOptional()
  @IsBoolean({ message: 'Logout from all must be a boolean value' })
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