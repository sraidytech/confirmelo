import { IsEmail, IsString, IsOptional, MinLength, MaxLength, Matches } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { 
  IsStrongPassword, 
  IsValidUsername, 
  IsSafeOrganizationName, 
  IsSafeUrl, 
  IsValidPhoneNumber,
  NoSqlInjection, 
  NoXss 
} from '../../../common/validation/decorators/validation.decorators';

export class OrganizationRegistrationDto {
  @ApiProperty({ example: 'Acme E-commerce Store', description: 'Organization name' })
  @IsString({ message: 'Organization name must be a string' })
  @MinLength(2, { message: 'Organization name must be at least 2 characters long' })
  @MaxLength(100, { message: 'Organization name must be no more than 100 characters long' })
  @IsSafeOrganizationName()
  @NoSqlInjection()
  @NoXss()
  @Transform(({ value }) => value?.trim())
  name: string;

  @ApiProperty({ example: 'contact@acme-store.com', description: 'Business email address' })
  @IsEmail({}, { message: 'Please provide a valid business email address' })
  @NoSqlInjection()
  @NoXss()
  @Transform(({ value }) => value?.toLowerCase()?.trim())
  email: string;

  @ApiPropertyOptional({ example: '+212600000000', description: 'Business phone number' })
  @IsOptional()
  @IsString({ message: 'Phone number must be a string' })
  @IsValidPhoneNumber()
  @NoSqlInjection()
  @NoXss()
  @Transform(({ value }) => value?.trim())
  phone?: string;

  @ApiPropertyOptional({ example: '123 Business Street', description: 'Business address' })
  @IsOptional()
  @IsString({ message: 'Address must be a string' })
  @MaxLength(255, { message: 'Address must be no more than 255 characters long' })
  @NoSqlInjection()
  @NoXss()
  @Transform(({ value }) => value?.trim())
  address?: string;

  @ApiPropertyOptional({ example: 'Casablanca', description: 'City' })
  @IsOptional()
  @IsString({ message: 'City must be a string' })
  @MaxLength(100, { message: 'City must be no more than 100 characters long' })
  @NoSqlInjection()
  @NoXss()
  @Transform(({ value }) => value?.trim())
  city?: string;

  @ApiPropertyOptional({ example: 'https://acme-store.com', description: 'Website URL' })
  @IsOptional()
  @IsString({ message: 'Website URL must be a string' })
  @MaxLength(255, { message: 'Website URL must be no more than 255 characters long' })
  @IsSafeUrl()
  @NoSqlInjection()
  @NoXss()
  @Transform(({ value }) => value?.trim())
  website?: string;

  @ApiPropertyOptional({ example: '12345678', description: 'Tax ID number' })
  @IsOptional()
  @IsString({ message: 'Tax ID must be a string' })
  @MaxLength(50, { message: 'Tax ID must be no more than 50 characters long' })
  @NoSqlInjection()
  @NoXss()
  @Transform(({ value }) => value?.trim()?.toUpperCase())
  taxId?: string;
}

export class AdminUserRegistrationDto {
  @ApiProperty({ example: 'admin@acme-store.com', description: 'Admin email address' })
  @IsEmail({}, { message: 'Please provide a valid admin email address' })
  @NoSqlInjection()
  @NoXss()
  @Transform(({ value }) => value?.toLowerCase()?.trim())
  email: string;

  @ApiProperty({ example: 'adminuser', description: 'Username for the admin' })
  @IsString({ message: 'Username must be a string' })
  @MinLength(3, { message: 'Username must be at least 3 characters long' })
  @MaxLength(50, { message: 'Username must be no more than 50 characters long' })
  @IsValidUsername()
  @NoSqlInjection()
  @NoXss()
  @Transform(({ value }) => value?.toLowerCase()?.trim())
  username: string;

  @ApiProperty({ example: 'SecurePassword123!', description: 'Strong password' })
  @IsString({ message: 'Password must be a string' })
  @MinLength(12, { message: 'Password must be at least 12 characters long' })
  @MaxLength(128, { message: 'Password must be no more than 128 characters long' })
  @IsStrongPassword()
  @NoSqlInjection()
  @NoXss()
  password: string;

  @ApiProperty({ example: 'John', description: 'First name' })
  @IsString({ message: 'First name must be a string' })
  @MinLength(1, { message: 'First name is required' })
  @MaxLength(50, { message: 'First name must be no more than 50 characters long' })
  @NoSqlInjection()
  @NoXss()
  @Transform(({ value }) => value?.trim())
  firstName: string;

  @ApiProperty({ example: 'Doe', description: 'Last name' })
  @IsString({ message: 'Last name must be a string' })
  @MinLength(1, { message: 'Last name is required' })
  @MaxLength(50, { message: 'Last name must be no more than 50 characters long' })
  @NoSqlInjection()
  @NoXss()
  @Transform(({ value }) => value?.trim())
  lastName: string;

  @ApiPropertyOptional({ example: '+212600000001', description: 'Personal phone number' })
  @IsOptional()
  @IsString({ message: 'Phone number must be a string' })
  @IsValidPhoneNumber()
  @NoSqlInjection()
  @NoXss()
  @Transform(({ value }) => value?.trim())
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