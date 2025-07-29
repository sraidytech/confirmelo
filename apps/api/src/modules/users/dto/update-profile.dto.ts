import { IsEmail, IsString, IsOptional, MinLength, MaxLength, Matches, IsPhoneNumber } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateProfileDto {
  @ApiPropertyOptional({ example: 'john.doe@example.com', description: 'Email address' })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional({ example: 'johndoe', description: 'Username' })
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(50)
  @Matches(/^[a-zA-Z0-9_-]+$/, {
    message: 'Username can only contain letters, numbers, underscores, and hyphens',
  })
  username?: string;

  @ApiPropertyOptional({ example: 'John', description: 'First name' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(50)
  firstName?: string;

  @ApiPropertyOptional({ example: 'Doe', description: 'Last name' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(50)
  lastName?: string;

  @ApiPropertyOptional({ example: '+212600000000', description: 'Phone number' })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional({ example: 'https://example.com/avatar.jpg', description: 'Avatar URL' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  avatar?: string;
}

export class ChangePasswordDto {
  @ApiProperty({ example: 'CurrentPassword123!', description: 'Current password' })
  @IsString()
  @MinLength(1)
  currentPassword: string;

  @ApiProperty({ example: 'NewSecurePassword123!', description: 'New password' })
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  newPassword: string;
}

export class ProfileResponseDto {
  @ApiProperty({ example: 'cuid123', description: 'User ID' })
  id: string;

  @ApiProperty({ example: 'john.doe@example.com', description: 'Email address' })
  email: string;

  @ApiProperty({ example: 'johndoe', description: 'Username' })
  username: string;

  @ApiProperty({ example: 'John', description: 'First name' })
  firstName: string;

  @ApiProperty({ example: 'Doe', description: 'Last name' })
  lastName: string;

  @ApiPropertyOptional({ example: '+212600000000', description: 'Phone number' })
  phone?: string;

  @ApiPropertyOptional({ example: 'https://example.com/avatar.jpg', description: 'Avatar URL' })
  avatar?: string;

  @ApiProperty({ example: 'ADMIN', description: 'User role' })
  role: string;

  @ApiProperty({ example: 'ACTIVE', description: 'User status' })
  status: string;

  @ApiProperty({ example: true, description: 'Online status' })
  isOnline: boolean;

  @ApiPropertyOptional({ example: '2024-01-01T00:00:00Z', description: 'Last activity timestamp' })
  lastActiveAt?: Date;

  @ApiPropertyOptional({ example: 'org123', description: 'Organization ID' })
  organizationId?: string;

  @ApiProperty({ description: 'Organization details' })
  organization?: {
    id: string;
    name: string;
    code: string;
    email: string;
    country: string;
    timezone: string;
    currency: string;
  };

  @ApiProperty({ example: '2024-01-01T00:00:00Z', description: 'Account creation date' })
  createdAt: Date;

  @ApiProperty({ example: '2024-01-01T00:00:00Z', description: 'Last update date' })
  updatedAt: Date;
}

export class UpdateProfileResponseDto {
  @ApiProperty({ example: true, description: 'Update success status' })
  success: boolean;

  @ApiProperty({ example: 'Profile updated successfully', description: 'Success message' })
  message: string;

  @ApiProperty({ description: 'Updated user profile' })
  user: ProfileResponseDto;
}

export class ChangePasswordResponseDto {
  @ApiProperty({ example: true, description: 'Password change success status' })
  success: boolean;

  @ApiProperty({ example: 'Password changed successfully', description: 'Success message' })
  message: string;
}