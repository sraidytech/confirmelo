import { IsEmail, IsString, IsOptional, MinLength, MaxLength, Matches, IsPhoneNumber } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class OrganizationRegistrationDto {
  @ApiProperty({ example: 'Acme E-commerce Store', description: 'Organization name' })
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name: string;

  @ApiProperty({ example: 'contact@acme-store.com', description: 'Business email address' })
  @IsEmail()
  email: string;

  @ApiPropertyOptional({ example: '+212600000000', description: 'Business phone number' })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional({ example: '123 Business Street', description: 'Business address' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  address?: string;

  @ApiPropertyOptional({ example: 'Casablanca', description: 'City' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  city?: string;

  @ApiPropertyOptional({ example: 'https://acme-store.com', description: 'Website URL' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  website?: string;

  @ApiPropertyOptional({ example: '12345678', description: 'Tax ID number' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  taxId?: string;
}

export class AdminUserRegistrationDto {
  @ApiProperty({ example: 'admin@acme-store.com', description: 'Admin email address' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'adminuser', description: 'Username for the admin' })
  @IsString()
  @MinLength(3)
  @MaxLength(50)
  @Matches(/^[a-zA-Z0-9_-]+$/, {
    message: 'Username can only contain letters, numbers, underscores, and hyphens',
  })
  username: string;

  @ApiProperty({ example: 'SecurePassword123!', description: 'Strong password' })
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password: string;

  @ApiProperty({ example: 'John', description: 'First name' })
  @IsString()
  @MinLength(1)
  @MaxLength(50)
  firstName: string;

  @ApiProperty({ example: 'Doe', description: 'Last name' })
  @IsString()
  @MinLength(1)
  @MaxLength(50)
  lastName: string;

  @ApiPropertyOptional({ example: '+212600000001', description: 'Personal phone number' })
  @IsOptional()
  @IsString()
  phone?: string;
}

export class RegisterOrganizationDto {
  @ApiProperty({ description: 'Organization details' })
  organization: OrganizationRegistrationDto;

  @ApiProperty({ description: 'Admin user details' })
  adminUser: AdminUserRegistrationDto;
}

export class RegisterResponseDto {
  @ApiProperty({ example: true, description: 'Registration success status' })
  success: boolean;

  @ApiProperty({ example: 'Organization registered successfully', description: 'Success message' })
  message: string;

  @ApiProperty({ description: 'Organization details' })
  organization: {
    id: string;
    name: string;
    code: string;
    email: string;
  };

  @ApiProperty({ description: 'Admin user details' })
  user: {
    id: string;
    email: string;
    username: string;
    firstName: string;
    lastName: string;
    role: string;
    status: string;
  };
}