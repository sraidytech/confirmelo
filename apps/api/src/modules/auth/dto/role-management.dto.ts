import { IsEnum, IsString, IsOptional, IsBoolean, IsUUID } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';

export class AssignRoleDto {
  @ApiProperty({ description: 'User ID to assign role to' })
  @IsUUID()
  userId: string;

  @ApiProperty({ enum: UserRole, description: 'Role to assign' })
  @IsEnum(UserRole)
  role: UserRole;

  @ApiPropertyOptional({ description: 'Organization ID (for super admin use)' })
  @IsOptional()
  @IsUUID()
  organizationId?: string;

  @ApiPropertyOptional({ description: 'Reason for role assignment' })
  @IsOptional()
  @IsString()
  reason?: string;
}

export class RemoveRoleDto {
  @ApiProperty({ description: 'User ID to remove role from' })
  @IsUUID()
  userId: string;

  @ApiPropertyOptional({ description: 'Reason for role removal' })
  @IsOptional()
  @IsString()
  reason?: string;
}

export class AssignTeamDto {
  @ApiProperty({ description: 'User ID to assign to team' })
  @IsUUID()
  userId: string;

  @ApiProperty({ description: 'Team ID' })
  @IsUUID()
  teamId: string;

  @ApiPropertyOptional({ description: 'Whether user should be team leader' })
  @IsOptional()
  @IsBoolean()
  isLeader?: boolean;
}

export class RemoveTeamDto {
  @ApiProperty({ description: 'User ID to remove from team' })
  @IsUUID()
  userId: string;

  @ApiProperty({ description: 'Team ID' })
  @IsUUID()
  teamId: string;
}

export class AssignStoreDto {
  @ApiProperty({ description: 'Team ID to assign to store' })
  @IsUUID()
  teamId: string;

  @ApiProperty({ description: 'Store ID' })
  @IsUUID()
  storeId: string;
}

export class RemoveStoreDto {
  @ApiProperty({ description: 'Team ID to remove from store' })
  @IsUUID()
  teamId: string;

  @ApiProperty({ description: 'Store ID' })
  @IsUUID()
  storeId: string;
}

export class UserPermissionsResponseDto {
  @ApiProperty({ enum: UserRole })
  role: UserRole;

  @ApiProperty({ type: [String] })
  permissions: string[];

  @ApiProperty()
  organizationAccess: boolean;

  @ApiProperty({ type: [String] })
  storeAccess: string[];

  @ApiProperty({ type: [String] })
  teamAccess: string[];
}

export class RoleHistoryResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  action: string;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  details: any;

  @ApiProperty()
  assignedBy: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
  };
}

export class AvailableRolesResponseDto {
  @ApiProperty({ enum: UserRole, isArray: true })
  roles: UserRole[];
}