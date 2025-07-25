import {
  Controller,
  Post,
  Delete,
  Get,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { TeamAssignmentService } from '../services/team-assignment.service';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../../common/decorators/permissions.decorator';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { PERMISSIONS } from '../../../common/constants/permissions';
import {
  AssignUserToTeamDto,
  RemoveUserFromTeamDto,
  AssignStoreToTeamDto,
  RemoveStoreFromTeamDto,
  BulkAssignUsersToTeamDto,
  BulkAssignStoresToTeamDto,
  ValidateAccessDto,
  UserAccessValidationResponseDto,
  TeamDetailsResponseDto,
} from '../dto/team-assignment.dto';

@ApiTags('Team Assignment')
@ApiBearerAuth()
@Controller('auth/team-assignments')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class TeamAssignmentController {
  constructor(private readonly teamAssignmentService: TeamAssignmentService) {}

  @Post('users')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions(PERMISSIONS.TEAM_MANAGEMENT.ASSIGN_MEMBERS)
  @ApiOperation({
    summary: 'Assign user to team',
    description: 'Assign a user to a team for access control purposes',
  })
  @ApiResponse({
    status: 204,
    description: 'User successfully assigned to team',
  })
  @ApiResponse({
    status: 400,
    description: 'Bad request - User already in team or validation error',
  })
  @ApiResponse({
    status: 404,
    description: 'Team or user not found',
  })
  async assignUserToTeam(
    @Body() dto: AssignUserToTeamDto,
    @CurrentUser() currentUser: any,
  ): Promise<void> {
    await this.teamAssignmentService.assignUserToTeam({
      ...dto,
      assignedBy: currentUser.id,
    });
  }

  @Delete('users')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions(PERMISSIONS.TEAM_MANAGEMENT.REMOVE_MEMBERS)
  @ApiOperation({
    summary: 'Remove user from team',
    description: 'Remove a user from a team',
  })
  @ApiResponse({
    status: 204,
    description: 'User successfully removed from team',
  })
  @ApiResponse({
    status: 400,
    description: 'Bad request - Cannot remove team leader',
  })
  @ApiResponse({
    status: 404,
    description: 'Team membership not found',
  })
  async removeUserFromTeam(
    @Body() dto: RemoveUserFromTeamDto,
    @CurrentUser() currentUser: any,
  ): Promise<void> {
    await this.teamAssignmentService.removeUserFromTeam(
      dto.teamId,
      dto.userId,
      currentUser.id,
    );
  }

  @Post('users/bulk')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions(PERMISSIONS.TEAM_MANAGEMENT.ASSIGN_MEMBERS)
  @ApiOperation({
    summary: 'Bulk assign users to team',
    description: 'Assign multiple users to a team at once',
  })
  @ApiResponse({
    status: 204,
    description: 'Users successfully assigned to team',
  })
  async bulkAssignUsersToTeam(
    @Body() dto: BulkAssignUsersToTeamDto,
    @CurrentUser() currentUser: any,
  ): Promise<void> {
    for (const userId of dto.userIds) {
      try {
        await this.teamAssignmentService.assignUserToTeam({
          teamId: dto.teamId,
          userId,
          assignedBy: currentUser.id,
        });
      } catch (error) {
        // Continue with other users if one fails
        console.warn(`Failed to assign user ${userId} to team ${dto.teamId}:`, error.message);
      }
    }
  }

  @Post('stores')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions(PERMISSIONS.TEAM_MANAGEMENT.ASSIGN_STORES)
  @ApiOperation({
    summary: 'Assign store to team',
    description: 'Assign a store to a team for access control purposes',
  })
  @ApiResponse({
    status: 204,
    description: 'Store successfully assigned to team',
  })
  @ApiResponse({
    status: 400,
    description: 'Bad request - Store already assigned to team',
  })
  @ApiResponse({
    status: 404,
    description: 'Team or store not found',
  })
  async assignStoreToTeam(
    @Body() dto: AssignStoreToTeamDto,
    @CurrentUser() currentUser: any,
  ): Promise<void> {
    await this.teamAssignmentService.assignStoreToTeam({
      ...dto,
      assignedBy: currentUser.id,
    });
  }

  @Delete('stores')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions(PERMISSIONS.TEAM_MANAGEMENT.REMOVE_STORES)
  @ApiOperation({
    summary: 'Remove store from team',
    description: 'Remove a store assignment from a team',
  })
  @ApiResponse({
    status: 204,
    description: 'Store successfully removed from team',
  })
  @ApiResponse({
    status: 404,
    description: 'Store assignment not found',
  })
  async removeStoreFromTeam(
    @Body() dto: RemoveStoreFromTeamDto,
    @CurrentUser() currentUser: any,
  ): Promise<void> {
    await this.teamAssignmentService.removeStoreFromTeam(
      dto.teamId,
      dto.storeId,
      currentUser.id,
    );
  }

  @Post('stores/bulk')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions(PERMISSIONS.TEAM_MANAGEMENT.ASSIGN_STORES)
  @ApiOperation({
    summary: 'Bulk assign stores to team',
    description: 'Assign multiple stores to a team at once',
  })
  @ApiResponse({
    status: 204,
    description: 'Stores successfully assigned to team',
  })
  async bulkAssignStoresToTeam(
    @Body() dto: BulkAssignStoresToTeamDto,
    @CurrentUser() currentUser: any,
  ): Promise<void> {
    for (const storeId of dto.storeIds) {
      try {
        await this.teamAssignmentService.assignStoreToTeam({
          teamId: dto.teamId,
          storeId,
          assignedBy: currentUser.id,
        });
      } catch (error) {
        // Continue with other stores if one fails
        console.warn(`Failed to assign store ${storeId} to team ${dto.teamId}:`, error.message);
      }
    }
  }

  @Post('validate-access')
  @RequirePermissions(PERMISSIONS.TEAM_MANAGEMENT.VIEW_ASSIGNMENTS)
  @ApiOperation({
    summary: 'Validate user access to resource',
    description: 'Check if a user has access to a specific team or store',
  })
  @ApiResponse({
    status: 200,
    description: 'Access validation result',
    type: UserAccessValidationResponseDto,
  })
  async validateAccess(
    @Body() dto: ValidateAccessDto,
  ): Promise<UserAccessValidationResponseDto> {
    if (dto.resourceType === 'team') {
      return await this.teamAssignmentService.validateUserTeamAccess(
        dto.userId,
        dto.resourceId,
      );
    } else {
      return await this.teamAssignmentService.validateUserStoreAccess(
        dto.userId,
        dto.resourceId,
      );
    }
  }

  @Get('users/:userId/stores')
  @RequirePermissions(PERMISSIONS.TEAM_MANAGEMENT.VIEW_ASSIGNMENTS)
  @ApiOperation({
    summary: 'Get user accessible stores',
    description: 'Get all stores that a user has access to through team assignments',
  })
  @ApiParam({
    name: 'userId',
    description: 'ID of the user',
    example: 'clp987654321',
  })
  @ApiResponse({
    status: 200,
    description: 'List of accessible store IDs',
    schema: {
      type: 'object',
      properties: {
        storeIds: {
          type: 'array',
          items: { type: 'string' },
          example: ['clp555666777', 'clp888999000'],
        },
      },
    },
  })
  async getUserAccessibleStores(
    @Param('userId') userId: string,
  ): Promise<{ storeIds: string[] }> {
    const storeIds = await this.teamAssignmentService.getUserAccessibleStores(userId);
    return { storeIds };
  }

  @Get('users/:userId/teams')
  @RequirePermissions(PERMISSIONS.TEAM_MANAGEMENT.VIEW_ASSIGNMENTS)
  @ApiOperation({
    summary: 'Get user accessible teams',
    description: 'Get all teams that a user has access to (member or leader)',
  })
  @ApiParam({
    name: 'userId',
    description: 'ID of the user',
    example: 'clp987654321',
  })
  @ApiResponse({
    status: 200,
    description: 'List of accessible team IDs',
    schema: {
      type: 'object',
      properties: {
        teamIds: {
          type: 'array',
          items: { type: 'string' },
          example: ['clp123456789', 'clp111222333'],
        },
      },
    },
  })
  async getUserAccessibleTeams(
    @Param('userId') userId: string,
  ): Promise<{ teamIds: string[] }> {
    const teamIds = await this.teamAssignmentService.getUserAccessibleTeams(userId);
    return { teamIds };
  }

  @Get('teams/:teamId/details')
  @RequirePermissions(PERMISSIONS.TEAM_MANAGEMENT.VIEW_ASSIGNMENTS)
  @ApiOperation({
    summary: 'Get team details with assignments',
    description: 'Get detailed information about a team including members and store assignments',
  })
  @ApiParam({
    name: 'teamId',
    description: 'ID of the team',
    example: 'clp123456789',
  })
  @ApiResponse({
    status: 200,
    description: 'Team details with assignments',
    type: TeamDetailsResponseDto,
  })
  async getTeamDetails(@Param('teamId') teamId: string): Promise<TeamDetailsResponseDto> {
    // This would be implemented in a separate service method
    // For now, returning a placeholder response
    throw new Error('Method not implemented yet');
  }
}