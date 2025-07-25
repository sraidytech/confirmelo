import { IsString, IsUUID, IsOptional, IsArray } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class AssignUserToTeamDto {
  @ApiProperty({
    description: 'ID of the team to assign the user to',
    example: 'clp123456789',
  })
  @IsString()
  @IsUUID()
  teamId: string;

  @ApiProperty({
    description: 'ID of the user to assign to the team',
    example: 'clp987654321',
  })
  @IsString()
  @IsUUID()
  userId: string;
}

export class RemoveUserFromTeamDto {
  @ApiProperty({
    description: 'ID of the team to remove the user from',
    example: 'clp123456789',
  })
  @IsString()
  @IsUUID()
  teamId: string;

  @ApiProperty({
    description: 'ID of the user to remove from the team',
    example: 'clp987654321',
  })
  @IsString()
  @IsUUID()
  userId: string;
}

export class AssignStoreToTeamDto {
  @ApiProperty({
    description: 'ID of the team to assign the store to',
    example: 'clp123456789',
  })
  @IsString()
  @IsUUID()
  teamId: string;

  @ApiProperty({
    description: 'ID of the store to assign to the team',
    example: 'clp555666777',
  })
  @IsString()
  @IsUUID()
  storeId: string;
}

export class RemoveStoreFromTeamDto {
  @ApiProperty({
    description: 'ID of the team to remove the store from',
    example: 'clp123456789',
  })
  @IsString()
  @IsUUID()
  teamId: string;

  @ApiProperty({
    description: 'ID of the store to remove from the team',
    example: 'clp555666777',
  })
  @IsString()
  @IsUUID()
  storeId: string;
}

export class BulkAssignUsersToTeamDto {
  @ApiProperty({
    description: 'ID of the team to assign users to',
    example: 'clp123456789',
  })
  @IsString()
  @IsUUID()
  teamId: string;

  @ApiProperty({
    description: 'Array of user IDs to assign to the team',
    example: ['clp987654321', 'clp111222333'],
    type: [String],
  })
  @IsArray()
  @IsString({ each: true })
  @IsUUID(undefined, { each: true })
  userIds: string[];
}

export class BulkAssignStoresToTeamDto {
  @ApiProperty({
    description: 'ID of the team to assign stores to',
    example: 'clp123456789',
  })
  @IsString()
  @IsUUID()
  teamId: string;

  @ApiProperty({
    description: 'Array of store IDs to assign to the team',
    example: ['clp555666777', 'clp888999000'],
    type: [String],
  })
  @IsArray()
  @IsString({ each: true })
  @IsUUID(undefined, { each: true })
  storeIds: string[];
}

export class ValidateAccessDto {
  @ApiProperty({
    description: 'ID of the user to validate access for',
    example: 'clp987654321',
  })
  @IsString()
  @IsUUID()
  userId: string;

  @ApiProperty({
    description: 'ID of the resource (team or store) to validate access to',
    example: 'clp123456789',
  })
  @IsString()
  @IsUUID()
  resourceId: string;

  @ApiProperty({
    description: 'Type of resource to validate access to',
    example: 'team',
    enum: ['team', 'store'],
  })
  @IsString()
  resourceType: 'team' | 'store';
}

export class UserAccessValidationResponseDto {
  @ApiProperty({
    description: 'Whether the user has access to the resource',
    example: true,
  })
  hasAccess: boolean;

  @ApiProperty({
    description: 'Reason for access decision',
    example: 'Team-based access',
    required: false,
  })
  @IsOptional()
  reason?: string;

  @ApiProperty({
    description: 'List of team IDs the user has access to',
    example: ['clp123456789', 'clp111222333'],
    type: [String],
    required: false,
  })
  @IsOptional()
  teamIds?: string[];

  @ApiProperty({
    description: 'List of store IDs the user has access to',
    example: ['clp555666777', 'clp888999000'],
    type: [String],
    required: false,
  })
  @IsOptional()
  storeIds?: string[];
}

export class TeamMemberResponseDto {
  @ApiProperty({
    description: 'Team member ID',
    example: 'clp123456789',
  })
  id: string;

  @ApiProperty({
    description: 'User information',
  })
  user: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    role: string;
    status: string;
  };

  @ApiProperty({
    description: 'Date when user joined the team',
    example: '2024-01-15T10:30:00Z',
  })
  joinedAt: Date;

  @ApiProperty({
    description: 'Date when user left the team (if applicable)',
    example: null,
    required: false,
  })
  @IsOptional()
  leftAt?: Date;
}

export class TeamStoreResponseDto {
  @ApiProperty({
    description: 'Team store assignment ID',
    example: 'clp123456789',
  })
  id: string;

  @ApiProperty({
    description: 'Store information',
  })
  store: {
    id: string;
    name: string;
    code: string;
    description?: string;
    isActive: boolean;
  };

  @ApiProperty({
    description: 'Date when store was assigned to team',
    example: '2024-01-15T10:30:00Z',
  })
  assignedAt: Date;
}

export class TeamDetailsResponseDto {
  @ApiProperty({
    description: 'Team ID',
    example: 'clp123456789',
  })
  id: string;

  @ApiProperty({
    description: 'Team name',
    example: 'Sales Team Alpha',
  })
  name: string;

  @ApiProperty({
    description: 'Team description',
    example: 'Primary sales team for region A',
    required: false,
  })
  @IsOptional()
  description?: string;

  @ApiProperty({
    description: 'Team leader information',
  })
  leader: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
  };

  @ApiProperty({
    description: 'Team members',
    type: [TeamMemberResponseDto],
  })
  members: TeamMemberResponseDto[];

  @ApiProperty({
    description: 'Stores assigned to team',
    type: [TeamStoreResponseDto],
  })
  storeAssignments: TeamStoreResponseDto[];

  @ApiProperty({
    description: 'Team creation date',
    example: '2024-01-01T00:00:00Z',
  })
  createdAt: Date;

  @ApiProperty({
    description: 'Team last update date',
    example: '2024-01-15T10:30:00Z',
  })
  updatedAt: Date;
}