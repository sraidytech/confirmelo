import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsBoolean, IsOptional, IsNumber, IsEnum, IsObject, IsArray, ValidateNested, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';
import { OrderSyncConfig, BatchProcessingOptions } from '../interfaces/google-sheets-order-sync.interface';

/**
 * DTO for creating an order sheet
 */
export class CreateOrderSheetDto {
  @ApiProperty({
    description: 'Name for the new order sheet',
    example: 'My Store Orders - January 2025',
  })
  @IsString()
  name: string;

  @ApiPropertyOptional({
    description: 'Custom configuration for the order sheet',
  })
  @IsOptional()
  @IsObject()
  config?: Partial<OrderSyncConfig>;
}

/**
 * DTO for enabling order sync on a spreadsheet
 */
export class EnableOrderSyncDto {
  @ApiProperty({
    description: 'Google Sheets spreadsheet ID',
    example: '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms',
  })
  @IsString()
  spreadsheetId: string;

  @ApiPropertyOptional({
    description: 'Name of the sheet within the spreadsheet (defaults to first sheet)',
    example: 'Orders',
  })
  @IsOptional()
  @IsString()
  sheetName?: string;

  @ApiPropertyOptional({
    description: 'Order sync configuration',
  })
  @IsOptional()
  @IsObject()
  config?: Partial<OrderSyncConfig>;

  @ApiPropertyOptional({
    description: 'Enable automatic webhook-based sync',
    default: true,
  })
  @IsOptional()
  @IsBoolean()
  enableWebhook?: boolean;
}

/**
 * DTO for manual sync trigger
 */
export class TriggerManualSyncDto {
  @ApiPropertyOptional({
    description: 'Start from specific row number (defaults to last synced row)',
    minimum: 1,
  })
  @IsOptional()
  @IsNumber()
  @Min(1)
  startRow?: number;

  @ApiPropertyOptional({
    description: 'End at specific row number (defaults to last row with data)',
    minimum: 1,
  })
  @IsOptional()
  @IsNumber()
  @Min(1)
  endRow?: number;

