import { IsEmail, IsString, IsBoolean, IsOptional, MinLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class LoginDto {
  @ApiProperty({ example: 'admin@example.com', description: 'User email address' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'SecurePassword123!', description: 'User password' })
  @IsString()
  @MinLength(1)
  password: string;

  @ApiPropertyOptional({ example: true, description: 'Remember me for extended session' })
  @IsOptional()
  @IsBoolean()
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
  @IsString()
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