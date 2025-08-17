import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Query,
  UseGuards,
  HttpStatus,
  HttpException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { QueueService } from '../services/queue.service';
import { JobMonitoringService } from '../services/job-monitoring.service';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';

@ApiTags('Queue Management')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('api/admin/queue')
export class QueueManagementController {
  constructor(
    private readonly queueService: QueueService,
    private readonly jobMonitoringService: JobMonitoringService,
  ) {}

  @Get('statistics')
  @ApiOperation({ summary: 'Get queue statistics' })
  @ApiResponse({ status: 200, description: 'Queue statistics retrieved successfully' })
  async getQueueStatistics(@CurrentUser() user: any) {
    try {
      // Only allow admin users to access queue statistics
      if (user.role !== 'admin') {
        throw new HttpException('Insufficient permissions', HttpStatus.FORBIDDEN);
      }

      return await this.jobMonitoringService.getQueueStatistics();
    } catch (error) {
      throw new HttpException(
        error.message || 'Failed to get queue statistics',
        error.status || HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get(':queueName/jobs/failed')
  @ApiOperation({ summary: 'Get failed jobs for a queue' })
  @ApiResponse({ status: 200, description: 'Failed jobs retrieved successfully' })
  async getFailedJobs(
    @Param('queueName') queueName: string,
    @Query('limit') limit: string = '50',
    @CurrentUser() user: any,
  ) {
    try {
      if (user.role !== 'admin') {
        throw new HttpException('Insufficient permissions', HttpStatus.FORBIDDEN);
      }

      const limitNum = parseInt(limit, 10);
      return await this.jobMonitoringService.getFailedJobs(queueName, limitNum);
    } catch (error) {
      throw new HttpException(
        error.message || 'Failed to get failed jobs',
        error.status || HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get(':queueName/jobs/:jobId')
  @ApiOperation({ summary: 'Get job details' })
  @ApiResponse({ status: 200, description: 'Job details retrieved successfully' })
  async getJobDetails(
    @Param('queueName') queueName: string,
    @Param('jobId') jobId: string,
    @CurrentUser() user: any,
  ) {
    try {
      if (user.role !== 'admin') {
        throw new HttpException('Insufficient permissions', HttpStatus.FORBIDDEN);
      }

      const jobDetails = await this.jobMonitoringService.getJobDetails(queueName, jobId);
      
      if (!jobDetails) {
        throw new HttpException('Job not found', HttpStatus.NOT_FOUND);
      }

      return jobDetails;
    } catch (error) {
      throw new HttpException(
        error.message || 'Failed to get job details',
        error.status || HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Post(':queueName/jobs/:jobId/retry')
  @ApiOperation({ summary: 'Retry a failed job' })
  @ApiResponse({ status: 200, description: 'Job retried successfully' })
  async retryJob(
    @Param('queueName') queueName: string,
    @Param('jobId') jobId: string,
    @CurrentUser() user: any,
  ) {
    try {
      if (user.role !== 'admin') {
        throw new HttpException('Insufficient permissions', HttpStatus.FORBIDDEN);
      }

      await this.jobMonitoringService.retryFailedJob(queueName, jobId);
      
      return {
        success: true,
        message: `Job ${jobId} retried successfully`,
      };
    } catch (error) {
      throw new HttpException(
        error.message || 'Failed to retry job',
        error.status || HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Delete(':queueName/jobs/:jobId')
  @ApiOperation({ summary: 'Remove a job from queue' })
  @ApiResponse({ status: 200, description: 'Job removed successfully' })
  async removeJob(
    @Param('queueName') queueName: string,
    @Param('jobId') jobId: string,
    @CurrentUser() user: any,
  ) {
    try {
      if (user.role !== 'admin') {
        throw new HttpException('Insufficient permissions', HttpStatus.FORBIDDEN);
      }

      await this.jobMonitoringService.removeJob(queueName, jobId);
      
      return {
        success: true,
        message: `Job ${jobId} removed successfully`,
      };
    } catch (error) {
      throw new HttpException(
        error.message || 'Failed to remove job',
        error.status || HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Post(':queueName/pause')
  @ApiOperation({ summary: 'Pause a queue' })
  @ApiResponse({ status: 200, description: 'Queue paused successfully' })
  async pauseQueue(
    @Param('queueName') queueName: string,
    @CurrentUser() user: any,
  ) {
    try {
      if (user.role !== 'admin') {
        throw new HttpException('Insufficient permissions', HttpStatus.FORBIDDEN);
      }

      await this.jobMonitoringService.pauseQueue(queueName);
      
      return {
        success: true,
        message: `Queue ${queueName} paused successfully`,
      };
    } catch (error) {
      throw new HttpException(
        error.message || 'Failed to pause queue',
        error.status || HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Post(':queueName/resume')
  @ApiOperation({ summary: 'Resume a queue' })
  @ApiResponse({ status: 200, description: 'Queue resumed successfully' })
  async resumeQueue(
    @Param('queueName') queueName: string,
    @CurrentUser() user: any,
  ) {
    try {
      if (user.role !== 'admin') {
        throw new HttpException('Insufficient permissions', HttpStatus.FORBIDDEN);
      }

      await this.jobMonitoringService.resumeQueue(queueName);
      
      return {
        success: true,
        message: `Queue ${queueName} resumed successfully`,
      };
    } catch (error) {
      throw new HttpException(
        error.message || 'Failed to resume queue',
        error.status || HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Post(':queueName/clean')
  @ApiOperation({ summary: 'Clean old jobs from queue' })
  @ApiResponse({ status: 200, description: 'Queue cleaned successfully' })
  async cleanQueue(
    @Param('queueName') queueName: string,
    @Query('grace') grace: string = '86400000', // 24 hours in milliseconds
    @CurrentUser() user: any,
  ) {
    try {
      if (user.role !== 'admin') {
        throw new HttpException('Insufficient permissions', HttpStatus.FORBIDDEN);
      }

      const graceNum = parseInt(grace, 10);
      await this.jobMonitoringService.cleanQueue(queueName, graceNum);
      
      return {
        success: true,
        message: `Queue ${queueName} cleaned successfully`,
      };
    } catch (error) {
      throw new HttpException(
        error.message || 'Failed to clean queue',
        error.status || HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Post('sync/trigger')
  @ApiOperation({ summary: 'Trigger manual sync for connection' })
  @ApiResponse({ status: 200, description: 'Sync job queued successfully' })
  async triggerManualSync(
    @Query('connectionId') connectionId: string,
    @CurrentUser() user: any,
    @Query('sheetId') sheetId?: string,
  ) {
    try {
      if (!connectionId) {
        throw new HttpException('Connection ID is required', HttpStatus.BAD_REQUEST);
      }

      const jobId = await this.queueService.addOrderSyncJob({
        connectionId,
        sheetId,
        triggeredBy: 'manual',
        userId: user.id,
        organizationId: user.organizationId,
      });

      return {
        success: true,
        message: 'Manual sync job queued successfully',
        jobId,
      };
    } catch (error) {
      throw new HttpException(
        error.message || 'Failed to trigger manual sync',
        error.status || HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}