  @ApiPropertyOptional({
    description: 'Force re-sync of already processed rows',
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  forceResync?: boolean;

  @ApiPropertyOptional({
    description: 'Batch processing options',
  })
  @IsOptional()
  @IsObject()
  batchOptions?: BatchProcessingOptions;
}

/**
 * DTO for updating order sync configuration
 */
export class UpdateOrderSyncConfigDto {
  @ApiPropertyOptional({
    description: 'Column mapping configuration',
  })
  @IsOptional()
  @IsObject()
  columnMapping?: OrderSyncConfig['columnMapping'];

  @ApiPropertyOptional({
    description: 'Header row number',
    minimum: 1,
  })
  @IsOptional()
  @IsNumber()
  @Min(1)
  headerRow?: number;

  @ApiPropertyOptional({
    description: 'Data start row number',
    minimum: 1,
  })
  @IsOptional()
  @IsNumber()
  @Min(1)
  dataStartRow?: number;

  @ApiPropertyOptional({
    description: 'Sheet name within the spreadsheet',
  })
  @IsOptional()
  @IsString()
  sheetName?: string;

  @ApiPropertyOptional({
    description: 'Enable automatic sync',
  })
  @IsOptional()
  @IsBoolean()
  autoSync?: boolean;

  @ApiPropertyOptional({
    description: 'Duplicate handling strategy',
    enum: ['skip', 'flag', 'create'],
  })
  @IsOptional()
  @IsEnum(['skip', 'flag', 'create'])
  duplicateHandling?: 'skip' | 'flag' | 'create';

  @ApiPropertyOptional({
    description: 'Validation rules',
  })
  @IsOptional()
  @IsObject()
  validationRules?: OrderSyncConfig['validationRules'];
}

/**
 * DTO for sync history query
 */
export class SyncHistoryQueryDto {
  @ApiPropertyOptional({
    description: 'Page number for pagination',
    minimum: 1,
    default: 1,
  })
  @IsOptional()
  @IsNumber()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({
    description: 'Number of items per page',
    minimum: 1,
    maximum: 100,
    default: 20,
  })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(100)
  limit?: number = 20;

  @ApiPropertyOptional({
    description: 'Filter by operation type',
    enum: ['webhook', 'manual', 'polling'],
  })
  @IsOptional()
  @IsEnum(['webhook', 'manual', 'polling'])
  operationType?: 'webhook' | 'manual' | 'polling';

  @ApiPropertyOptional({
    description: 'Filter by status',
    enum: ['pending', 'processing', 'completed', 'failed'],
  })
  @IsOptional()
  @IsEnum(['pending', 'processing', 'completed', 'failed'])
  status?: 'pending' | 'processing' | 'completed' | 'failed';

  @ApiPropertyOptional({
    description: 'Filter by date range start (ISO string)',
  })
  @IsOptional()
  @IsString()
  startDate?: string;

  @ApiPropertyOptional({
    description: 'Filter by date range end (ISO string)',
  })
  @IsOptional()
  @IsString()
  endDate?: string;
}

/**
 * DTO for webhook notification from Google
 */
export class GoogleWebhookNotificationDto {
  @ApiProperty({
    description: 'Notification kind',
    example: 'api#channel',
  })
  @IsString()
  kind: string;

  @ApiProperty({
    description: 'Channel ID',
  })
  @IsString()
  id: string;

  @ApiProperty({
    description: 'Resource ID',
  })
  @IsString()
  resourceId: string;

  @ApiProperty({
    description: 'Resource URI',
  })
  @IsString()
  resourceUri: string;

  @ApiProperty({
    description: 'Resource state',
    enum: ['sync', 'exists', 'not_exists', 'update'],
  })
  @IsEnum(['sync', 'exists', 'not_exists', 'update'])
  resourceState: 'sync' | 'exists' | 'not_exists' | 'update';

  @ApiProperty({
    description: 'Event type',
  })
  @IsString()
  eventType: string;

  @ApiProperty({
    description: 'Event time (ISO string)',
  })
  @IsString()
  eventTime: string;

  @ApiPropertyOptional({
    description: 'Verification token',
  })
  @IsOptional()
  @IsString()
  token?: string;

  @ApiPropertyOptional({
    description: 'Subscription expiration (ISO string)',
  })
  @IsOptional()
  @IsString()
  expiration?: string;

  @ApiPropertyOptional({
    description: 'Changed properties',
  })
  @IsOptional()
  @IsString()
  changed?: string;
}

/**
 * Response DTO for order sheet creation
 */
export class OrderSheetResponseDto {
  @ApiProperty({
    description: 'Spreadsheet ID',
    example: '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms',
  })
  spreadsheetId: string;

  @ApiProperty({
    description: 'Spreadsheet name',
    example: 'My Store Orders - January 2025',
  })
  spreadsheetName: string;

  @ApiProperty({
    description: 'Web view link to the spreadsheet',
    example: 'https://docs.google.com/spreadsheets/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms',
  })
  webViewLink: string;

  @ApiProperty({
    description: 'Connection ID',
  })
  connectionId: string;

  @ApiProperty({
    description: 'Whether order sync is enabled',
  })
  isOrderSyncEnabled: boolean;

  @ApiPropertyOptional({
    description: 'Webhook subscription ID if webhooks are enabled',
  })
  webhookSubscriptionId?: string;

  @ApiProperty({
    description: 'Last sync row number',
  })
  lastSyncRow: number;

  @ApiProperty({
    description: 'Total orders imported',
  })
  totalOrders: number;

  @ApiPropertyOptional({
    description: 'Last sync timestamp',
  })
  lastSyncAt?: Date;
}

/**
 * Response DTO for sync operation
 */
export class SyncOperationResponseDto {
  @ApiProperty({
    description: 'Operation ID',
  })
  operationId: string;

  @ApiProperty({
    description: 'Operation status',
    enum: ['pending', 'processing', 'completed', 'failed'],
  })
  status: 'pending' | 'processing' | 'completed' | 'failed';

  @ApiProperty({
    description: 'Number of orders processed',
  })
  ordersProcessed: number;

  @ApiProperty({
    description: 'Number of orders created',
  })
  ordersCreated: number;

  @ApiProperty({
    description: 'Number of orders skipped',
  })
  ordersSkipped: number;

  @ApiProperty({
    description: 'Number of errors encountered',
  })
  errorCount: number;

  @ApiProperty({
    description: 'Operation start time',
  })
  startedAt: Date;

  @ApiPropertyOptional({
    description: 'Operation completion time',
  })
  completedAt?: Date;

  @ApiPropertyOptional({
    description: 'Operation duration in milliseconds',
  })
  duration?: number;

  @ApiPropertyOptional({
    description: 'Error details if any',
  })
  errors?: Array<{
    rowNumber: number;
    errorType: string;
    errorMessage: string;
    field?: string;
  }>;
}

/**
 * Response DTO for sync status
 */
export class SyncStatusResponseDto {
  @ApiProperty({
    description: 'Connection ID',
  })
  connectionId: string;

  @ApiProperty({
    description: 'Spreadsheet ID',
  })
  spreadsheetId: string;

  @ApiProperty({
    description: 'Whether sync is enabled',
  })
  isEnabled: boolean;

  @ApiPropertyOptional({
    description: 'Last sync timestamp',
  })
  lastSyncAt?: Date;

  @ApiPropertyOptional({
    description: 'Last sync result',
    enum: ['success', 'partial', 'failed'],
  })
  lastSyncResult?: 'success' | 'partial' | 'failed';

  @ApiPropertyOptional({
    description: 'Next scheduled sync timestamp',
  })
  nextSyncAt?: Date;

  @ApiProperty({
    description: 'Total number of sync operations',
  })
  totalSyncs: number;

  @ApiProperty({
    description: 'Total orders created',
  })
  totalOrdersCreated: number;

  @ApiProperty({
    description: 'Total orders skipped',
  })
  totalOrdersSkipped: number;

  @ApiProperty({
    description: 'Total errors encountered',
  })
  totalErrors: number;

  @ApiProperty({
    description: 'Webhook status',
    enum: ['active', 'expired', 'failed', 'none'],
  })
  webhookStatus: 'active' | 'expired' | 'failed' | 'none';

  @ApiPropertyOptional({
    description: 'Webhook expiration timestamp',
  })
  webhookExpiration?: Date;

  @ApiPropertyOptional({
    description: 'Recent errors (last 10)',
  })
  recentErrors?: Array<{
    rowNumber: number;
    errorType: string;
    errorMessage: string;
    timestamp: Date;
  }>;
}

/**
 * Response DTO for sync history
 */
export class SyncHistoryResponseDto {
  @ApiProperty({
    description: 'Sync history entries',
    type: [SyncOperationResponseDto],
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SyncOperationResponseDto)
  history: SyncOperationResponseDto[];

  @ApiProperty({
    description: 'Total number of entries',
  })
  total: number;

  @ApiProperty({
    description: 'Current page number',
  })
  page: number;

  @ApiProperty({
    description: 'Number of items per page',
  })
  limit: number;

  @ApiProperty({
    description: 'Whether there are more pages',
  })
  hasMore: boolean;
}