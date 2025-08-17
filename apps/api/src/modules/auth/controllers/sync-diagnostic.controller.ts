import {
  Controller,
  Post,
  Get,
  Param,
  Body,
  UseGuards,
  Logger,
  BadRequestException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { Roles } from '../../../common/decorators/roles.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { UserRole } from '@prisma/client';
import { PrismaService } from '../../../common/database/prisma.service';
import { GoogleSheetsOrderService } from '../services/google-sheets-order.service';
import { OrderSyncService } from '../services/order-sync.service';
import { QueueIntegrationService } from '../../queue-integration/services/queue-integration.service';

@ApiTags('Sync Diagnostics')
@Controller('auth/oauth2/google-sheets/diagnostics')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class SyncDiagnosticController {
  private readonly logger = new Logger(SyncDiagnosticController.name);

  constructor(
    private readonly prismaService: PrismaService,
    private readonly googleSheetsOrderService: GoogleSheetsOrderService,
    private readonly orderSyncService: OrderSyncService,
    private readonly queueIntegrationService: QueueIntegrationService,
  ) {}

  @Post('connections/:id/test-sync-pipeline')
  @ApiOperation({
    summary: 'Test complete sync pipeline',
    description: 'Test the entire sync pipeline from API call to database insertion',
  })
  @ApiParam({ name: 'id', description: 'Connection ID' })
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.TEAM_LEADER, UserRole.CLIENT_ADMIN)
  async testSyncPipeline(
    @Param('id') connectionId: string,
    @Body() dto: { spreadsheetId: string; bypassQueue?: boolean },
    @CurrentUser() user: any,
  ): Promise<{
    success: boolean;
    steps: Array<{
      step: string;
      status: 'success' | 'failed' | 'skipped';
      message: string;
      data?: any;
      error?: string;
      duration?: number;
    }>;
    summary: {
      totalSteps: number;
      successfulSteps: number;
      failedSteps: number;
      totalDuration: number;
    };
  }> {
    const startTime = Date.now();
    const steps: any[] = [];
    let successfulSteps = 0;
    let failedSteps = 0;

    const addStep = (step: string, status: 'success' | 'failed' | 'skipped', message: string, data?: any, error?: string, stepStartTime?: number) => {
      const stepData = {
        step,
        status,
        message,
        data,
        error,
        duration: stepStartTime ? Date.now() - stepStartTime : undefined,
      };
      steps.push(stepData);
      
      if (status === 'success') successfulSteps++;
      if (status === 'failed') failedSteps++;
      
      this.logger.log(`Step ${steps.length}: ${step} - ${status}`, { message, data, error });
    };

    try {
      // Step 1: Validate connection
      let stepStart = Date.now();
      try {
        const connection = await this.prismaService.platformConnection.findFirst({
          where: {
            id: connectionId,
            organizationId: user.organizationId,
            status: 'ACTIVE',
          },
        });

        if (!connection) {
          throw new Error('Connection not found or not active');
        }

        addStep('validate_connection', 'success', 'Connection validated successfully', {
          connectionId: connection.id,
          platformType: connection.platformType,
          status: connection.status,
        }, undefined, stepStart);
      } catch (error) {
        addStep('validate_connection', 'failed', 'Connection validation failed', undefined, error.message, stepStart);
        throw error;
      }

      // Step 2: Check spreadsheet connection
      stepStart = Date.now();
      try {
        const spreadsheetConnection = await this.prismaService.spreadsheetConnection.findFirst({
          where: {
            connectionId,
            spreadsheetId: dto.spreadsheetId,
            isOrderSync: true,
          },
        });

        if (!spreadsheetConnection) {
          throw new Error('Spreadsheet not configured for order sync');
        }

        addStep('check_spreadsheet_connection', 'success', 'Spreadsheet connection found', {
          spreadsheetId: spreadsheetConnection.spreadsheetId,
          spreadsheetName: spreadsheetConnection.spreadsheetName,
          isOrderSync: spreadsheetConnection.isOrderSync,
          lastSyncAt: spreadsheetConnection.lastSyncAt,
        }, undefined, stepStart);
      } catch (error) {
        addStep('check_spreadsheet_connection', 'failed', 'Spreadsheet connection check failed', undefined, error.message, stepStart);
        throw error;
      }

      // Step 3: Test Google Sheets API access
      stepStart = Date.now();
      try {
        const orders = await this.googleSheetsOrderService.getOrdersFromSheet(
          connectionId,
          dto.spreadsheetId,
          2, // Start from row 2
          5  // Read only 5 rows for testing
        );

        addStep('test_sheets_api', 'success', 'Google Sheets API access successful', {
          ordersFound: orders.length,
          sampleOrder: orders.length > 0 ? {
            rowNumber: orders[0].rowNumber,
            customerName: orders[0].customerName,
            phone: orders[0].phone,
            productName: orders[0].productName,
          } : null,
        }, undefined, stepStart);
      } catch (error) {
        addStep('test_sheets_api', 'failed', 'Google Sheets API access failed', undefined, error.message, stepStart);
        throw error;
      }

      // Step 4: Test sync operation creation
      stepStart = Date.now();
      try {
        const syncOperation = await this.prismaService.syncOperation.create({
          data: {
            connectionId,
            spreadsheetId: dto.spreadsheetId,
            operationType: 'manual',
            status: 'pending',
            ordersProcessed: 0,
            ordersCreated: 0,
            ordersSkipped: 0,
            errorCount: 0,
            startedAt: new Date(),
          },
        });

        addStep('create_sync_operation', 'success', 'Sync operation created', {
          operationId: syncOperation.id,
          status: syncOperation.status,
        }, undefined, stepStart);

        // Step 5: Test actual sync (if not bypassing queue)
        if (dto.bypassQueue) {
          stepStart = Date.now();
          try {
            const syncResult = await this.orderSyncService.syncOrdersFromSheet(
              connectionId,
              dto.spreadsheetId,
              syncOperation.id,
              { startRow: 2, endRow: 5 } // Test with limited rows
            );

            addStep('direct_sync_test', 'success', 'Direct sync completed', {
              ordersProcessed: syncResult.ordersProcessed,
              ordersCreated: syncResult.ordersCreated,
              ordersSkipped: syncResult.ordersSkipped,
              errors: syncResult.errors?.length || 0,
              duration: syncResult.duration,
            }, undefined, stepStart);
          } catch (error) {
            addStep('direct_sync_test', 'failed', 'Direct sync failed', undefined, error.message, stepStart);
            throw error;
          }
        } else {
          // Step 5: Test queue integration
          stepStart = Date.now();
          try {
            const jobId = await this.queueIntegrationService.triggerManualSync(
              connectionId,
              user.id,
              user.organizationId,
              dto.spreadsheetId
            );

            addStep('queue_integration_test', 'success', 'Queue job created successfully', {
              jobId,
            }, undefined, stepStart);
          } catch (error) {
            addStep('queue_integration_test', 'failed', 'Queue integration failed', undefined, error.message, stepStart);
            throw error;
          }
        }

        // Clean up test sync operation
        await this.prismaService.syncOperation.delete({
          where: { id: syncOperation.id },
        });

      } catch (error) {
        addStep('create_sync_operation', 'failed', 'Sync operation creation failed', undefined, error.message, stepStart);
        throw error;
      }

      const totalDuration = Date.now() - startTime;

      return {
        success: true,
        steps,
        summary: {
          totalSteps: steps.length,
          successfulSteps,
          failedSteps,
          totalDuration,
        },
      };

    } catch (error) {
      const totalDuration = Date.now() - startTime;

      return {
        success: false,
        steps,
        summary: {
          totalSteps: steps.length,
          successfulSteps,
          failedSteps,
          totalDuration,
        },
      };
    }
  }

  @Get('connections/:id/sync-health')
  @ApiOperation({
    summary: 'Get sync system health',
    description: 'Get overall health status of the sync system for a connection',
  })
  @ApiParam({ name: 'id', description: 'Connection ID' })
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.TEAM_LEADER, UserRole.CLIENT_ADMIN, UserRole.CLIENT_USER)
  async getSyncHealth(
    @Param('id') connectionId: string,
    @CurrentUser() user: any,
  ): Promise<{
    overall: 'healthy' | 'warning' | 'critical';
    checks: Array<{
      component: string;
      status: 'healthy' | 'warning' | 'critical';
      message: string;
      details?: any;
    }>;
    statistics: {
      totalSheets: number;
      activeSheets: number;
      totalSyncs: number;
      successfulSyncs: number;
      failedSyncs: number;
      lastSyncAt?: Date;
    };
  }> {
    const checks: any[] = [];
    let overallStatus: 'healthy' | 'warning' | 'critical' = 'healthy';

    // Check 1: Connection status
    const connection = await this.prismaService.platformConnection.findFirst({
      where: {
        id: connectionId,
        organizationId: user.organizationId,
      },
    });

    if (!connection) {
      checks.push({
        component: 'connection',
        status: 'critical',
        message: 'Connection not found',
      });
      overallStatus = 'critical';
    } else if (connection.status !== 'ACTIVE') {
      checks.push({
        component: 'connection',
        status: 'critical',
        message: `Connection status is ${connection.status}`,
        details: { status: connection.status },
      });
      overallStatus = 'critical';
    } else {
      checks.push({
        component: 'connection',
        status: 'healthy',
        message: 'Connection is active',
        details: { status: connection.status },
      });
    }

    // Check 2: Spreadsheet connections
    const spreadsheetConnections = await this.prismaService.spreadsheetConnection.findMany({
      where: {
        connectionId,
        isOrderSync: true,
      },
    });

    if (spreadsheetConnections.length === 0) {
      checks.push({
        component: 'spreadsheets',
        status: 'warning',
        message: 'No spreadsheets configured for order sync',
      });
      if (overallStatus === 'healthy') overallStatus = 'warning';
    } else {
      checks.push({
        component: 'spreadsheets',
        status: 'healthy',
        message: `${spreadsheetConnections.length} spreadsheet(s) configured for sync`,
        details: { count: spreadsheetConnections.length },
      });
    }

    // Check 3: Recent sync operations
    const recentSyncs = await this.prismaService.syncOperation.findMany({
      where: {
        connectionId,
        startedAt: {
          gte: new Date(Date.now() - 24 * 60 * 60 * 1000), // Last 24 hours
        },
      },
      orderBy: { startedAt: 'desc' },
      take: 10,
    });

    const failedSyncs = recentSyncs.filter(sync => sync.status === 'failed').length;
    const successfulSyncs = recentSyncs.filter(sync => sync.status === 'completed').length;

    if (recentSyncs.length === 0) {
      checks.push({
        component: 'recent_syncs',
        status: 'warning',
        message: 'No sync operations in the last 24 hours',
      });
      if (overallStatus === 'healthy') overallStatus = 'warning';
    } else if (failedSyncs > successfulSyncs) {
      checks.push({
        component: 'recent_syncs',
        status: 'critical',
        message: `High failure rate: ${failedSyncs}/${recentSyncs.length} syncs failed`,
        details: { total: recentSyncs.length, failed: failedSyncs, successful: successfulSyncs },
      });
      overallStatus = 'critical';
    } else if (failedSyncs > 0) {
      checks.push({
        component: 'recent_syncs',
        status: 'warning',
        message: `Some failures: ${failedSyncs}/${recentSyncs.length} syncs failed`,
        details: { total: recentSyncs.length, failed: failedSyncs, successful: successfulSyncs },
      });
      if (overallStatus === 'healthy') overallStatus = 'warning';
    } else {
      checks.push({
        component: 'recent_syncs',
        status: 'healthy',
        message: `All recent syncs successful: ${successfulSyncs}/${recentSyncs.length}`,
        details: { total: recentSyncs.length, failed: failedSyncs, successful: successfulSyncs },
      });
    }

    // Get statistics
    const allSyncs = await this.prismaService.syncOperation.findMany({
      where: { connectionId },
      orderBy: { startedAt: 'desc' },
    });

    const statistics = {
      totalSheets: spreadsheetConnections.length,
      activeSheets: spreadsheetConnections.filter(sc => sc.isActive).length,
      totalSyncs: allSyncs.length,
      successfulSyncs: allSyncs.filter(sync => sync.status === 'completed').length,
      failedSyncs: allSyncs.filter(sync => sync.status === 'failed').length,
      lastSyncAt: allSyncs.length > 0 ? allSyncs[0].startedAt : undefined,
    };

    return {
      overall: overallStatus,
      checks,
      statistics,
    };
  }
}