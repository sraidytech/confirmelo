import { IsString, IsOptional, IsArray, IsUUID, MinLength, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateTeamDto {
  @ApiProperty({ example: 'Customer Support Team', description: 'Team name' })
  @IsString()
  @MinLength(3)
  @MaxLength(100)
  name: string;

  @ApiPropertyOptional({ 
    example: 'Team responsible for handling customer support orders', 
    description: 'Team description' 
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @ApiProperty({ example: 'user-123', description: 'Team leader user ID' })
  @IsUUID()
  leaderId: string;

  @ApiPropertyOptional({ 
    example: ['user-456', 'user-789'], 
    description: 'Initial team member user IDs' 
  })
  @IsOptional()
  @IsArray()
  @IsUUID(4, { each: true })
  memberIds?: string[];

  @ApiPropertyOptional({ 
    example: ['store-123', 'store-456'], 
    description: 'Initial store assignments' 
  })
  @IsOptional()
  @IsArray()
  @IsUUID(4, { each: true })
  storeIds?: string[];
}

export class UpdateTeamDto {
  @ApiPropertyOptional({ example: 'Customer Support Team', description: 'Team name' })
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(100)
  name?: string;

  @ApiPropertyOptional({ 
    example: 'Team responsible for handling customer support orders', 
    description: 'Team description' 
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @ApiPropertyOptional({ example: 'user-123', description: 'Team leader user ID' })
  @IsOptional()
  @IsUUID()
  leaderId?: string;
}

export class AddTeamMembersDto {
  @ApiProperty({ 
    example: ['user-456', 'user-789'], 
    description: 'User IDs to add to the team' 
  })
  @IsArray()
  @IsUUID(4, { each: true })
  userIds: string[];
}

export class RemoveTeamMembersDto {
  @ApiProperty({ 
    example: ['user-456', 'user-789'], 
    description: 'User IDs to remove from the team' 
  })
  @IsArray()
  @IsUUID(4, { each: true })
  userIds: string[];
}

export class AssignStoresToTeamDto {
  @ApiProperty({ 
    example: ['store-123', 'store-456'], 
    description: 'Store IDs to assign to the team' 
  })
  @IsArray()
  @IsUUID(4, { each: true })
  storeIds: string[];
}

export class UnassignStoresFromTeamDto {
  @ApiProperty({ 
    example: ['store-123', 'store-456'], 
    description: 'Store IDs to unassign from the team' 
  })
  @IsArray()
  @IsUUID(4, { each: true })
  storeIds: string[];
}

export class BulkUserOperationDto {
  @ApiProperty({ 
    example: ['user-456', 'user-789'], 
    description: 'User IDs for bulk operation' 
  })
  @IsArray()
  @IsUUID(4, { each: true })
  userIds: string[];

  @ApiProperty({ 
    example: 'assign_to_team', 
    enum: ['assign_to_team', 'remove_from_team', 'change_role'],
    description: 'Type of bulk operation' 
  })
  @IsString()
  operation: 'assign_to_team' | 'remove_from_team' | 'change_role';

  @ApiPropertyOptional({ example: 'team-123', description: 'Target team ID for assignment operations' })
  @IsOptional()
  @IsUUID()
  teamId?: string;

  @ApiPropertyOptional({ example: 'CALL_CENTER_AGENT', description: 'New role for role change operations' })
  @IsOptional()
  @IsString()
  newRole?: string;
}

export class TeamMemberResponseDto {
  @ApiProperty({ example: 'user-123', description: 'User ID' })
  id: string;

  @ApiProperty({ example: 'john.doe@example.com', description: 'User email' })
  email: string;

  @ApiProperty({ example: 'John Doe', description: 'User full name' })
  fullName: string;

  @ApiProperty({ example: 'CALL_CENTER_AGENT', description: 'User role' })
  role: string;

  @ApiProperty({ example: '2024-01-01T00:00:00Z', description: 'Date joined team' })
  joinedAt: Date;

  @ApiProperty({ example: true, description: 'Online status' })
  isOnline: boolean;
}

export class TeamStoreResponseDto {
  @ApiProperty({ example: 'store-123', description: 'Store ID' })
  id: string;

  @ApiProperty({ example: 'Main Store', description: 'Store name' })
  name: string;

  @ApiProperty({ example: 'MAIN', description: 'Store code' })
  code: string;

  @ApiProperty({ example: '2024-01-01T00:00:00Z', description: 'Date assigned to team' })
  assignedAt: Date;

  @ApiProperty({ example: true, description: 'Store active status' })
  isActive: boolean;
}

export class TeamResponseDto {
  @ApiProperty({ example: 'team-123', description: 'Team ID' })
  id: string;

  @ApiProperty({ example: 'Customer Support Team', description: 'Team name' })
  name: string;

  @ApiPropertyOptional({ 
    example: 'Team responsible for handling customer support orders', 
    description: 'Team description' 
  })
  description?: string;

  @ApiProperty({ example: 'user-123', description: 'Team leader ID' })
  leaderId: string;

  @ApiProperty({ description: 'Team leader details' })
  leader: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    role: string;
  };

  @ApiProperty({ type: [TeamMemberResponseDto], description: 'Team members' })
  members: TeamMemberResponseDto[];

  @ApiProperty({ type: [TeamStoreResponseDto], description: 'Assigned stores' })
  stores: TeamStoreResponseDto[];

  @ApiProperty({ example: 5, description: 'Total member count' })
  memberCount: number;

  @ApiProperty({ example: 3, description: 'Total store count' })
  storeCount: number;

  @ApiProperty({ example: '2024-01-01T00:00:00Z', description: 'Creation date' })
  createdAt: Date;

  @ApiProperty({ example: '2024-01-01T00:00:00Z', description: 'Last update date' })
  updatedAt: Date;
}

export class CreateTeamResponseDto {
  @ApiProperty({ example: true, description: 'Success status' })
  success: boolean;

  @ApiProperty({ example: 'Team created successfully', description: 'Success message' })
  message: string;

  @ApiProperty({ type: TeamResponseDto, description: 'Created team details' })
  team: TeamResponseDto;
}

export class UpdateTeamResponseDto {
  @ApiProperty({ example: true, description: 'Success status' })
  success: boolean;

  @ApiProperty({ example: 'Team updated successfully', description: 'Success message' })
  message: string;

  @ApiProperty({ type: TeamResponseDto, description: 'Updated team details' })
  team: TeamResponseDto;
}

export class TeamMemberOperationResponseDto {
  @ApiProperty({ example: true, description: 'Success status' })
  success: boolean;

  @ApiProperty({ example: 'Team members updated successfully', description: 'Success message' })
  message: string;

  @ApiProperty({ example: 2, description: 'Number of users affected' })
  affectedCount: number;

  @ApiProperty({ type: TeamResponseDto, description: 'Updated team details' })
  team: TeamResponseDto;
}

export class BulkOperationResponseDto {
  @ApiProperty({ example: true, description: 'Success status' })
  success: boolean;

  @ApiProperty({ example: 'Bulk operation completed successfully', description: 'Success message' })
  message: string;

  @ApiProperty({ example: 5, description: 'Number of users processed' })
  processedCount: number;

  @ApiProperty({ example: 5, description: 'Number of successful operations' })
  successCount: number;

  @ApiProperty({ example: 0, description: 'Number of failed operations' })
  failedCount: number;

  @ApiPropertyOptional({ 
    example: ['user-123: User not found'], 
    description: 'List of errors for failed operations' 
  })
  errors?: string[];
}