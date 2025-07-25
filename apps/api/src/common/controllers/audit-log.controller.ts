import {
  Controller,
  Get,
  Post,
  Delete,
  Query,
  Body,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
  Res,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiQuery,
  ApiParam,
} from '@nestjs/swagger';
import { Response } from 'express';
import { AuditLogService } from '../services/audit-log.service';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { PermissionsGuard } from '../guards/permissions.guard';
import { RequirePermissions } from '../decorators/permissions.decorator';
import { CurrentUser } from '../decorators/current-user.decorator';
import { PERMISSIONS } from '../constants/permissions';
import {
  AuditLogQueryDto,
  AuditLogResultDto,
  AuditLogStatsDto,
  ExportAuditLogsDto,
  CleanupAuditLogsDto,
  CreateAuditLogDto,
} from '../dto/audit-log.dto';

@ApiTags('Audit Logs')
@ApiBearerAuth()
@Controller('audit-logs')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class AuditLogController {
  constructor(private readonly auditLogService: AuditLogService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.SYSTEM.VIEW_AUDIT_LOGS)
  @ApiOperation({
    summary: 'Query audit logs',
    description: 'Get audit logs with filtering, pagination, and sorting',
  })
  @ApiResponse({
    status: 200,
    description: 'Audit logs retrieved successfully',
    type: AuditLogResultDto,
  })
  async queryAuditLogs(@Query() query: AuditLogQueryDto): Promise<AuditLogResultDto> {
    return await this.auditLogService.queryLogs({
      filters: {
        userId: query.userId,
        organizationId: query.organizationId,
        action: query.action,
        entityType: query.entityType,
        entityId: query.entityId,
        startDate: query.startDate,
        endDate: query.endDate,
        ipAddress: query.ipAddress,
      },
      page: query.page,
      limit: query.limit,
      sortBy: query.sortBy,
      sortOrder: query.sortOrder,
    });
  }

  @Get('user/:userId')
  @RequirePermissions(PERMISSIONS.SYSTEM.VIEW_AUDIT_LOGS)
  @ApiOperation({
    summary: 'Get audit logs for a specific user',
    description: 'Retrieve audit logs for a specific user with pagination',
  })
  @ApiParam({
    name: 'userId',
    description: 'ID of the user',
    example: 'clp123456789',
  })
  @ApiQuery({
    name: 'page',
    description: 'Page number',
    example: 1,
    required: false,
  })
  @ApiQuery({
    name: 'limit',
    description: 'Items per page',
    example: 50,
    required: false,
  })
  @ApiResponse({
    status: 200,
    description: 'User audit logs retrieved successfully',
    type: AuditLogResultDto,
  })
  async getUserAuditLogs(
    @Param('userId') userId: string,
    @CurrentUser() currentUser: any,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ): Promise<AuditLogResultDto> {
    return await this.auditLogService.getUserAuditLogs(
      userId,
      currentUser.organizationId,
      page,
      limit,
    );
  }

  @Get('organization/:organizationId')
  @RequirePermissions(PERMISSIONS.SYSTEM.VIEW_AUDIT_LOGS)
  @ApiOperation({
    summary: 'Get audit logs for a specific organization',
    description: 'Retrieve audit logs for a specific organization with pagination',
  })
  @ApiParam({
    name: 'organizationId',
    description: 'ID of the organization',
    example: 'clp987654321',
  })
  @ApiQuery({
    name: 'page',
    description: 'Page number',
    example: 1,
    required: false,
  })
  @ApiQuery({
    name: 'limit',
    description: 'Items per page',
    example: 50,
    required: false,
  })
  @ApiResponse({
    status: 200,
    description: 'Organization audit logs retrieved successfully',
    type: AuditLogResultDto,
  })
  async getOrganizationAuditLogs(
    @Param('organizationId') organizationId: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ): Promise<AuditLogResultDto> {
    return await this.auditLogService.getOrganizationAuditLogs(
      organizationId,
      page,
      limit,
    );
  }

  @Get('security')
  @RequirePermissions(PERMISSIONS.SYSTEM.VIEW_AUDIT_LOGS)
  @ApiOperation({
    summary: 'Get security-related audit logs',
    description: 'Retrieve security events and suspicious activities',
  })
  @ApiQuery({
    name: 'organizationId',
    description: 'Filter by organization ID',
    example: 'clp987654321',
    required: false,
  })
  @ApiQuery({
    name: 'page',
    description: 'Page number',
    example: 1,
    required: false,
  })
  @ApiQuery({
    name: 'limit',
    description: 'Items per page',
    example: 50,
    required: false,
  })
  @ApiResponse({
    status: 200,
    description: 'Security audit logs retrieved successfully',
    type: AuditLogResultDto,
  })
  async getSecurityAuditLogs(
    @Query('organizationId') organizationId?: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ): Promise<AuditLogResultDto> {
    return await this.auditLogService.getSecurityAuditLogs(
      organizationId,
      page,
      limit,
    );
  }

  @Get('stats')
  @RequirePermissions(PERMISSIONS.SYSTEM.VIEW_AUDIT_LOGS)
  @ApiOperation({
    summary: 'Get audit log statistics',
    description: 'Get statistics and analytics for audit logs',
  })
  @ApiQuery({
    name: 'organizationId',
    description: 'Filter by organization ID',
    example: 'clp987654321',
    required: false,
  })
  @ApiQuery({
    name: 'startDate',
    description: 'Start date for statistics',
    example: '2024-01-01T00:00:00Z',
    required: false,
  })
  @ApiQuery({
    name: 'endDate',
    description: 'End date for statistics',
    example: '2024-01-31T23:59:59Z',
    required: false,
  })
  @ApiResponse({
    status: 200,
    description: 'Audit log statistics retrieved successfully',
    type: AuditLogStatsDto,
  })
  async getAuditLogStats(
    @Query('organizationId') organizationId?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ): Promise<AuditLogStatsDto> {
    return await this.auditLogService.getAuditLogStats(
      organizationId,
      startDate ? new Date(startDate) : undefined,
      endDate ? new Date(endDate) : undefined,
    );
  }

  @Post('export')
  @RequirePermissions(PERMISSIONS.SYSTEM.VIEW_AUDIT_LOGS)
  @ApiOperation({
    summary: 'Export audit logs to CSV',
    description: 'Export filtered audit logs to CSV format',
  })
  @ApiResponse({
    status: 200,
    description: 'Audit logs exported successfully',
    headers: {
      'Content-Type': {
        description: 'text/csv',
      },
      'Content-Disposition': {
        description: 'attachment; filename="audit-logs.csv"',
      },
    },
  })
  async exportAuditLogs(
    @Body() exportDto: ExportAuditLogsDto,
    @Res() res: Response,
  ): Promise<void> {
    const csv = await this.auditLogService.exportToCsv(
      {
        userId: exportDto.userId,
        organizationId: exportDto.organizationId,
        action: exportDto.action,
        entityType: exportDto.entityType,
        entityId: exportDto.entityId,
        startDate: exportDto.startDate,
        endDate: exportDto.endDate,
        ipAddress: exportDto.ipAddress,
      },
      exportDto.limit,
    );

    const filename = `audit-logs-${new Date().toISOString().split('T')[0]}.csv`;
    
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(csv);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.SYSTEM.MANAGE_SETTINGS)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Create audit log entry',
    description: 'Manually create an audit log entry (for system integrations)',
  })
  @ApiResponse({
    status: 201,
    description: 'Audit log entry created successfully',
  })
  async createAuditLog(
    @Body() createDto: CreateAuditLogDto,
    @CurrentUser() currentUser: any,
  ): Promise<void> {
    await this.auditLogService.log({
      userId: createDto.userId || currentUser.id,
      organizationId: createDto.organizationId || currentUser.organizationId,
      action: createDto.action,
      entityType: createDto.entityType,
      entityId: createDto.entityId,
      previousValue: createDto.previousValue,
      newValue: createDto.newValue,
      metadata: createDto.metadata,
    });
  }

  @Delete('cleanup')
  @RequirePermissions(PERMISSIONS.SYSTEM.MANAGE_SETTINGS)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Clean up old audit logs',
    description: 'Remove audit logs older than the specified retention period',
  })
  @ApiResponse({
    status: 200,
    description: 'Audit logs cleaned up successfully',
    schema: {
      type: 'object',
      properties: {
        deletedCount: {
          type: 'number',
          example: 1500,
          description: 'Number of audit logs deleted',
        },
      },
    },
  })
  async cleanupAuditLogs(
    @Body() cleanupDto: CleanupAuditLogsDto,
  ): Promise<{ deletedCount: number }> {
    const deletedCount = await this.auditLogService.cleanupOldLogs(
      cleanupDto.retentionDays,
    );
    
    return { deletedCount };
  }

  @Get('actions')
  @RequirePermissions(PERMISSIONS.SYSTEM.VIEW_AUDIT_LOGS)
  @ApiOperation({
    summary: 'Get available audit log actions',
    description: 'Get list of all available audit log action types',
  })
  @ApiResponse({
    status: 200,
    description: 'Available actions retrieved successfully',
    schema: {
      type: 'object',
      properties: {
        actions: {
          type: 'array',
          items: { type: 'string' },
          example: ['LOGIN_SUCCESS', 'LOGIN_FAILED', 'USER_CREATED'],
        },
      },
    },
  })
  getAvailableActions(): { actions: string[] } {
    return {
      actions: Object.values(AuditLogService.ACTIONS),
    };
  }

  @Get('entity-types')
  @RequirePermissions(PERMISSIONS.SYSTEM.VIEW_AUDIT_LOGS)
  @ApiOperation({
    summary: 'Get available entity types',
    description: 'Get list of all available entity types for audit logs',
  })
  @ApiResponse({
    status: 200,
    description: 'Available entity types retrieved successfully',
    schema: {
      type: 'object',
      properties: {
        entityTypes: {
          type: 'array',
          items: { type: 'string' },
          example: ['User', 'Organization', 'Team'],
        },
      },
    },
  })
  getAvailableEntityTypes(): { entityTypes: string[] } {
    return {
      entityTypes: Object.values(AuditLogService.ENTITY_TYPES),
    };
  }
}