import { IsString, IsOptional, IsUUID, IsDate, IsNumber, IsEnum, IsObject, Min, Max } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class AuditLogFilterDto {
  @ApiProperty({
    description: 'Filter by user ID',
    example: 'clp123456789',
    required: false,
  })
  @IsOptional()
  @IsString()
  @IsUUID()
  userId?: string;

  @ApiProperty({
    description: 'Filter by organization ID',
    example: 'clp987654321',
    required: false,
  })
  @IsOptional()
  @IsString()
  @IsUUID()
  organizationId?: string;

  @ApiProperty({
    description: 'Filter by action',
    example: 'LOGIN_SUCCESS',
    required: false,
  })
  @IsOptional()
  @IsString()
  action?: string;

  @ApiProperty({
    description: 'Filter by entity type',
    example: 'User',
    required: false,
  })
  @IsOptional()
  @IsString()
  entityType?: string;

  @ApiProperty({
    description: 'Filter by entity ID',
    example: 'clp555666777',
    required: false,
  })
  @IsOptional()
  @IsString()
  entityId?: string;

  @ApiProperty({
    description: 'Filter by start date',
    example: '2024-01-01T00:00:00Z',
    required: false,
  })
  @IsOptional()
  @IsDate()
  @Type(() => Date)
  startDate?: Date;

  @ApiProperty({
    description: 'Filter by end date',
    example: '2024-01-31T23:59:59Z',
    required: false,
  })
  @IsOptional()
  @IsDate()
  @Type(() => Date)
  endDate?: Date;

  @ApiProperty({
    description: 'Filter by IP address',
    example: '192.168.1.1',
    required: false,
  })
  @IsOptional()
  @IsString()
  ipAddress?: string;
}

export class AuditLogQueryDto extends AuditLogFilterDto {
  @ApiProperty({
    description: 'Page number for pagination',
    example: 1,
    default: 1,
    required: false,
  })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Type(() => Number)
  page?: number = 1;

  @ApiProperty({
    description: 'Number of items per page',
    example: 50,
    default: 50,
    required: false,
  })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(1000)
  @Type(() => Number)
  limit?: number = 50;

  @ApiProperty({
    description: 'Sort by field',
    enum: ['createdAt', 'action', 'entityType'],
    example: 'createdAt',
    default: 'createdAt',
    required: false,
  })
  @IsOptional()
  @IsEnum(['createdAt', 'action', 'entityType'])
  sortBy?: 'createdAt' | 'action' | 'entityType' = 'createdAt';

  @ApiProperty({
    description: 'Sort order',
    enum: ['asc', 'desc'],
    example: 'desc',
    default: 'desc',
    required: false,
  })
  @IsOptional()
  @IsEnum(['asc', 'desc'])
  sortOrder?: 'asc' | 'desc' = 'desc';
}

export class AuditLogEntryDto {
  @ApiProperty({
    description: 'Audit log ID',
    example: 'clp123456789',
  })
  id: string;

  @ApiProperty({
    description: 'User ID who performed the action',
    example: 'clp987654321',
    required: false,
  })
  userId?: string;

  @ApiProperty({
    description: 'Organization ID',
    example: 'clp111222333',
    required: false,
  })
  organizationId?: string;

  @ApiProperty({
    description: 'Action performed',
    example: 'LOGIN_SUCCESS',
  })
  action: string;

  @ApiProperty({
    description: 'Type of entity affected',
    example: 'User',
  })
  entityType: string;

  @ApiProperty({
    description: 'ID of the affected entity',
    example: 'clp555666777',
  })
  entityId: string;

  @ApiProperty({
    description: 'Previous value before the action',
    example: { role: 'CALL_CENTER_AGENT' },
    required: false,
  })
  @IsOptional()
  @IsObject()
  previousValue?: any;

  @ApiProperty({
    description: 'New value after the action',
    example: { role: 'TEAM_LEADER' },
    required: false,
  })
  @IsOptional()
  @IsObject()
  newValue?: any;

