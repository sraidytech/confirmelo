import { Injectable, Logger, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../common/database/prisma.service';
import { GoogleSheetsOAuth2Service } from './google-sheets-oauth2.service';
import { SpreadsheetConnectionService } from './spreadsheet-connection.service';
import { ConfigService } from '@nestjs/config';
import {
  OrderSheetInfo,
  OrderSyncConfig,
  SyncError,
  SheetOrder,
  ValidationResult,
  ValidationError,
  ValidationWarning,
} from '../../../common/interfaces/google-sheets-order-sync.interface';
import {
  CreateOrderSheetDto,
  EnableOrderSyncDto,
  TriggerManualSyncDto,
  UpdateOrderSyncConfigDto,
  OrderSheetResponseDto,
  SyncOperationResponseDto,
  SyncStatusResponseDto,
} from '../../../common/dto/google-sheets-order-sync.dto';
import { OrderStatus, PlatformType } from '@prisma/client';

@Injectable()
export class GoogleSheetsOrderService {
  private readonly logger = new Logger(GoogleSheetsOrderService.name);

  constructor(
    private readonly prismaService: PrismaService,
    private readonly googleSheetsService: GoogleSheetsOAuth2Service,
    private readonly spreadsheetConnectionService: SpreadsheetConnectionService,
    private readonly configService: ConfigService,
  ) { }

  /**
   * Create a new order sheet with predefined template
   */
  async createOrderSheet(
    connectionId: string,
    dto: CreateOrderSheetDto,
  ): Promise<OrderSheetResponseDto> {
    try {
      this.logger.log('Creating order sheet', {
        connectionId,
        name: dto.name,
      });

      // Verify connection exists and is active
      const connection = await this.validateConnection(connectionId);

      // Create the spreadsheet using the existing service
      const result = await this.googleSheetsService.createOrdersSpreadsheet(
        connectionId,
        dto.name,
      );

      if (!result.success || !result.spreadsheet) {
        throw new BadRequestException(result.error || 'Failed to create order sheet');
      }

      // Enable order sync with default configuration
      const defaultConfig: OrderSyncConfig = {
        columnMapping: {
          orderId: 'A',
          date: 'B',
          customerName: 'C',
          phone: 'D',
          address: 'E',
          city: 'F',
          productName: 'G',
          productSku: 'H',
          productQuantity: 'I',
          productVariant: 'J',
          price: 'K',
          pageUrl: 'L',
        },
        headerRow: 1,
        dataStartRow: 2,
        sheetName: 'Orders',
        autoSync: true,
        duplicateHandling: 'skip',
        validationRules: {
          requirePhone: true,
          requireProduct: true,
          requirePrice: true,
          phoneFormat: 'morocco',
          priceValidation: true,
        },
      };

      // Merge with custom config if provided
      const finalConfig = dto.config ? { ...defaultConfig, ...dto.config } : defaultConfig;

      // Create spreadsheet connection record
      await this.createSpreadsheetConnection(
        connectionId,
        result.spreadsheet.id,
        result.spreadsheet.name,
        result.spreadsheet.webViewLink,
        finalConfig,
      );

      this.logger.log('Successfully created order sheet', {
        connectionId,
        spreadsheetId: result.spreadsheet.id,
        name: dto.name,
      });

      return {
        spreadsheetId: result.spreadsheet.id,
        spreadsheetName: result.spreadsheet.name,
        webViewLink: result.spreadsheet.webViewLink,
        connectionId,
        isOrderSyncEnabled: true,
        lastSyncRow: 1,
        totalOrders: 0,
      };
    } catch (error) {
      this.logger.error('Failed to create order sheet', {
        error: error.message,
        connectionId,
        name: dto.name,
      });
      throw error;
    }
  }

  /**
   * Enable order sync on an existing spreadsheet
   */
  async enableOrderSync(
    connectionId: string,
    dto: EnableOrderSyncDto,
  ): Promise<OrderSheetResponseDto> {
    try {
      this.logger.log('Enabling order sync', {
        connectionId,
        spreadsheetId: dto.spreadsheetId,
        sheetName: dto.sheetName,
      });

      // Verify connection exists and is active
      const connection = await this.validateConnection(connectionId);

      // Get access token and verify spreadsheet access
      const accessToken = await this.googleSheetsService['oauth2Service'].getAccessToken(connectionId);
      const spreadsheet = await this.googleSheetsService.getSpreadsheet(
        accessToken,
        dto.spreadsheetId,
      );

      // Determine sheet name
      const sheetName = dto.sheetName || spreadsheet.sheets[0]?.properties.title || 'Sheet1';
      const targetSheet = spreadsheet.sheets.find(sheet => sheet.properties.title === sheetName);

      if (!targetSheet) {
        throw new BadRequestException(`Sheet "${sheetName}" not found in spreadsheet`);
      }

      // Create default configuration if not provided
      const defaultConfig: OrderSyncConfig = {
        columnMapping: {
          orderId: 'A',
          date: 'B',
          customerName: 'C',
          phone: 'D',
          address: 'E',
          city: 'F',
          productName: 'G',
          productSku: 'H',
          productQuantity: 'I',
          productVariant: 'J',
          price: 'K',
          pageUrl: 'L',
        },
        headerRow: 1,
        dataStartRow: 2,
        sheetName,
        autoSync: true,
        duplicateHandling: 'skip',
        validationRules: {
          requirePhone: true,
          requireProduct: true,
          requirePrice: true,
          phoneFormat: 'morocco',
          priceValidation: true,
        },
      };

      const finalConfig = dto.config ? { ...defaultConfig, ...dto.config } : defaultConfig;

      // Create or update spreadsheet connection
      const spreadsheetConnection = await this.createSpreadsheetConnection(
        connectionId,
        dto.spreadsheetId,
        spreadsheet.properties.title,
        `https://docs.google.com/spreadsheets/d/${dto.spreadsheetId}`,
        finalConfig,
      );

      // Set up webhook if requested
      let webhookSubscriptionId: string | undefined;
      if (dto.enableWebhook !== false) {
        try {
          webhookSubscriptionId = await this.setupWebhookSubscription(
            connectionId,
            dto.spreadsheetId,
          );
        } catch (webhookError) {
          this.logger.warn('Failed to set up webhook, continuing without it', {
            error: webhookError.message,
            connectionId,
            spreadsheetId: dto.spreadsheetId,
          });
        }
      }

      this.logger.log('Successfully enabled order sync', {
        connectionId,
        spreadsheetId: dto.spreadsheetId,
        sheetName,
        webhookEnabled: !!webhookSubscriptionId,
      });

      return {
        spreadsheetId: dto.spreadsheetId,
        spreadsheetName: spreadsheet.properties.title,
        webViewLink: `https://docs.google.com/spreadsheets/d/${dto.spreadsheetId}`,
        connectionId,
        isOrderSyncEnabled: true,
        webhookSubscriptionId,
        lastSyncRow: finalConfig.headerRow,
        totalOrders: 0,
      };
    } catch (error) {
      this.logger.error('Failed to enable order sync', {
        error: error.message,
        connectionId,
        spreadsheetId: dto.spreadsheetId,
      });
      throw error;
    }
  }

  /**
   * Get order sheet information
   */
  async getOrderSheetInfo(
    connectionId: string,
    spreadsheetId: string,
  ): Promise<OrderSheetInfo> {
    try {
      this.logger.log('Getting order sheet info', {
        connectionId,
        spreadsheetId,
      });

      // Get spreadsheet connection
      const spreadsheetConnection = await this.prismaService.spreadsheetConnection.findFirst({
        where: {
          connectionId,
          spreadsheetId,
        },
      });

      if (!spreadsheetConnection) {
        throw new NotFoundException('Order sheet not found or not configured for sync');
      }

      // Get sync statistics
      const syncStats = await this.getSyncStatistics(connectionId, spreadsheetId);

      return {
        spreadsheetId,
        spreadsheetName: spreadsheetConnection.spreadsheetName,
        webViewLink: spreadsheetConnection.webViewLink || '',
        connectionId,
        isOrderSyncEnabled: spreadsheetConnection.isOrderSync,
        webhookSubscriptionId: spreadsheetConnection.webhookSubscriptionId,
        lastSyncAt: spreadsheetConnection.lastSyncAt,
        lastSyncRow: spreadsheetConnection.lastSyncRow,
        totalOrders: syncStats.totalOrdersCreated,
        orderSyncConfig: spreadsheetConnection.orderSyncConfig as unknown as OrderSyncConfig,
      };
    } catch (error) {
      this.logger.error('Failed to get order sheet info', {
        error: error.message,
        connectionId,
        spreadsheetId,
      });
      throw error;
    }
  }

  /**
   * Trigger manual sync of orders from spreadsheet
   */
  async triggerManualSync(
    connectionId: string,
    spreadsheetId: string,
    dto: TriggerManualSyncDto,
  ): Promise<SyncOperationResponseDto> {
    try {
      this.logger.log('Triggering manual sync', {
        connectionId,
        spreadsheetId,
        startRow: dto.startRow,
        endRow: dto.endRow,
        forceResync: dto.forceResync,
      });

      // Verify spreadsheet connection exists
      const spreadsheetConnection = await this.prismaService.spreadsheetConnection.findFirst({
        where: {
          connectionId,
          spreadsheetId,
          isOrderSync: true,
        },
      });

      if (!spreadsheetConnection) {
        throw new NotFoundException('Order sync not enabled for this spreadsheet');
      }

      // Create sync operation record
      const syncOperation = await this.prismaService.syncOperation.create({
        data: {
          connectionId,
          spreadsheetId,
          operationType: 'manual',
          status: 'pending',
          ordersProcessed: 0,
          ordersCreated: 0,
          ordersSkipped: 0,
          errorCount: 0,
          startedAt: new Date(),
        },
      });

      // Start async sync process (in a real implementation, this would be queued)
      this.performSync(syncOperation.id, dto).catch(error => {
        this.logger.error('Sync operation failed', {
          operationId: syncOperation.id,
          error: error.message,
        });
      });

      return {
        operationId: syncOperation.id,
        status: 'pending',
        ordersProcessed: 0,
        ordersCreated: 0,
        ordersSkipped: 0,
        errorCount: 0,
        startedAt: syncOperation.startedAt,
      };
    } catch (error) {
      this.logger.error('Failed to trigger manual sync', {
        error: error.message,
        connectionId,
        spreadsheetId,
      });
      throw error;
    }
  }

  /**
   * Update order sync configuration
   */
  async updateOrderSyncConfig(
    connectionId: string,
    spreadsheetId: string,
    dto: UpdateOrderSyncConfigDto,
  ): Promise<OrderSheetResponseDto> {
    try {
      this.logger.log('Updating order sync config', {
        connectionId,
        spreadsheetId,
        updates: Object.keys(dto),
      });

      // Get existing spreadsheet connection
      const existingConnection = await this.prismaService.spreadsheetConnection.findFirst({
        where: {
          connectionId,
          spreadsheetId,
        },
      });

      if (!existingConnection) {
        throw new NotFoundException('Spreadsheet connection not found');
      }

      const currentConfig = existingConnection.orderSyncConfig as unknown as OrderSyncConfig;

      // Merge configuration updates
      const updatedConfig: OrderSyncConfig = {
        ...currentConfig,
        ...(dto.columnMapping && { columnMapping: { ...currentConfig.columnMapping, ...dto.columnMapping } }),
        ...(dto.headerRow && { headerRow: dto.headerRow }),
        ...(dto.dataStartRow && { dataStartRow: dto.dataStartRow }),
        ...(dto.sheetName && { sheetName: dto.sheetName }),
        ...(dto.autoSync !== undefined && { autoSync: dto.autoSync }),
        ...(dto.duplicateHandling && { duplicateHandling: dto.duplicateHandling }),
        ...(dto.validationRules && { validationRules: { ...currentConfig.validationRules, ...dto.validationRules } }),
      };

      // Update the spreadsheet connection
      const updatedConnection = await this.prismaService.spreadsheetConnection.update({
        where: {
          connectionId_spreadsheetId: {
            connectionId,
            spreadsheetId,
          },
        },
        data: {
          orderSyncConfig: updatedConfig as any,
          updatedAt: new Date(),
        },
      });

      this.logger.log('Successfully updated order sync config', {
        connectionId,
        spreadsheetId,
      });

      return {
        spreadsheetId,
        spreadsheetName: updatedConnection.spreadsheetName,
        webViewLink: updatedConnection.webViewLink || '',
        connectionId,
        isOrderSyncEnabled: updatedConnection.isOrderSync,
        webhookSubscriptionId: updatedConnection.webhookSubscriptionId,
        lastSyncAt: updatedConnection.lastSyncAt,
        lastSyncRow: updatedConnection.lastSyncRow,
        totalOrders: 0, // This would be calculated from sync statistics
      };
    } catch (error) {
      this.logger.error('Failed to update order sync config', {
        error: error.message,
        connectionId,
        spreadsheetId,
      });
      throw error;
    }
  }

  /**
   * Get sync status for a spreadsheet
   */
  async getSyncStatus(
    connectionId: string,
    spreadsheetId: string,
  ): Promise<SyncStatusResponseDto> {
    try {
      this.logger.log('Getting sync status', {
        connectionId,
        spreadsheetId,
      });

      // Get spreadsheet connection
      const spreadsheetConnection = await this.prismaService.spreadsheetConnection.findFirst({
        where: {
          connectionId,
          spreadsheetId,
        },
      });

      if (!spreadsheetConnection) {
        throw new NotFoundException('Spreadsheet connection not found');
      }

      // Get sync statistics
      const syncStats = await this.getSyncStatistics(connectionId, spreadsheetId);

      // Get recent errors
      const recentErrors = await this.prismaService.syncOperation.findMany({
        where: {
          connectionId,
          spreadsheetId,
          errorCount: { gt: 0 },
        },
        orderBy: { startedAt: 'desc' },
        take: 10,
        select: {
          errorDetails: true,
          startedAt: true,
        },
      });

      // Get last sync result
      const lastSync = await this.prismaService.syncOperation.findFirst({
        where: {
          connectionId,
          spreadsheetId,
          status: 'completed',
        },
        orderBy: { completedAt: 'desc' },
      });

      let lastSyncResult: 'success' | 'partial' | 'failed' | undefined;
      if (lastSync) {
        if (lastSync.errorCount === 0) {
          lastSyncResult = 'success';
        } else if (lastSync.ordersCreated > 0) {
          lastSyncResult = 'partial';
        } else {
          lastSyncResult = 'failed';
        }
      }

      // Determine webhook status
      let webhookStatus: 'active' | 'expired' | 'failed' | 'none' = 'none';
      let webhookExpiration: Date | undefined;

      if (spreadsheetConnection.webhookSubscriptionId) {
        // Get webhook subscription details
        const webhook = await this.prismaService.webhookSubscription.findUnique({
          where: { id: spreadsheetConnection.webhookSubscriptionId },
        });

        if (webhook) {
          webhookStatus = webhook.isActive ? 'active' : 'failed';
          webhookExpiration = webhook.expiration;

          if (webhook.expiration && webhook.expiration < new Date()) {
            webhookStatus = 'expired';
          }
        }
      }

      return {
        connectionId,
        spreadsheetId,
        isEnabled: spreadsheetConnection.isOrderSync,
        lastSyncAt: spreadsheetConnection.lastSyncAt,
        lastSyncResult,
        totalSyncs: syncStats.totalSyncs,
        totalOrdersCreated: syncStats.totalOrdersCreated,
        totalOrdersSkipped: syncStats.totalOrdersSkipped,
        totalErrors: syncStats.totalErrors,
        webhookStatus,
        webhookExpiration,
        recentErrors: recentErrors.flatMap(sync =>
          (sync.errorDetails as any[])?.map(error => ({
            rowNumber: error.rowNumber,
            errorType: error.errorType,
            errorMessage: error.errorMessage,
            timestamp: sync.startedAt,
          })) || []
        ).slice(0, 10),
      };
    } catch (error) {
      this.logger.error('Failed to get sync status', {
        error: error.message,
        connectionId,
        spreadsheetId,
      });
      throw error;
    }
  }

  /**
   * Validate connection exists and is active
   */
  private async validateConnection(connectionId: string) {
    const connection = await this.prismaService.platformConnection.findUnique({
      where: { id: connectionId },
    });

    if (!connection) {
      throw new NotFoundException('Connection not found');
    }

    if (connection.platformType !== PlatformType.GOOGLE_SHEETS) {
      throw new BadRequestException('Connection is not a Google Sheets connection');
    }

    if (connection.status !== 'ACTIVE') {
      throw new BadRequestException('Connection is not active');
    }

    return connection;
  }

  /**
   * Create spreadsheet connection record
   */
  private async createSpreadsheetConnection(
    connectionId: string,
    spreadsheetId: string,
    spreadsheetName: string,
    webViewLink: string,
    config: OrderSyncConfig,
  ) {
    return await this.prismaService.spreadsheetConnection.upsert({
      where: {
        connectionId_spreadsheetId: {
          connectionId,
          spreadsheetId,
        },
      },
      create: {
        connectionId,
        spreadsheetId,
        spreadsheetName,
        webViewLink,
        isOrderSync: true,
        orderSyncConfig: config as any,
        lastSyncRow: config.headerRow,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      update: {
        spreadsheetName,
        webViewLink,
        isOrderSync: true,
        orderSyncConfig: config as any,
        updatedAt: new Date(),
      },
    });
  }

  /**
   * Set up webhook subscription for real-time sync
   */
  private async setupWebhookSubscription(
    connectionId: string,
    spreadsheetId: string,
  ): Promise<string> {
    this.logger.log('Setting up webhook subscription', {
      connectionId,
      spreadsheetId,
    });

    try {
      // Use the webhook management service to create the subscription
      const { WebhookManagementService } = await import('./webhook-management.service');
      const webhookService = new WebhookManagementService(
        this.prismaService,
        this.googleSheetsService,
        null, // OrderSyncService will be injected later to avoid circular dependency
        this.configService,
      );

      const subscription = await webhookService.setupWebhookForSheet(
        connectionId,
        spreadsheetId
      );

      return subscription.id;
    } catch (error) {
      this.logger.error('Failed to setup webhook subscription', {
        connectionId,
        spreadsheetId,
        error: error.message,
      });

      // Create a placeholder record if webhook setup fails
      const subscription = await this.prismaService.webhookSubscription.create({
        data: {
          connectionId,
          spreadsheetId,
          subscriptionId: `webhook_${Date.now()}`,
          resourceId: `resource_${Date.now()}`,
          isActive: false, // Mark as inactive since setup failed
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      });

      return subscription.id;
    }
  }

  /**
   * Get sync statistics for a spreadsheet
   */
  private async getSyncStatistics(connectionId: string, spreadsheetId: string) {
    const stats = await this.prismaService.syncOperation.aggregate({
      where: {
        connectionId,
        spreadsheetId,
      },
      _sum: {
        ordersProcessed: true,
        ordersCreated: true,
        ordersSkipped: true,
        errorCount: true,
      },
      _count: {
        id: true,
      },
    });

    return {
      totalSyncs: stats._count.id || 0,
      totalOrdersProcessed: stats._sum.ordersProcessed || 0,
      totalOrdersCreated: stats._sum.ordersCreated || 0,
      totalOrdersSkipped: stats._sum.ordersSkipped || 0,
      totalErrors: stats._sum.errorCount || 0,
    };
  }

  /**
   * Get orders from sheet within specified row range
   */
  async getOrdersFromSheet(
    connectionId: string,
    spreadsheetId: string,
    startRow?: number,
    endRow?: number,
  ): Promise<SheetOrder[]> {
    try {
      this.logger.log('Reading orders from sheet', {
        connectionId,
        spreadsheetId,
        startRow,
        endRow,
      });

      // Get spreadsheet connection and config
      const spreadsheetConnection = await this.prismaService.spreadsheetConnection.findFirst({
        where: {
          connectionId,
          spreadsheetId,
          isOrderSync: true,
        },
      });

      if (!spreadsheetConnection) {
        throw new NotFoundException('Order sync not enabled for this spreadsheet');
      }

      const config = spreadsheetConnection.orderSyncConfig as unknown as OrderSyncConfig;
      const accessToken = await this.googleSheetsService['oauth2Service'].getAccessToken(connectionId);

      // Determine the range to read
      const actualStartRow = startRow || config.dataStartRow;
      const actualEndRow = endRow || await this.getLastRowWithData(
        accessToken,
        spreadsheetId,
        config.sheetName,
      );

      if (actualStartRow > actualEndRow) {
        this.logger.log('No data rows to process', {
          startRow: actualStartRow,
          endRow: actualEndRow,
        });
        return [];
      }

      // Build the range string
      const range = `${config.sheetName}!A${actualStartRow}:Z${actualEndRow}`;

      // Read the data from the sheet
      const values = await this.googleSheetsService.getSpreadsheetValues(
        accessToken,
        spreadsheetId,
        range,
        'FORMATTED_VALUE',
      );

      if (!values || values.length === 0) {
        this.logger.log('No data found in specified range', { range });
        return [];
      }

      // Convert sheet rows to SheetOrder objects
      const orders: SheetOrder[] = [];
      for (let i = 0; i < values.length; i++) {
        const rowNumber = actualStartRow + i;
        const row = values[i];

        try {
          const order = this.parseSheetRow(row, rowNumber, config);
          if (order) {
            orders.push(order);
          }
        } catch (parseError) {
          this.logger.warn('Failed to parse sheet row', {
            rowNumber,
            error: parseError.message,
            rowData: row,
          });
          // Continue processing other rows
        }
      }

      this.logger.log('Successfully read orders from sheet', {
        connectionId,
        spreadsheetId,
        totalRows: values.length,
        validOrders: orders.length,
        range,
      });

      return orders;
    } catch (error) {
      this.logger.error('Failed to read orders from sheet', {
        error: error.message,
        connectionId,
        spreadsheetId,
        startRow,
        endRow,
      });

      // Handle specific Google Sheets API errors
      if (error.message.includes('quota')) {
        throw new BadRequestException('Google Sheets API quota exceeded. Please try again later.');
      }
      if (error.message.includes('rate limit')) {
        throw new BadRequestException('Rate limit exceeded. Please wait before trying again.');
      }
      if (error.message.includes('403')) {
        throw new BadRequestException('Permission denied. Please check spreadsheet access.');
      }

      throw error;
    }
  }

  /**
   * Update sheet with order IDs and status
   */
  async updateSheetWithOrderIds(
    connectionId: string,
    spreadsheetId: string,
    orderUpdates: Array<{
      rowNumber: number;
      orderId: string;
      status?: OrderStatus;
      errorMessage?: string;
    }>,
  ): Promise<void> {
    try {
      this.logger.log('Updating sheet with order IDs', {
        connectionId,
        spreadsheetId,
        updatesCount: orderUpdates.length,
      });

      if (orderUpdates.length === 0) {
        return;
      }

      // Get spreadsheet connection and config
      const spreadsheetConnection = await this.prismaService.spreadsheetConnection.findFirst({
        where: {
          connectionId,
          spreadsheetId,
          isOrderSync: true,
        },
      });

      if (!spreadsheetConnection) {
        throw new NotFoundException('Order sync not enabled for this spreadsheet');
      }

      const config = spreadsheetConnection.orderSyncConfig as unknown as OrderSyncConfig;
      const accessToken = await this.googleSheetsService['oauth2Service'].getAccessToken(connectionId);

      // Group updates by row for batch processing
      const batchUpdates: any[] = [];

      for (const update of orderUpdates) {
        const updates: any[] = [];

        // Update Order ID column
        if (config.columnMapping.orderId) {
          const orderIdRange = `${config.sheetName}!${config.columnMapping.orderId}${update.rowNumber}`;
          updates.push({
            range: orderIdRange,
            values: [[update.orderId]],
          });
        }

        // Update Status column if configured and status provided
        if (config.columnMapping.status && update.status) {
          const statusRange = `${config.sheetName}!${config.columnMapping.status}${update.rowNumber}`;
          updates.push({
            range: statusRange,
            values: [[update.status]],
          });
        }

        // Update Error Message column if configured and error provided
        if (config.columnMapping.errorMessage && update.errorMessage) {
          const errorRange = `${config.sheetName}!${config.columnMapping.errorMessage}${update.rowNumber}`;
          updates.push({
            range: errorRange,
            values: [[update.errorMessage]],
          });
        }

        batchUpdates.push(...updates);
      }

      // Execute batch update if there are updates to make
      if (batchUpdates.length > 0) {
        // Use batch update for efficiency
        const batchUpdateRequest = {
          valueInputOption: 'USER_ENTERED',
          data: batchUpdates,
        };

        await this.executeBatchUpdate(accessToken, spreadsheetId, batchUpdateRequest);

        this.logger.log('Successfully updated sheet with order IDs', {
          connectionId,
          spreadsheetId,
          updatesCount: orderUpdates.length,
          batchUpdatesCount: batchUpdates.length,
        });
      }
    } catch (error) {
      this.logger.error('Failed to update sheet with order IDs', {
        error: error.message,
        connectionId,
        spreadsheetId,
        updatesCount: orderUpdates.length,
      });

      // Handle specific Google Sheets API errors
      if (error.message.includes('quota')) {
        throw new BadRequestException('Google Sheets API quota exceeded. Please try again later.');
      }
      if (error.message.includes('rate limit')) {
        throw new BadRequestException('Rate limit exceeded. Please wait before trying again.');
      }

      throw error;
    }
  }

  /**
   * Validate sheet structure to ensure proper column setup
   */
  async validateSheetStructure(
    connectionId: string,
    spreadsheetId: string,
    sheetName?: string,
  ): Promise<ValidationResult> {
    try {
      this.logger.log('Validating sheet structure', {
        connectionId,
        spreadsheetId,
        sheetName,
      });

      // Get spreadsheet connection and config
      const spreadsheetConnection = await this.prismaService.spreadsheetConnection.findFirst({
        where: {
          connectionId,
          spreadsheetId,
        },
      });

      if (!spreadsheetConnection) {
        throw new NotFoundException('Spreadsheet connection not found');
      }

      const config = spreadsheetConnection.orderSyncConfig as unknown as OrderSyncConfig;
      const targetSheetName = sheetName || config.sheetName;
      const accessToken = await this.googleSheetsService['oauth2Service'].getAccessToken(connectionId);

      // Get spreadsheet information
      const spreadsheet = await this.googleSheetsService.getSpreadsheet(accessToken, spreadsheetId);
      const sheet = spreadsheet.sheets.find(s => s.properties.title === targetSheetName);

      const errors: ValidationError[] = [];
      const warnings: ValidationWarning[] = [];

      // Check if sheet exists
      if (!sheet) {
        errors.push({
          field: 'sheetName',
          message: `Sheet "${targetSheetName}" not found in spreadsheet`,
          code: 'SHEET_NOT_FOUND',
          value: targetSheetName,
          suggestedFix: `Create a sheet named "${targetSheetName}" or update the configuration`,
        });
        return { isValid: false, errors, warnings };
      }

      // Check sheet dimensions
      const rowCount = sheet.properties.gridProperties.rowCount;
      const columnCount = sheet.properties.gridProperties.columnCount;

      if (rowCount < config.dataStartRow) {
        errors.push({
          field: 'dataStartRow',
          message: `Sheet has only ${rowCount} rows, but data start row is set to ${config.dataStartRow}`,
          code: 'INSUFFICIENT_ROWS',
          value: config.dataStartRow,
          suggestedFix: `Add more rows to the sheet or adjust the data start row`,
        });
      }

      // Read header row to validate column mapping
      if (config.headerRow <= rowCount) {
        try {
          const headerRange = `${targetSheetName}!A${config.headerRow}:Z${config.headerRow}`;
          const headerValues = await this.googleSheetsService.getSpreadsheetValues(
            accessToken,
            spreadsheetId,
            headerRange,
            'FORMATTED_VALUE',
          );

          if (headerValues && headerValues.length > 0) {
            const headers = headerValues[0];
            this.validateColumnMapping(config, headers, errors, warnings);
          } else {
            warnings.push({
              field: 'headerRow',
              message: `No headers found in row ${config.headerRow}`,
              code: 'NO_HEADERS',
              value: config.headerRow,
              suggestion: 'Add column headers to help identify the correct columns',
            });
          }
        } catch (headerError) {
          warnings.push({
            field: 'headerRow',
            message: `Could not read header row: ${headerError.message}`,
            code: 'HEADER_READ_ERROR',
            value: config.headerRow,
          });
        }
      }

      // Check for required columns
      this.validateRequiredColumns(config, errors);

      const isValid = errors.length === 0;

      this.logger.log('Sheet structure validation completed', {
        connectionId,
        spreadsheetId,
        sheetName: targetSheetName,
        isValid,
        errorsCount: errors.length,
        warningsCount: warnings.length,
      });

      return {
        isValid,
        errors,
        warnings,
      };
    } catch (error) {
      this.logger.error('Failed to validate sheet structure', {
        error: error.message,
        connectionId,
        spreadsheetId,
        sheetName,
      });

      return {
        isValid: false,
        errors: [{
          field: 'system',
          message: `Validation failed: ${error.message}`,
          code: 'VALIDATION_ERROR',
        }],
        warnings: [],
      };
    }
  }

  /**
   * Parse a sheet row into a SheetOrder object
   */
  private parseSheetRow(row: any[], rowNumber: number, config: OrderSyncConfig): SheetOrder | null {
    try {
      // Skip empty rows
      if (!row || row.every(cell => !cell || cell.toString().trim() === '')) {
        return null;
      }

      const getColumnValue = (columnLetter: string): string => {
        const columnIndex = this.columnLetterToIndex(columnLetter);
        return row[columnIndex]?.toString()?.trim() || '';
      };

      const order: SheetOrder = {
        rowNumber,
        orderId: getColumnValue(config.columnMapping.orderId),
        date: getColumnValue(config.columnMapping.date),
        customerName: getColumnValue(config.columnMapping.customerName),
        phone: getColumnValue(config.columnMapping.phone),
        address: getColumnValue(config.columnMapping.address),
        city: getColumnValue(config.columnMapping.city),
        productName: getColumnValue(config.columnMapping.productName),
        productQuantity: parseInt(getColumnValue(config.columnMapping.productQuantity)) || 1,
        price: parseFloat(getColumnValue(config.columnMapping.price)) || 0,
      };

      // Add optional fields if configured
      if (config.columnMapping.alternatePhone) {
        order.alternatePhone = getColumnValue(config.columnMapping.alternatePhone);
      }
      if (config.columnMapping.email) {
        order.email = getColumnValue(config.columnMapping.email);
      }
      if (config.columnMapping.postalCode) {
        order.postalCode = getColumnValue(config.columnMapping.postalCode);
      }
      if (config.columnMapping.productSku) {
        order.productSku = getColumnValue(config.columnMapping.productSku);
      }
      if (config.columnMapping.productVariant) {
        order.productVariant = getColumnValue(config.columnMapping.productVariant);
      }
      if (config.columnMapping.pageUrl) {
        order.pageUrl = getColumnValue(config.columnMapping.pageUrl);
      }
      if (config.columnMapping.notes) {
        order.notes = getColumnValue(config.columnMapping.notes);
      }
      if (config.columnMapping.status) {
        order.status = getColumnValue(config.columnMapping.status);
      }
      if (config.columnMapping.errorMessage) {
        order.errorMessage = getColumnValue(config.columnMapping.errorMessage);
      }

      return order;
    } catch (error) {
      throw new Error(`Failed to parse row ${rowNumber}: ${error.message}`);
    }
  }

  /**
   * Convert column letter to index (A=0, B=1, etc.)
   */
  private columnLetterToIndex(letter: string): number {
    let result = 0;
    for (let i = 0; i < letter.length; i++) {
      result = result * 26 + (letter.charCodeAt(i) - 'A'.charCodeAt(0) + 1);
    }
    return result - 1;
  }

  /**
   * Get the last row with data in a sheet
   */
  private async getLastRowWithData(
    accessToken: string,
    spreadsheetId: string,
    sheetName: string,
  ): Promise<number> {
    try {
      // Read a large range to find the last row with data
      const range = `${sheetName}!A:A`;
      const values = await this.googleSheetsService.getSpreadsheetValues(
        accessToken,
        spreadsheetId,
        range,
        'FORMATTED_VALUE',
      );

      if (!values || values.length === 0) {
        return 1; // Return 1 if no data found
      }

      // Find the last non-empty row
      for (let i = values.length - 1; i >= 0; i--) {
        if (values[i] && values[i][0] && values[i][0].toString().trim() !== '') {
          return i + 1; // Convert to 1-based indexing
        }
      }

      return 1;
    } catch (error) {
      this.logger.warn('Failed to determine last row with data, using default', {
        error: error.message,
        sheetName,
      });
      return 1000; // Default fallback
    }
  }

  /**
   * Execute batch update with retry logic for rate limiting
   */
  private async executeBatchUpdate(
    accessToken: string,
    spreadsheetId: string,
    batchUpdateRequest: any,
    retryCount: number = 0,
  ): Promise<void> {
    const maxRetries = 3;
    const baseDelay = 1000; // 1 second

    try {
      const response = await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchUpdate`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(batchUpdateRequest),
        },
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        
        // Handle rate limiting
        if (response.status === 429 && retryCount < maxRetries) {
          const delay = baseDelay * Math.pow(2, retryCount);
          this.logger.warn('Rate limited, retrying after delay', {
            retryCount,
            delay,
            spreadsheetId,
          });
          
          await new Promise(resolve => setTimeout(resolve, delay));
          return this.executeBatchUpdate(accessToken, spreadsheetId, batchUpdateRequest, retryCount + 1);
        }

        throw new Error(`Batch update failed: ${response.status} ${response.statusText} - ${JSON.stringify(errorData)}`);
      }

      const result = await response.json();
      this.logger.log('Batch update completed successfully', {
        spreadsheetId,
        updatedCells: result.totalUpdatedCells,
        updatedRows: result.totalUpdatedRows,
      });
    } catch (error) {
      if (retryCount < maxRetries && (error.message.includes('rate limit') || error.message.includes('quota'))) {
        const delay = baseDelay * Math.pow(2, retryCount);
        this.logger.warn('Batch update failed, retrying after delay', {
          error: error.message,
          retryCount,
          delay,
        });
        
        await new Promise(resolve => setTimeout(resolve, delay));
        return this.executeBatchUpdate(accessToken, spreadsheetId, batchUpdateRequest, retryCount + 1);
      }

      throw error;
    }
  }

  /**
   * Validate column mapping against actual headers
   */
  private validateColumnMapping(
    config: OrderSyncConfig,
    headers: string[],
    errors: ValidationError[],
    warnings: ValidationWarning[],
  ): void {
    const requiredMappings = [
      { key: 'customerName', name: 'Customer Name' },
      { key: 'phone', name: 'Phone' },
      { key: 'address', name: 'Address' },
      { key: 'city', name: 'City' },
      { key: 'productName', name: 'Product Name' },
      { key: 'price', name: 'Price' },
    ];

    for (const mapping of requiredMappings) {
      const columnLetter = config.columnMapping[mapping.key as keyof typeof config.columnMapping];
      if (columnLetter) {
        const columnIndex = this.columnLetterToIndex(columnLetter);
        const headerValue = headers[columnIndex]?.toString()?.trim();

        if (!headerValue) {
          warnings.push({
            field: mapping.key,
            message: `Column ${columnLetter} (${mapping.name}) appears to be empty`,
            code: 'EMPTY_HEADER',
            value: columnLetter,
            suggestion: `Add a header for ${mapping.name} in column ${columnLetter}`,
          });
        }
      }
    }
  }

  /**
   * Validate required columns are configured
   */
  private validateRequiredColumns(config: OrderSyncConfig, errors: ValidationError[]): void {
    const requiredColumns = [
      { key: 'customerName', name: 'Customer Name' },
      { key: 'phone', name: 'Phone' },
      { key: 'address', name: 'Address' },
      { key: 'city', name: 'City' },
      { key: 'productName', name: 'Product Name' },
      { key: 'price', name: 'Price' },
    ];

    for (const column of requiredColumns) {
      const columnMapping = config.columnMapping[column.key as keyof typeof config.columnMapping];
      if (!columnMapping) {
        errors.push({
          field: column.key,
          message: `Required column mapping missing: ${column.name}`,
          code: 'MISSING_COLUMN_MAPPING',
          suggestedFix: `Configure column mapping for ${column.name}`,
        });
      }
    }
  }

  /**
   * Perform the actual sync operation using OrderSyncService
   */
  private async performSync(
    operationId: string,
    options: TriggerManualSyncDto,
  ): Promise<void> {
    try {
      // Get the sync operation details
      const syncOperation = await this.prismaService.syncOperation.findUnique({
        where: { id: operationId },
      });

      if (!syncOperation) {
        throw new Error('Sync operation not found');
      }

      // Use OrderSyncService for actual order creation
      await this.performSyncWithOrderService(syncOperation, options);

    } catch (error) {
      this.logger.error('Sync operation failed', {
        operationId,
        error: error.message,
      });

      // Update operation as failed
      await this.prismaService.syncOperation.update({
        where: { id: operationId },
        data: {
          status: 'failed',
          completedAt: new Date(),
          errorCount: 1,
          errorDetails: [{
            rowNumber: 0,
            errorType: 'system',
            errorMessage: error.message,
            orderData: {},
          }],
        },
      });
    }
  }

  /**
   * Basic sync implementation (fallback when OrderSyncService is not available)
   */
  private async performBasicSync(
    syncOperation: any,
    options: TriggerManualSyncDto,
  ): Promise<void> {
    // Update operation status to processing
    await this.prismaService.syncOperation.update({
      where: { id: syncOperation.id },
      data: { status: 'processing' },
    });

    // Read orders from the sheet
    const orders = await this.getOrdersFromSheet(
      syncOperation.connectionId,
      syncOperation.spreadsheetId,
      options.startRow,
      options.endRow,
    );

    let ordersProcessed = 0;
    let ordersCreated = 0;
    let ordersSkipped = 0;
    let errorCount = 0;
    const errors: SyncError[] = [];

    // Process each order with basic validation
    for (const order of orders) {
      try {
        ordersProcessed++;

        // Basic validation
        if (!order.customerName?.trim() || !order.phone?.trim() || !order.productName?.trim() || order.price <= 0) {
          ordersSkipped++;
          errorCount++;
          errors.push({
            rowNumber: order.rowNumber,
            errorType: 'validation',
            errorMessage: 'Missing required fields or invalid data',
            orderData: order,
          });
          continue;
        }

        // Skip if order already has an ID
        if (order.orderId && !options.forceResync) {
          ordersSkipped++;
          continue;
        }

        // For now, just mark as processed (actual order creation will be implemented with OrderSyncService)
        ordersCreated++;

      } catch (orderError) {
        errorCount++;
        errors.push({
          rowNumber: order.rowNumber,
          errorType: 'system',
          errorMessage: orderError.message,
          orderData: order,
        });
      }
    }

    // Update operation as completed
    await this.prismaService.syncOperation.update({
      where: { id: syncOperation.id },
      data: {
        status: 'completed',
        completedAt: new Date(),
        ordersProcessed,
        ordersCreated,
        ordersSkipped,
        errorCount,
        errorDetails: errors as any,
      },
    });

    this.logger.log('Basic sync operation completed', {
      operationId: syncOperation.id,
      ordersProcessed,
      ordersCreated,
      ordersSkipped,
      errorCount,
    });
  }

  /**
   * Perform sync using OrderSyncService
   */
  private async performSyncWithOrderService(
    syncOperation: any,
    options: TriggerManualSyncDto,
  ): Promise<void> {
    // Import OrderSyncService dynamically to avoid circular dependency
    const { OrderSyncService } = await import('./order-sync.service');
    const { OrderValidationService } = await import('./order-validation.service');
    const { ValidationFeedbackService } = await import('./validation-feedback.service');
    const { ValidationService } = await import('../../../common/validation/validation.service');
    const { SanitizationService } = await import('../../../common/validation/sanitization.service');
    
    const validationService = new ValidationService(null as any);
    const sanitizationService = new SanitizationService(null as any);
    const orderValidationService = new OrderValidationService(
      this.prismaService,
      validationService,
      sanitizationService,
    );
    const validationFeedbackService = new ValidationFeedbackService();
    
    const orderSyncService = new OrderSyncService(
      this.prismaService,
      this.googleSheetsService,
      orderValidationService,
      validationFeedbackService,
    );

    // Use OrderSyncService to perform the sync
    await orderSyncService.syncOrdersFromSheet(
      syncOperation.connectionId,
      syncOperation.spreadsheetId,
      syncOperation.id,
      {
        startRow: options.startRow,
        endRow: options.endRow,
        forceResync: options.forceResync,
        batchOptions: options.batchOptions,
      },
    );
  }


}