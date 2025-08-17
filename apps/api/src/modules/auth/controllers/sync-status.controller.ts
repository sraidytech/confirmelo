import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  UseGuards,
  HttpStatus,
  HttpCode,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { Roles } from '../../../common/decorators/roles.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { SyncStatusService } from '../services/sync-status.service';
import { UserRole } from '@prisma/client';

export interface SyncStatusQueryDto {
  limit?: number;
  offset?: number;
  status?: 'pending' | 'processing' | 'completed' | 'failed';
  operationType?: 'webhook' | 'manual' | 'polling';
  spreadsheetId?: string;
}

export interface SyncPerformanceQueryDto {
  startDate: string;
  endDate: string;
}

@Controller('api/sync-status')
@UseGuards(JwtAuthGuard, RolesGuard)
export class SyncStatusController {
  constructor(private readonly syncStatusService: SyncStatusService) {}

  /**
   * Get sync status for a specific connection
   */
  @Get('connections/:connectionId/status')
  @Roles(UserRole.CLIENT_ADMIN, UserRole.CLIENT_USER, UserRole.ADMIN, UserRole.SUPER_ADMIN)
  async getSyncStatus(
    @Param('connectionId') connectionId: string,
    @CurrentUser() user: any
  ) {
    // TODO: Add authorization check to ensure user can access this connection
    
    const status = await this.syncStatusService.getSyncStatus(connectionId);
    
    return {
      success: true,
      data: status,
    };
  }

  /**
   * Get sync history for a connection
   */
  @Get('connections/:connectionId/history')
  @Roles(UserRole.CLIENT_ADMIN, UserRole.CLIENT_USER, UserRole.ADMIN, UserRole.SUPER_ADMIN)
  async getSyncHistory(
    @Param('connectionId') connectionId: string,
    @Query() query: SyncStatusQueryDto,
    @CurrentUser() user: any
  ) {
    // TODO: Add authorization check to ensure user can access this connection
    
    const { limit = 50, offset = 0, status, operationType, spreadsheetId } = query;
    
    // Validate query parameters
    if (limit > 100) {
      throw new BadRequestException('Limit cannot exceed 100');
    }
    
    if (offset < 0) {
      throw new BadRequestException('Offset cannot be negative');
    }

    const history = await this.syncStatusService.getSyncHistory(connectionId, {
      limit,
      offset,
      status,
      operationType,
      spreadsheetId,
    });

    return {
      success: true,
      data: history,
    };
  }

  /**
   * Get sync summary statistics for a connection
   */
  @Get('connections/:connectionId/summary')
  @Roles(UserRole.CLIENT_ADMIN, UserRole.CLIENT_USER, UserRole.ADMIN, UserRole.SUPER_ADMIN)
  async getSyncSummary(
    @Param('connectionId') connectionId: string,
    @CurrentUser() user: any
  ) {
    // TODO: Add authorization check to ensure user can access this connection
    
    const summary = await this.syncStatusService.getSyncSummary(connectionId);
    
    return {
      success: true,
      data: summary,
    };
  }

  /**
   * Get specific sync operation details
   */
  @Get('operations/:operationId')
  @Roles(UserRole.CLIENT_ADMIN, UserRole.CLIENT_USER, UserRole.ADMIN, UserRole.SUPER_ADMIN)
  async getSyncOperation(
    @Param('operationId') operationId: string,
    @CurrentUser() user: any
  ) {
    const operation = await this.syncStatusService.getSyncOperation(operationId);
    
    if (!operation) {
      throw new NotFoundException('Sync operation not found');
    }

    // TODO: Add authorization check to ensure user can access this operation
    
    return {
      success: true,
      data: operation,
    };
  }

  /**
   * Retry a failed sync operation
   */
  @Post('operations/:operationId/retry')
  @HttpCode(HttpStatus.CREATED)
  @Roles(UserRole.CLIENT_ADMIN, UserRole.ADMIN, UserRole.SUPER_ADMIN)
  async retrySyncOperation(
    @Param('operationId') operationId: string,
    @CurrentUser() user: any
  ) {
    // TODO: Add authorization check to ensure user can retry this operation
    
    const retryOperationId = await this.syncStatusService.retrySyncOperation(operationId, {
      maxRetries: 3,
      retryDelay: 2000,
      exponentialBackoff: true,
    });

    return {
      success: true,
      data: {
        retryOperationId,
        message: 'Sync operation retry initiated',
      },
    };
  }

  /**
   * Get sync performance metrics for a connection
   */
  @Get('connections/:connectionId/performance')
  @Roles(UserRole.CLIENT_ADMIN, UserRole.ADMIN, UserRole.SUPER_ADMIN)
  async getSyncPerformanceMetrics(
    @Param('connectionId') connectionId: string,
    @Query() query: SyncPerformanceQueryDto,
    @CurrentUser() user: any
  ) {
    // TODO: Add authorization check to ensure user can access this connection
    
    const { startDate, endDate } = query;
    
    if (!startDate || !endDate) {
      throw new BadRequestException('startDate and endDate are required');
    }

    const start = new Date(startDate);
    const end = new Date(endDate);

    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      throw new BadRequestException('Invalid date format');
    }

    if (start >= end) {
      throw new BadRequestException('startDate must be before endDate');
    }

    // Limit to 90 days maximum
    const maxDays = 90;
    const daysDiff = (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24);
    if (daysDiff > maxDays) {
      throw new BadRequestException(`Date range cannot exceed ${maxDays} days`);
    }

    const metrics = await this.syncStatusService.getSyncPerformanceMetrics(connectionId, {
      startDate: start,
      endDate: end,
    });

    return {
      success: true,
      data: metrics,
    };
  }

  /**
   * Admin endpoint: Clean up old sync operations
   */
  @Post('admin/cleanup')
  @HttpCode(HttpStatus.OK)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  async cleanupOldOperations(
    @Query('olderThanDays') olderThanDays: string = '30',
    @Query('keepMinimum') keepMinimum: string = '100',
    @CurrentUser() user: any
  ) {
    const days = parseInt(olderThanDays, 10);
    const minimum = parseInt(keepMinimum, 10);

    if (isNaN(days) || days < 1) {
      throw new BadRequestException('olderThanDays must be a positive number');
    }

    if (isNaN(minimum) || minimum < 0) {
      throw new BadRequestException('keepMinimum must be a non-negative number');
    }

    if (days < 7) {
      throw new BadRequestException('Cannot cleanup operations newer than 7 days');
    }

    const deletedCount = await this.syncStatusService.cleanupOldOperations(days, minimum);

    return {
      success: true,
      data: {
        deletedCount,
        message: `Cleaned up ${deletedCount} old sync operations`,
      },
    };
  }

  /**
   * Health check endpoint for sync status service
   */
  @Get('health')
  async healthCheck() {
    return {
      success: true,
      service: 'SyncStatusService',
      status: 'healthy',
      timestamp: new Date().toISOString(),
    };
  }
}