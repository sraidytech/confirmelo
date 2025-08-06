import {
  Controller,
  Get,
  Post,
  UseGuards,
  Logger,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { Roles } from '../../../common/decorators/roles.decorator';
import { UserRole } from '@prisma/client';
import { TokenRefreshSchedulerService } from '../services/token-refresh-scheduler.service';

@ApiTags('Token Health')
@Controller('auth/token-health')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class TokenHealthController {
  private readonly logger = new Logger(TokenHealthController.name);

  constructor(
    private readonly tokenRefreshScheduler: TokenRefreshSchedulerService,
  ) {}

  @Get('status')
  @ApiOperation({
    summary: 'Get token health status',
    description: 'Get overview of token health across all connections',
  })
  @ApiResponse({
    status: 200,
    description: 'Token health status retrieved successfully',
  })
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  async getTokenHealthStatus(): Promise<{
    scheduler: {
      isRunning: boolean;
      intervalMs: number;
      intervalMinutes: number;
    };
    tokens: {
      total: number;
      active: number;
      expiringSoon: number;
      expired: number;
      needingRefresh: number;
    };
    timestamp: string;
  }> {
    try {
      this.logger.log('Getting token health status');

      const [schedulerStatus, tokenStatus] = await Promise.all([
        this.tokenRefreshScheduler.getSchedulerStatus(),
        this.tokenRefreshScheduler.getTokenHealthStatus(),
      ]);

      return {
        scheduler: schedulerStatus,
        tokens: tokenStatus,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      this.logger.error('Failed to get token health status', {
        error: error.message,
      });
      throw error;
    }
  }

  @Post('refresh-check')
  @ApiOperation({
    summary: 'Trigger manual token refresh check',
    description: 'Manually trigger the token refresh check process',
  })
  @ApiResponse({
    status: 200,
    description: 'Token refresh check triggered successfully',
  })
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  async triggerRefreshCheck(): Promise<{
    message: string;
    triggeredAt: string;
  }> {
    try {
      this.logger.log('Manually triggering token refresh check');

      // Trigger the refresh check asynchronously
      this.tokenRefreshScheduler.triggerRefreshCheck().catch(error => {
        this.logger.error('Error during manual token refresh check', {
          error: error.message,
        });
      });

      return {
        message: 'Token refresh check triggered successfully',
        triggeredAt: new Date().toISOString(),
      };
    } catch (error) {
      this.logger.error('Failed to trigger token refresh check', {
        error: error.message,
      });
      throw error;
    }
  }
}