  @ApiProperty({
    description: 'IP address of the user',
    example: '192.168.1.1',
    required: false,
  })
  ipAddress?: string;

  @ApiProperty({
    description: 'User agent string',
    example: 'Mozilla/5.0...',
    required: false,
  })
  userAgent?: string;

  @ApiProperty({
    description: 'Timestamp when the action occurred',
    example: '2024-01-15T10:30:00Z',
  })
  createdAt: Date;
}

export class AuditLogResultDto {
  @ApiProperty({
    description: 'List of audit log entries',
    type: [AuditLogEntryDto],
  })
  logs: AuditLogEntryDto[];

  @ApiProperty({
    description: 'Total number of audit logs matching the filter',
    example: 1250,
  })
  total: number;

  @ApiProperty({
    description: 'Current page number',
    example: 1,
  })
  page: number;

  @ApiProperty({
    description: 'Number of items per page',
    example: 50,
  })
  limit: number;

  @ApiProperty({
    description: 'Total number of pages',
    example: 25,
  })
  totalPages: number;
}

export class AuditLogStatsDto {
  @ApiProperty({
    description: 'Total number of audit logs',
    example: 5000,
  })
  totalLogs: number;

  @ApiProperty({
    description: 'Count of logs by action type',
    example: {
      'LOGIN_SUCCESS': 1500,
      'LOGIN_FAILED': 200,
      'USER_CREATED': 50,
    },
  })
  actionCounts: Record<string, number>;

  @ApiProperty({
    description: 'Count of logs by entity type',
    example: {
      'User': 3000,
      'Team': 500,
      'Organization': 100,
    },
  })
  entityTypeCounts: Record<string, number>;

  @ApiProperty({
    description: 'Daily log counts for the last 30 days',
    example: [
      { date: '2024-01-15', count: 150 },
      { date: '2024-01-14', count: 200 },
    ],
  })
  dailyCounts: Array<{ date: string; count: number }>;
}

export class ExportAuditLogsDto extends AuditLogFilterDto {
  @ApiProperty({
    description: 'Maximum number of logs to export',
    example: 10000,
    default: 10000,
    required: false,
  })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(100000)
  @Type(() => Number)
  limit?: number = 10000;
}

export class CleanupAuditLogsDto {
  @ApiProperty({
    description: 'Number of days to retain audit logs',
    example: 365,
    default: 365,
  })
  @IsNumber()
  @Min(30)
  @Max(3650) // Max 10 years
  @Type(() => Number)
  retentionDays: number = 365;
}

export class CreateAuditLogDto {
  @ApiProperty({
    description: 'User ID who performed the action',
    example: 'clp987654321',
    required: false,
  })
  @IsOptional()
  @IsString()
  @IsUUID()
  userId?: string;

  @ApiProperty({
    description: 'Organization ID',
    example: 'clp111222333',
    required: false,
  })
  @IsOptional()
  @IsString()
  @IsUUID()
  organizationId?: string;

  @ApiProperty({
    description: 'Action performed',
    example: 'USER_CREATED',
  })
  @IsString()
  action: string;

  @ApiProperty({
    description: 'Type of entity affected',
    example: 'User',
  })
  @IsString()
  entityType: string;

  @ApiProperty({
    description: 'ID of the affected entity',
    example: 'clp555666777',
  })
  @IsString()
  entityId: string;

  @ApiProperty({
    description: 'Previous value before the action',
    example: { status: 'PENDING' },
    required: false,
  })
  @IsOptional()
  @IsObject()
  previousValue?: any;

  @ApiProperty({
    description: 'New value after the action',
    example: { status: 'ACTIVE' },
    required: false,
  })
  @IsOptional()
  @IsObject()
  newValue?: any;

  @ApiProperty({
    description: 'Additional metadata',
    example: { source: 'admin_panel' },
    required: false,
  })
  @IsOptional()
  @IsObject()
  metadata?: any;
}