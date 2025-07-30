import { IsEmail, IsString, IsBoolean, IsOptional, MinLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { NoSqlInjection, NoXss } from '../../../common/validation/decorators/validation.decorators';

export class LoginDto {
  @ApiProperty({ example: 'admin@example.com', description: 'User email address' })
  @IsEmail({}, { message: 'Please provide a valid email address' })
  @NoSqlInjection()
  @NoXss()
  @Transform(({ value }) => value?.toLowerCase()?.trim())
  email: string;

  @ApiProperty({ example: 'SecurePassword123!', description: 'User password' })
  @IsString({ message: 'Password must be a string' })
  @MinLength(1, { message: 'Password is required' })
  @NoSqlInjection()
  @NoXss()
  password: string;

  @ApiPropertyOptional({ example: true, description: 'Remember me for extended session' })
  @IsOptional()
  @IsBoolean({ message: 'Remember me must be a boolean value' })
  rememberMe?: boolean;
}

export class LoginResponseDto {
  @ApiProperty({ example: true, description: 'Login success status' })
  success: boolean;

  @ApiProperty({ example: 'Login successful', description: 'Success message' })
  message: string;

  @ApiProperty({ description: 'User information' })
  user: {
    id: string;
    email: string;
    username: string;
    firstName: string;
    lastName: string;
    role: string;
    status: string;
    organizationId?: string;
    isOnline: boolean;
  };

  @ApiProperty({ description: 'Authentication tokens' })
  tokens: {
    accessToken: string;
    refreshToken: string;
    expiresIn: number;
  };

  @ApiProperty({ example: 'session-123', description: 'Session identifier' })
  sessionId: string;
}

export class RefreshTokenDto {
  @ApiProperty({ example: 'refresh-token-here', description: 'Refresh token' })
  @IsString({ message: 'Refresh token must be a string' })
  @MinLength(10, { message: 'Invalid refresh token format' })
  @NoSqlInjection()
  @NoXss()
  refreshToken: string;
}

export class RefreshTokenResponseDto {
  @ApiProperty({ example: true, description: 'Refresh success status' })
  success: boolean;

  @ApiProperty({ example: 'Token refreshed successfully', description: 'Success message' })
  message: string;

  @ApiProperty({ description: 'New authentication tokens' })
  tokens: {
    accessToken: string;
    refreshToken: string;
    expiresIn: number;
  };
}