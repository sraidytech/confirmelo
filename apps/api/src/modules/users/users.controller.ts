import {
  Controller,
  Get,
  Put,
  Post,
  Body,
  Param,
  Query,
  BadRequestException,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam, ApiQuery } from '@nestjs/swagger';
import { Auth, CurrentUser, Roles } from '../../common/decorators';
import { UsersService } from './users.service';
import {
  UpdateProfileDto,
  ChangePasswordDto,
  ProfileResponseDto,
  UpdateProfileResponseDto,
  ChangePasswordResponseDto,
  UpdateUserStatusDto,
  UserPresenceDto,
  BulkUserPresenceDto,
  OnlineUsersResponseDto,
  UserActivitySummaryDto,
} from './dto';

@ApiTags('User Profile')
@Controller('users')
@Auth()
export class UsersController {
  constructor(private usersService: UsersService) { }

  @Get('profile')
  @ApiOperation({ summary: 'Get current user profile' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'User profile retrieved successfully',
    type: ProfileResponseDto,
  })
  async getProfile(@CurrentUser('id') userId: string): Promise<ProfileResponseDto> {
    const profile = await this.usersService.getUserProfile(userId);
    return profile as ProfileResponseDto;
  }

  @Put('profile')
  @ApiOperation({ summary: 'Update user profile' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Profile updated successfully',
    type: UpdateProfileResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Invalid input data',
  })
  @ApiResponse({
    status: HttpStatus.CONFLICT,
    description: 'Email or username already exists',
  })
  async updateProfile(
    @CurrentUser('id') userId: string,
    @Body() updateProfileDto: UpdateProfileDto,
  ): Promise<UpdateProfileResponseDto> {
    const updatedUser = await this.usersService.updateProfile(userId, updateProfileDto);

    return {
      success: true,
      message: 'Profile updated successfully',
      user: updatedUser as ProfileResponseDto,
    };
  }

  @Post('change-password')
  @ApiOperation({ summary: 'Change user password' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Password changed successfully',
    type: ChangePasswordResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Invalid current password or weak new password',
  })
  async changePassword(
    @CurrentUser('id') userId: string,
    @Body() changePasswordDto: ChangePasswordDto,
  ): Promise<ChangePasswordResponseDto> {
    // Validate new password strength
    const passwordValidation = this.usersService.validatePasswordStrength(
      changePasswordDto.newPassword,
    );

    if (!passwordValidation.isValid) {
      throw new BadRequestException({
        message: 'Password does not meet security requirements',
        errors: passwordValidation.errors,
      });
    }

    const result = await this.usersService.changePassword(userId, changePasswordDto);
    return result;
  }

  @Put('avatar')
  @ApiOperation({ summary: 'Update user avatar URL' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Avatar updated successfully',
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Invalid avatar URL',
  })
  async updateAvatarUrl(
    @CurrentUser('id') userId: string,
    @Body() body: { avatarUrl: string },
  ) {
    if (!body.avatarUrl) {
      throw new BadRequestException('Avatar URL is required');
    }

    // Update user avatar in database
    await this.usersService.updateAvatar(userId, body.avatarUrl);

    return {
      success: true,
      message: 'Avatar updated successfully',
      avatarUrl: body.avatarUrl,
    };
  }

  @Post('activity')
  @ApiOperation({ summary: 'Update user activity timestamp' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Activity updated successfully',
  })
  async updateActivity(@CurrentUser('id') userId: string) {
    await this.usersService.updateLastActivity(userId);
    return {
      success: true,
      message: 'Activity updated successfully',
    };
  }

  @Get('online-status')
  @ApiOperation({ summary: 'Get user online status' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Online status retrieved successfully',
  })
  async getOnlineStatus(@CurrentUser('id') userId: string) {
    const isOnline = await this.usersService.getUserOnlineStatus(userId);
    return {
      isOnline,
      timestamp: new Date().toISOString(),
    };
  }

  @Put(':userId/status')
  @Roles('ADMIN', 'SUPER_ADMIN')
  @ApiOperation({ summary: 'Update user status (Admin only)' })
  @ApiParam({ name: 'userId', description: 'User ID to update' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'User status updated successfully',
  })
  @ApiResponse({
    status: HttpStatus.FORBIDDEN,
    description: 'Insufficient permissions or cannot change own status',
  })
  async updateUserStatus(
    @Param('userId') userId: string,
    @CurrentUser('id') currentUserId: string,
    @Body() updateStatusDto: UpdateUserStatusDto,
  ) {
    const result = await this.usersService.updateUserStatus(userId, updateStatusDto, currentUserId);
    return {
      success: true,
      message: 'User status updated successfully',
      ...result,
    };
  }

  @Get(':userId/presence')
  @ApiOperation({ summary: 'Get user presence information' })
  @ApiParam({ name: 'userId', description: 'User ID to get presence for' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'User presence retrieved successfully',
    type: UserPresenceDto,
  })
  async getUserPresence(@Param('userId') userId: string): Promise<UserPresenceDto> {
    return this.usersService.getUserPresence(userId);
  }

  @Post('presence/bulk')
  @ApiOperation({ summary: 'Get presence information for multiple users' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Bulk user presence retrieved successfully',
    type: BulkUserPresenceDto,
  })
  async getBulkUserPresence(@Body() body: { userIds: string[] }): Promise<BulkUserPresenceDto> {
    if (!body.userIds || !Array.isArray(body.userIds)) {
      throw new BadRequestException('userIds array is required');
    }
    return this.usersService.getBulkUserPresence(body.userIds);
  }

  @Get('organization/online')
  @ApiOperation({ summary: 'Get all online users in current organization' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Online users retrieved successfully',
    type: OnlineUsersResponseDto,
  })
  async getOnlineUsersInOrganization(
    @CurrentUser('organizationId') organizationId: string,
  ): Promise<OnlineUsersResponseDto> {
    return this.usersService.getOnlineUsersInOrganization(organizationId);
  }

  @Get(':userId/activity-summary')
  @ApiOperation({ summary: 'Get comprehensive user activity summary' })
  @ApiParam({ name: 'userId', description: 'User ID to get activity summary for' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'User activity summary retrieved successfully',
    type: UserActivitySummaryDto,
  })
  async getUserActivitySummary(@Param('userId') userId: string): Promise<UserActivitySummaryDto> {
    return this.usersService.getUserActivitySummary(userId);
  }

  @Post('activity/batch-update')
  @ApiOperation({ summary: 'Batch update user activity for multiple users' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Batch activity update completed successfully',
  })
  async batchUpdateUserActivity(@Body() body: { userIds: string[] }) {
    if (!body.userIds || !Array.isArray(body.userIds)) {
      throw new BadRequestException('userIds array is required');
    }
    
    await this.usersService.batchUpdateUserActivity(body.userIds);
    return {
      success: true,
      message: 'Batch activity update completed',
      updatedCount: body.userIds.length,
      timestamp: new Date().toISOString(),
    };
  }

  @Post('cleanup-inactive')
  @Roles('ADMIN', 'SUPER_ADMIN')
  @ApiOperation({ summary: 'Clean up inactive users (Admin only)' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Inactive users cleanup completed',
  })
  async cleanupInactiveUsers() {
    const cleanedUpCount = await this.usersService.cleanupInactiveUsers();
    return {
      success: true,
      message: 'Inactive users cleanup completed',
      cleanedUpCount,
      timestamp: new Date().toISOString(),
    };
  }
}