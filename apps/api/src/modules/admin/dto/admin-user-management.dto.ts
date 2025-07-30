import { IsEmail, IsString, IsOptional, IsEnum, IsPhoneNumber, MinLength, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { UserRole, UserStatus } from '@prisma/client';

export class CreateUserDto {
  @ApiProperty({ example: 'john.doe@example.com', description: 'User email address' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'johndoe', description: 'Unique username' })
  @IsString()
  @MinLength(3)
  @MaxLength(50)
  username: string;

  @ApiProperty({ example: 'SecurePassword123!', description: 'User password' })
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password: string;

  @ApiProperty({ example: 'John', description: 'User first name' })
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  firstName: string;

  @ApiProperty({ example: 'Doe', description: 'User last name' })
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  lastName: string;

  @ApiPropertyOptional({ example: '+1234567890', description: 'User phone number' })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiProperty({ 
    enum: UserRole, 
    example: 'CALL_CENTER_AGENT', 
    description: 'User role in the system' 
  })
  @IsEnum(UserRole)
  role: UserRole;

  @ApiPropertyOptional({ 
    example: 'https://example.com/avatar.jpg', 
    description: 'User avatar URL' 
  })
  @IsOptional()
  @IsString()
  avatar?: string;
}

export class UpdateUserDto {
  @ApiPropertyOptional({ example: 'john.doe@example.com', description: 'User email address' })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional({ example: 'johndoe', description: 'Unique username' })
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(50)
  username?: string;

  @ApiPropertyOptional({ example: 'John', description: 'User first name' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  firstName?: string;

  @ApiPropertyOptional({ example: 'Doe', description: 'User last name' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  lastName?: string;

  @ApiPropertyOptional({ example: '+1234567890', description: 'User phone number' })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional({ 
    enum: UserRole, 
    example: 'TEAM_LEADER', 
    description: 'User role in the system' 
  })
  @IsOptional()
  @IsEnum(UserRole)
  role?: UserRole;

  @ApiPropertyOptional({ 
    example: 'https://example.com/avatar.jpg', 
    description: 'User avatar URL' 
  })
  @IsOptional()
  @IsString()
  avatar?: string;
}

export class UserSuspensionDto {
  @ApiProperty({ 
    example: 'Policy violation - inappropriate behavior', 
    description: 'Reason for suspension' 
  })
  @IsString()
  @MinLength(10)
  @MaxLength(500)
  reason: string;
}

export class UserActivationDto {
  @ApiPropertyOptional({ 
    example: 'Account verified and cleared for activation', 
    description: 'Reason for activation' 
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

export class AdminUserResponseDto {
  @ApiProperty({ example: 'user-123', description: 'User ID' })
  id: string;

  @ApiProperty({ example: 'john.doe@example.com', description: 'User email' })
  email: string;

  @ApiProperty({ example: 'johndoe', description: 'Username' })
  username: string;

  @ApiProperty({ example: 'John', description: 'First name' })
  firstName: string;

  @ApiProperty({ example: 'Doe', description: 'Last name' })
  lastName: string;

  @ApiPropertyOptional({ example: '+1234567890', description: 'Phone number' })
  phone?: string;

  @ApiPropertyOptional({ example: 'https://example.com/avatar.jpg', description: 'Avatar URL' })
  avatar?: string;

  @ApiProperty({ enum: UserRole, example: 'CALL_CENTER_AGENT', description: 'User role' })
  role: UserRole;

  @ApiProperty({ enum: UserStatus, example: 'ACTIVE', description: 'User status' })
  status: UserStatus;

  @ApiProperty({ example: true, description: 'Online status' })
  isOnline: boolean;

  @ApiPropertyOptional({ example: '2024-01-01T00:00:00Z', description: 'Last activity' })
  lastActiveAt?: Date;

  @ApiProperty({ example: '2024-01-01T00:00:00Z', description: 'Creation date' })
  createdAt: Date;

  @ApiProperty({ example: '2024-01-01T00:00:00Z', description: 'Last update date' })
  updatedAt: Date;

  @ApiPropertyOptional({ description: 'Organization details' })
  organization?: {
    id: string;
    name: string;
    code: string;
  };
}

export class CreateUserResponseDto {
  @ApiProperty({ example: true, description: 'Success status' })
  success: boolean;

  @ApiProperty({ example: 'User created successfully', description: 'Success message' })
  message: string;

  @ApiProperty({ type: AdminUserResponseDto, description: 'Created user details' })
  user: AdminUserResponseDto;
}

export class UpdateUserResponseDto {
  @ApiProperty({ example: true, description: 'Success status' })
  success: boolean;

  @ApiProperty({ example: 'User updated successfully', description: 'Success message' })
  message: string;

  @ApiProperty({ type: AdminUserResponseDto, description: 'Updated user details' })
  user: AdminUserResponseDto;
}

export class UserStatusChangeResponseDto {
  @ApiProperty({ example: true, description: 'Success status' })
  success: boolean;

  @ApiProperty({ example: 'User suspended successfully', description: 'Success message' })
  message: string;

  @ApiProperty({ type: AdminUserResponseDto, description: 'Updated user details' })
  user: AdminUserResponseDto;

  @ApiProperty({ example: 'ACTIVE', description: 'Previous status' })
  previousStatus: UserStatus;

  @ApiProperty({ example: 'SUSPENDED', description: 'New status' })
  newStatus: UserStatus;

  @ApiProperty({ example: 'admin-123', description: 'ID of admin who made the change' })
  changedBy: string;

  @ApiProperty({ example: '2024-01-01T00:00:00Z', description: 'When the change was made' })
  changedAt: Date;

  @ApiPropertyOptional({ example: 'Policy violation', description: 'Reason for status change' })
  reason?: string;
}