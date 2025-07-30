import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiQuery, ApiParam, ApiBody } from '@nestjs/swagger';
import { Auth, CurrentUser, Roles } from '../../common/decorators';
import { AdminService } from './admin.service';
import { 
  CreateUserDto, 
  UpdateUserDto, 
  UserSuspensionDto, 
  UserActivationDto,
  CreateUserResponseDto,
  UpdateUserResponseDto,
  UserStatusChangeResponseDto,
  CreateTeamDto,
  UpdateTeamDto,
  AddTeamMembersDto,
  RemoveTeamMembersDto,
  AssignStoresToTeamDto,
  UnassignStoresFromTeamDto,
  BulkUserOperationDto,
  CreateTeamResponseDto,
  UpdateTeamResponseDto,
  TeamMemberOperationResponseDto,
  BulkOperationResponseDto,
  TeamResponseDto,
} from './dto';

@ApiTags('Admin')
@Controller('admin')
@Auth()
@Roles('ADMIN', 'SUPER_ADMIN')
export class AdminController {
  constructor(private adminService: AdminService) {}

  @Get('users')
  @ApiOperation({ summary: 'Get all users in organization (Admin only)' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'search', required: false, type: String })
  @ApiQuery({ name: 'role', required: false, type: String })
  @ApiQuery({ name: 'status', required: false, type: String })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Users retrieved successfully',
  })
  async getUsers(
    @CurrentUser('organizationId') organizationId: string,
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '20',
    @Query('search') search?: string,
    @Query('role') role?: string,
    @Query('status') status?: string,
  ) {
    return this.adminService.getUsers(organizationId, {
      page: parseInt(page, 10) || 1,
      limit: parseInt(limit, 10) || 20,
      search,
      role,
      status,
    });
  }

  @Post('users')
  @ApiOperation({ summary: 'Create a new user (Admin only)' })
  @ApiBody({ type: CreateUserDto })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: 'User created successfully',
    type: CreateUserResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.CONFLICT,
    description: 'Email or username already exists',
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Invalid input data or weak password',
  })
  async createUser(
    @CurrentUser('organizationId') organizationId: string,
    @CurrentUser('id') currentUserId: string,
    @Body() createUserDto: CreateUserDto,
  ): Promise<CreateUserResponseDto> {
    const user = await this.adminService.createUser(organizationId, createUserDto, currentUserId);
    
    return {
      success: true,
      message: 'User created successfully',
      user,
    };
  }

  @Put('users/:id')
  @ApiOperation({ summary: 'Update user details and role (Admin only)' })
  @ApiParam({ name: 'id', description: 'User ID to update' })
  @ApiBody({ type: UpdateUserDto })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'User updated successfully',
    type: UpdateUserResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'User not found',
  })
  @ApiResponse({
    status: HttpStatus.CONFLICT,
    description: 'Email or username already exists',
  })
  @ApiResponse({
    status: HttpStatus.FORBIDDEN,
    description: 'Cannot change own role',
  })
  async updateUser(
    @Param('id') userId: string,
    @CurrentUser('organizationId') organizationId: string,
    @CurrentUser('id') currentUserId: string,
    @Body() updateUserDto: UpdateUserDto,
  ): Promise<UpdateUserResponseDto> {
    const user = await this.adminService.updateUser(userId, organizationId, updateUserDto, currentUserId);
    
    return {
      success: true,
      message: 'User updated successfully',
      user,
    };
  }

  @Put('users/:id/suspend')
  @ApiOperation({ summary: 'Suspend a user (Admin only)' })
  @ApiParam({ name: 'id', description: 'User ID to suspend' })
  @ApiBody({ type: UserSuspensionDto })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'User suspended successfully',
    type: UserStatusChangeResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'User not found',
  })
  @ApiResponse({
    status: HttpStatus.FORBIDDEN,
    description: 'Cannot suspend own account',
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'User is already suspended',
  })
  async suspendUser(
    @Param('id') userId: string,
    @CurrentUser('organizationId') organizationId: string,
    @CurrentUser('id') currentUserId: string,
    @Body() suspensionDto: UserSuspensionDto,
  ): Promise<UserStatusChangeResponseDto> {
    const result = await this.adminService.suspendUser(userId, organizationId, suspensionDto, currentUserId);
    
    return {
      success: true,
      message: 'User suspended successfully',
      ...result,
    };
  }

  @Put('users/:id/activate')
  @ApiOperation({ summary: 'Activate a user (Admin only)' })
  @ApiParam({ name: 'id', description: 'User ID to activate' })
  @ApiBody({ type: UserActivationDto })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'User activated successfully',
    type: UserStatusChangeResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'User not found',
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'User is already active',
  })
  async activateUser(
    @Param('id') userId: string,
    @CurrentUser('organizationId') organizationId: string,
    @CurrentUser('id') currentUserId: string,
    @Body() activationDto: UserActivationDto,
  ): Promise<UserStatusChangeResponseDto> {
    const result = await this.adminService.activateUser(userId, organizationId, activationDto, currentUserId);
    
    return {
      success: true,
      message: 'User activated successfully',
      ...result,
    };
  }

  // ==================== TEAM MANAGEMENT ENDPOINTS ====================

  @Get('teams')
  @ApiOperation({ summary: 'Get all teams in organization (Admin only)' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'search', required: false, type: String })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Teams retrieved successfully',
  })
  async getTeams(
    @CurrentUser('organizationId') organizationId: string,
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '20',
    @Query('search') search?: string,
  ) {
    return this.adminService.getTeams(organizationId, {
      page: parseInt(page, 10) || 1,
      limit: parseInt(limit, 10) || 20,
      search,
    });
  }

  @Get('teams/:id')
  @ApiOperation({ summary: 'Get team by ID (Admin only)' })
  @ApiParam({ name: 'id', description: 'Team ID' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Team retrieved successfully',
    type: TeamResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Team not found',
  })
  async getTeamById(
    @Param('id') teamId: string,
    @CurrentUser('organizationId') organizationId: string,
  ): Promise<TeamResponseDto> {
    return this.adminService.getTeamById(teamId, organizationId);
  }

  @Post('teams')
  @ApiOperation({ summary: 'Create a new team (Admin only)' })
  @ApiBody({ type: CreateTeamDto })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: 'Team created successfully',
    type: CreateTeamResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.CONFLICT,
    description: 'Team name already exists',
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Invalid input data',
  })
  async createTeam(
    @CurrentUser('organizationId') organizationId: string,
    @CurrentUser('id') currentUserId: string,
    @Body() createTeamDto: CreateTeamDto,
  ): Promise<CreateTeamResponseDto> {
    const team = await this.adminService.createTeam(organizationId, createTeamDto, currentUserId);
    
    return {
      success: true,
      message: 'Team created successfully',
      team,
    };
  }

  @Put('teams/:id')
  @ApiOperation({ summary: 'Update team details (Admin only)' })
  @ApiParam({ name: 'id', description: 'Team ID to update' })
  @ApiBody({ type: UpdateTeamDto })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Team updated successfully',
    type: UpdateTeamResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Team not found',
  })
  @ApiResponse({
    status: HttpStatus.CONFLICT,
    description: 'Team name already exists',
  })
  async updateTeam(
    @Param('id') teamId: string,
    @CurrentUser('organizationId') organizationId: string,
    @CurrentUser('id') currentUserId: string,
    @Body() updateTeamDto: UpdateTeamDto,
  ): Promise<UpdateTeamResponseDto> {
    const team = await this.adminService.updateTeam(teamId, organizationId, updateTeamDto, currentUserId);
    
    return {
      success: true,
      message: 'Team updated successfully',
      team,
    };
  }

  @Delete('teams/:id')
  @ApiOperation({ summary: 'Delete team (Admin only)' })
  @ApiParam({ name: 'id', description: 'Team ID to delete' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Team deleted successfully',
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Team not found',
  })
  async deleteTeam(
    @Param('id') teamId: string,
    @CurrentUser('organizationId') organizationId: string,
    @CurrentUser('id') currentUserId: string,
  ) {
    return this.adminService.deleteTeam(teamId, organizationId, currentUserId);
  }

  @Post('teams/:id/members')
  @ApiOperation({ summary: 'Add members to team (Admin only)' })
  @ApiParam({ name: 'id', description: 'Team ID' })
  @ApiBody({ type: AddTeamMembersDto })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Team members added successfully',
    type: TeamMemberOperationResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Team not found',
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'One or more users not found or already team members',
  })
  async addTeamMembers(
    @Param('id') teamId: string,
    @CurrentUser('organizationId') organizationId: string,
    @CurrentUser('id') currentUserId: string,
    @Body() addMembersDto: AddTeamMembersDto,
  ): Promise<TeamMemberOperationResponseDto> {
    return this.adminService.addTeamMembers(teamId, organizationId, addMembersDto, currentUserId);
  }

  @Delete('teams/:id/members')
  @ApiOperation({ summary: 'Remove members from team (Admin only)' })
  @ApiParam({ name: 'id', description: 'Team ID' })
  @ApiBody({ type: RemoveTeamMembersDto })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Team members removed successfully',
    type: TeamMemberOperationResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Team not found',
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'No active memberships found for specified users',
  })
  async removeTeamMembers(
    @Param('id') teamId: string,
    @CurrentUser('organizationId') organizationId: string,
    @CurrentUser('id') currentUserId: string,
    @Body() removeMembersDto: RemoveTeamMembersDto,
  ): Promise<TeamMemberOperationResponseDto> {
    return this.adminService.removeTeamMembers(teamId, organizationId, removeMembersDto, currentUserId);
  }

  @Post('teams/:id/stores')
  @ApiOperation({ summary: 'Assign stores to team (Admin only)' })
  @ApiParam({ name: 'id', description: 'Team ID' })
  @ApiBody({ type: AssignStoresToTeamDto })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Stores assigned to team successfully',
    type: TeamMemberOperationResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Team not found',
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'One or more stores not found or already assigned',
  })
  async assignStoresToTeam(
    @Param('id') teamId: string,
    @CurrentUser('organizationId') organizationId: string,
    @CurrentUser('id') currentUserId: string,
    @Body() assignStoresDto: AssignStoresToTeamDto,
  ): Promise<TeamMemberOperationResponseDto> {
    return this.adminService.assignStoresToTeam(teamId, organizationId, assignStoresDto, currentUserId);
  }

  @Delete('teams/:id/stores')
  @ApiOperation({ summary: 'Unassign stores from team (Admin only)' })
  @ApiParam({ name: 'id', description: 'Team ID' })
  @ApiBody({ type: UnassignStoresFromTeamDto })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Stores unassigned from team successfully',
    type: TeamMemberOperationResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Team not found',
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'No store assignments found for specified stores',
  })
  async unassignStoresFromTeam(
    @Param('id') teamId: string,
    @CurrentUser('organizationId') organizationId: string,
    @CurrentUser('id') currentUserId: string,
    @Body() unassignStoresDto: UnassignStoresFromTeamDto,
  ): Promise<TeamMemberOperationResponseDto> {
    return this.adminService.unassignStoresFromTeam(teamId, organizationId, unassignStoresDto, currentUserId);
  }

  @Post('users/bulk-operation')
  @ApiOperation({ summary: 'Perform bulk user operations (Admin only)' })
  @ApiBody({ type: BulkUserOperationDto })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Bulk operation completed successfully',
    type: BulkOperationResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Invalid operation type or missing required parameters',
  })
  async performBulkUserOperation(
    @CurrentUser('organizationId') organizationId: string,
    @CurrentUser('id') currentUserId: string,
    @Body() bulkOperationDto: BulkUserOperationDto,
  ): Promise<BulkOperationResponseDto> {
    return this.adminService.performBulkUserOperation(organizationId, bulkOperationDto, currentUserId);
  }
}