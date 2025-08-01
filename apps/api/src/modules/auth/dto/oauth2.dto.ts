import { IsString, IsEnum, IsOptional, IsArray, IsUrl, IsNotEmpty } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PlatformType } from '@prisma/client';

export class InitiateOAuth2Dto {
  @ApiProperty({
    description: 'Platform type for OAuth2 integration',
    enum: PlatformType,
    example: PlatformType.YOUCAN,
  })
  @IsEnum(PlatformType)
  @IsNotEmpty()
  platformType: PlatformType;

  @ApiProperty({
    description: 'Human-readable name for the connection',
    example: 'My Youcan Store',
  })
  @IsString()
  @IsNotEmpty()
  platformName: string;

  @ApiPropertyOptional({
    description: 'Additional platform-specific configuration',
    example: { storeId: 'store_123', customSettings: true },
  })
  @IsOptional()
  platformData?: any;
}

export class CompleteOAuth2Dto {
  @ApiProperty({
    description: 'Authorization code received from OAuth2 provider',
    example: 'auth_code_12345',
  })
  @IsString()
  @IsNotEmpty()
  code: string;

  @ApiProperty({
    description: 'State parameter for CSRF protection',
    example: 'state_abcdef123456',
  })
  @IsString()
  @IsNotEmpty()
  state: string;

  @ApiPropertyOptional({
    description: 'Error code if authorization failed',
    example: 'access_denied',
  })
  @IsOptional()
  @IsString()
  error?: string;

  @ApiPropertyOptional({
    description: 'Error description if authorization failed',
    example: 'The user denied the request',
  })
  @IsOptional()
  @IsString()
  error_description?: string;
}

export class OAuth2AuthorizationResponseDto {
  @ApiProperty({
    description: 'Authorization URL to redirect user to',
    example: 'https://oauth.provider.com/authorize?client_id=123&redirect_uri=...',
  })
  @IsUrl()
  authorizationUrl: string;

  @ApiProperty({
    description: 'State parameter for CSRF protection',
    example: 'state_abcdef123456',
  })
  @IsString()
  state: string;

  @ApiPropertyOptional({
    description: 'PKCE code verifier (for debugging, not sent to client)',
    example: 'code_verifier_xyz789',
  })
  @IsOptional()
  @IsString()
  codeVerifier?: string;

  @ApiPropertyOptional({
    description: 'PKCE code challenge (for debugging, not sent to client)',
    example: 'code_challenge_abc123',
  })
  @IsOptional()
  @IsString()
  codeChallenge?: string;
}

export class OAuth2ConnectionResponseDto {
  @ApiProperty({
    description: 'Unique identifier for the connection',
    example: 'conn_12345',
  })
  @IsString()
  id: string;

  @ApiProperty({
    description: 'Platform type',
    enum: PlatformType,
    example: PlatformType.YOUCAN,
  })
  @IsEnum(PlatformType)
  platformType: PlatformType;

  @ApiProperty({
    description: 'Human-readable name for the connection',
    example: 'My Youcan Store',
  })
  @IsString()
  platformName: string;

  @ApiProperty({
    description: 'Connection status',
    example: 'ACTIVE',
  })
  @IsString()
  status: string;

  @ApiProperty({
    description: 'OAuth2 scopes granted',
    example: ['read_orders', 'write_orders'],
  })
  @IsArray()
  @IsString({ each: true })
  scopes: string[];

  @ApiPropertyOptional({
    description: 'Token expiration date',
    example: '2024-12-31T23:59:59Z',
  })
  @IsOptional()
  tokenExpiresAt?: Date;

  @ApiPropertyOptional({
    description: 'Last successful sync timestamp',
    example: '2024-01-15T10:30:00Z',
  })
  @IsOptional()
  lastSyncAt?: Date;

  @ApiPropertyOptional({
    description: 'Number of successful syncs',
    example: 42,
  })
  @IsOptional()
  syncCount?: number;

  @ApiPropertyOptional({
    description: 'Platform-specific data',
    example: { storeId: 'store_123', storeName: 'My Store' },
  })
  @IsOptional()
  platformData?: any;

  @ApiProperty({
    description: 'Connection creation timestamp',
    example: '2024-01-01T00:00:00Z',
  })
  createdAt: Date;

  @ApiProperty({
    description: 'Connection last update timestamp',
    example: '2024-01-15T10:30:00Z',
  })
  updatedAt: Date;
}

export class RefreshTokenDto {
  @ApiProperty({
    description: 'Connection ID to refresh token for',
    example: 'conn_12345',
  })
  @IsString()
  @IsNotEmpty()
  connectionId: string;
}

export class RevokeConnectionDto {
  @ApiProperty({
    description: 'Connection ID to revoke',
    example: 'conn_12345',
  })
  @IsString()
  @IsNotEmpty()
  connectionId: string;

  @ApiPropertyOptional({
    description: 'Reason for revoking the connection',
    example: 'User requested disconnection',
  })
  @IsOptional()
  @IsString()
  reason?: string;
}

export class TestConnectionDto {
  @ApiProperty({
    description: 'Connection ID to test',
    example: 'conn_12345',
  })
  @IsString()
  @IsNotEmpty()
  connectionId: string;
}

export class ConnectionTestResultDto {
  @ApiProperty({
    description: 'Whether the connection test was successful',
    example: true,
  })
  success: boolean;

  @ApiPropertyOptional({
    description: 'Error message if test failed',
    example: 'Access token expired',
  })
  @IsOptional()
  @IsString()
  error?: string;

  @ApiPropertyOptional({
    description: 'Additional test details',
    example: { responseTime: 250, apiVersion: 'v1.0' },
  })
  @IsOptional()
  details?: any;

  @ApiProperty({
    description: 'Test execution timestamp',
    example: '2024-01-15T10:30:00Z',
  })
  testedAt: Date;
}

export class ListConnectionsQueryDto {
  @ApiPropertyOptional({
    description: 'Filter by platform type',
    enum: PlatformType,
    example: PlatformType.YOUCAN,
  })
  @IsOptional()
  @IsEnum(PlatformType)
  platformType?: PlatformType;

  @ApiPropertyOptional({
    description: 'Filter by connection status',
    example: 'ACTIVE',
  })
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional({
    description: 'Page number for pagination',
    example: 1,
  })
  @IsOptional()
  page?: number;

  @ApiPropertyOptional({
    description: 'Number of items per page',
    example: 10,
  })
  @IsOptional()
  limit?: number;
}

export class ConnectionListResponseDto {
  @ApiProperty({
    description: 'List of connections',
    type: [OAuth2ConnectionResponseDto],
  })
  connections: OAuth2ConnectionResponseDto[];

  @ApiProperty({
    description: 'Total number of connections',
    example: 25,
  })
  total: number;

  @ApiProperty({
    description: 'Current page number',
    example: 1,
  })
  page: number;

  @ApiProperty({
    description: 'Number of items per page',
    example: 10,
  })
  limit: number;

  @ApiProperty({
    description: 'Total number of pages',
    example: 3,
  })
  totalPages: number;
}