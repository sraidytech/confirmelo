/**
 * Error Monitoring Controller
 * Provides endpoints for error metrics and monitoring
 */

import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { RolesGuard } from '../guards/roles.guard';
import { Roles } from '../decorators/roles.decorator';
import { ErrorMonitoringService } from '../services/error-monitoring.service';
import { LoggingService } from '../services/logging.service';
import { UserRole } from '@prisma/client';

@ApiTags('Error Monitoring')
@Controller('monitoring/errors')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class ErrorMonitoringController {
  constructor(
    private readonly errorMonitoringService: ErrorMonitoringService,
    private readonly loggingService: LoggingService
  ) {}

  @Get('metrics')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  @ApiOperation({ summary: 'Get error metrics and statistics' })
  @ApiResponse({
    status: 200,
    description: 'Error metrics retrieved successfully',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean', example: true },
        data: {
          type: 'object',
          properties: {
            totalErrors: { type: 'number', example: 42 },
            errorsByType: {
              type: 'object',
              additionalProperties: { type: 'number' },
            },
            errorsByCode: {
              type: 'object',
              additionalProperties: { type: 'number' },
            },
            errorsByEndpoint: {
              type: 'object',
              additionalProperties: { type: 'number' },
            },
            criticalErrors: { type: 'number', example: 5 },
            lastHourErrors: { type: 'number', example: 12 },
          },
        },
      },
    },
  })
  @ApiResponse({ status: 403, description: 'Insufficient permissions' })
  getErrorMetrics() {
    const metrics = this.errorMonitoringService.getErrorMetrics();
    
    this.loggingService.logWithContext('info', 'Error metrics accessed', {
      metricsRequested: true,
      totalErrors: metrics.totalErrors,
    });

    return {
      success: true,
      data: metrics,
    };
  }

  @Get('health')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  @ApiOperation({ summary: 'Get error monitoring health status' })
  @ApiResponse({
    status: 200,
    description: 'Health status retrieved successfully',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean', example: true },
        data: {
          type: 'object',
          properties: {
            healthy: { type: 'boolean', example: true },
            metrics: {
              type: 'object',
              properties: {
                totalErrors: { type: 'number' },
                criticalErrors: { type: 'number' },
                lastHourErrors: { type: 'number' },
              },
            },
          },
        },
      },
    },
  })
  @ApiResponse({ status: 403, description: 'Insufficient permissions' })
  getHealthStatus() {
    const healthStatus = this.errorMonitoringService.getHealthStatus();
    
    this.loggingService.logWithContext('info', 'Error monitoring health checked', {
      healthy: healthStatus.healthy,
      criticalErrors: healthStatus.metrics.criticalErrors,
    });

    return {
      success: true,
      data: healthStatus,
    };
  }

  @Get('logging/health')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  @ApiOperation({ summary: 'Check logging service health' })
  @ApiResponse({
    status: 200,
    description: 'Logging health status',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean', example: true },
        data: {
          type: 'object',
          properties: {
            healthy: { type: 'boolean', example: true },
          },
        },
      },
    },
  })
  getLoggingHealth() {
    const isHealthy = this.loggingService.isHealthy();
    
    return {
      success: true,
      data: {
        healthy: isHealthy,
      },
    };
  }
}