import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../../common/database/prisma.service';
import { ConnectionStatus, PlatformType } from '@prisma/client';

export interface SpreadsheetConnectionData {
  id: string;
  connectionId: string;
  spreadsheetId: string;
  spreadsheetName: string;
  webViewLink?: string;
  connectedAt: Date;
  lastAccessedAt?: Date;
  isActive: boolean;
  sheetsData?: any;
  permissions?: any;
  lastSyncAt?: Date;
  syncCount: number;
  lastErrorAt?: Date;
  lastErrorMessage?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface SpreadsheetSheet {
  id: number;
  name: string;
  index: number;
  rowCount: number;
  columnCount: number;
  gridProperties?: {
    frozenRowCount?: number;
    frozenColumnCount?: number;
  };
}

export interface SpreadsheetPermissions {
  canEdit: boolean;
  canShare: boolean;
  canComment: boolean;
  role: 'owner' | 'editor' | 'commenter' | 'viewer';
}

export interface CreateSpreadsheetConnectionRequest {
  connectionId: string;
  spreadsheetId: string;
  spreadsheetName: string;
  webViewLink?: string;
  sheets?: SpreadsheetSheet[];
  permissions?: SpreadsheetPermissions;
}

@Injectable()
export class SpreadsheetConnectionService {
  private readonly logger = new Logger(SpreadsheetConnectionService.name);

  constructor(
    private readonly prismaService: PrismaService,
  ) {}

  /**
   * Connect to a new spreadsheet
   */
  async connectSpreadsheet(request: CreateSpreadsheetConnectionRequest): Promise<SpreadsheetConnectionData> {
    try {
      this.logger.log('Connecting to spreadsheet', {
        connectionId: request.connectionId,
        spreadsheetId: request.spreadsheetId,
        spreadsheetName: request.spreadsheetName,
      });

      // Verify the platform connection exists and is active
      const platformConnection = await this.prismaService.platformConnection.findUnique({
        where: { id: request.connectionId },
      });

      if (!platformConnection) {
        throw new NotFoundException('Platform connection not found');
      }

      if (platformConnection.status !== ConnectionStatus.ACTIVE) {
        throw new BadRequestException('Platform connection is not active');
      }

      if (platformConnection.platformType !== PlatformType.GOOGLE_SHEETS) {
        throw new BadRequestException('Connection is not a Google Sheets connection');
      }

      // Check if spreadsheet is already connected
      const existingConnection = await this.prismaService.spreadsheetConnection.findUnique({
        where: {
          connectionId_spreadsheetId: {
            connectionId: request.connectionId,
            spreadsheetId: request.spreadsheetId,
          },
        },
      });

      if (existingConnection) {
        if (existingConnection.isActive) {
          // Update the existing connection with fresh data and return it
          const updated = await this.prismaService.spreadsheetConnection.update({
            where: { id: existingConnection.id },
            data: {
              spreadsheetName: request.spreadsheetName,
              webViewLink: request.webViewLink,
              sheetsData: (request.sheets || existingConnection.sheetsData) as any,
              permissions: (request.permissions || existingConnection.permissions) as any,
              lastAccessedAt: new Date(),
              lastErrorAt: null,
              lastErrorMessage: null,
              updatedAt: new Date(),
            },
          });

          this.logger.log('Updated existing active spreadsheet connection', {
            connectionId: request.connectionId,
            spreadsheetId: request.spreadsheetId,
            spreadsheetConnectionId: updated.id,
          });

          return this.mapToSpreadsheetConnectionData(updated);
        } else {
          // Reactivate existing connection
          const reactivated = await this.prismaService.spreadsheetConnection.update({
            where: { id: existingConnection.id },
            data: {
              isActive: true,
              spreadsheetName: request.spreadsheetName,
              webViewLink: request.webViewLink,
              sheetsData: (request.sheets || existingConnection.sheetsData) as any,
              permissions: (request.permissions || existingConnection.permissions) as any,
              connectedAt: new Date(),
              lastErrorAt: null,
              lastErrorMessage: null,
              updatedAt: new Date(),
            },
          });

          this.logger.log('Reactivated existing spreadsheet connection', {
            connectionId: request.connectionId,
            spreadsheetId: request.spreadsheetId,
            spreadsheetConnectionId: reactivated.id,
          });

          return this.mapToSpreadsheetConnectionData(reactivated);
        }
      }

      // Create new spreadsheet connection
      const spreadsheetConnection = await this.prismaService.spreadsheetConnection.create({
        data: {
          connectionId: request.connectionId,
          spreadsheetId: request.spreadsheetId,
          spreadsheetName: request.spreadsheetName,
          webViewLink: request.webViewLink || `https://docs.google.com/spreadsheets/d/${request.spreadsheetId}`,
          isActive: true,
          sheetsData: request.sheets as any,
          permissions: (request.permissions || {
            canEdit: true,
            canShare: false,
            canComment: true,
            role: 'editor',
          }) as any,
          syncCount: 0,
        },
      });

      // Update platform connection's connected spreadsheets count
      await this.updateConnectedSpreadsheetsCount(request.connectionId);

      this.logger.log('Successfully connected to spreadsheet', {
        connectionId: request.connectionId,
        spreadsheetId: request.spreadsheetId,
        spreadsheetConnectionId: spreadsheetConnection.id,
      });

      return this.mapToSpreadsheetConnectionData(spreadsheetConnection);
    } catch (error) {
      this.logger.error('Failed to connect to spreadsheet', {
        error: error.message,
        connectionId: request.connectionId,
        spreadsheetId: request.spreadsheetId,
      });
      throw error;
    }
  }

  /**
   * Disconnect from a spreadsheet
   */
  async disconnectSpreadsheet(connectionId: string, spreadsheetId: string): Promise<void> {
    try {
      this.logger.log('Disconnecting from spreadsheet', {
        connectionId,
        spreadsheetId,
      });

      const spreadsheetConnection = await this.prismaService.spreadsheetConnection.findUnique({
        where: {
          connectionId_spreadsheetId: {
            connectionId,
            spreadsheetId,
          },
        },
      });

      if (!spreadsheetConnection) {
        throw new NotFoundException('Spreadsheet connection not found');
      }

      // Mark as inactive instead of deleting to preserve history
      await this.prismaService.spreadsheetConnection.update({
        where: { id: spreadsheetConnection.id },
        data: {
          isActive: false,
          updatedAt: new Date(),
        },
      });

      // Update platform connection's connected spreadsheets count
      await this.updateConnectedSpreadsheetsCount(connectionId);

      this.logger.log('Successfully disconnected from spreadsheet', {
        connectionId,
        spreadsheetId,
        spreadsheetConnectionId: spreadsheetConnection.id,
      });
    } catch (error) {
      this.logger.error('Failed to disconnect from spreadsheet', {
        error: error.message,
        connectionId,
        spreadsheetId,
      });
      throw error;
    }
  }

  /**
   * List all connected spreadsheets for a connection with pagination and caching
   */
  async listConnectedSpreadsheets(
    connectionId: string,
    includeInactive: boolean = false,
    page: number = 1,
    limit: number = 50,
  ): Promise<{
    spreadsheets: SpreadsheetConnectionData[];
    total: number;
    hasMore: boolean;
    page: number;
    limit: number;
  }> {
    try {
      this.logger.log('Listing connected spreadsheets with pagination', {
        connectionId,
        includeInactive,
        page,
        limit,
      });

      const whereClause: any = { connectionId };
      if (!includeInactive) {
        whereClause.isActive = true;
      }

      // Calculate pagination
      const skip = (page - 1) * limit;
      const take = Math.min(limit, 100); // Max 100 items per page

      // Get total count and paginated results in parallel
      const [total, spreadsheetConnections] = await Promise.all([
        this.prismaService.spreadsheetConnection.count({ where: whereClause }),
        this.prismaService.spreadsheetConnection.findMany({
          where: whereClause,
          skip,
          take,
          orderBy: [
            { isActive: 'desc' },
            { lastAccessedAt: 'desc' },
            { connectedAt: 'desc' },
          ],
          // Only select necessary fields for performance
          select: {
            id: true,
            connectionId: true,
            spreadsheetId: true,
            spreadsheetName: true,
            webViewLink: true,
            connectedAt: true,
            lastAccessedAt: true,
            isActive: true,
            sheetsData: true,
            permissions: true,
            lastSyncAt: true,
            syncCount: true,
            lastErrorAt: true,
            lastErrorMessage: true,
            createdAt: true,
            updatedAt: true,
          },
        }),
      ]);

      const result = spreadsheetConnections.map(conn => this.mapToSpreadsheetConnectionData(conn));
      const hasMore = skip + take < total;

      this.logger.log('Retrieved connected spreadsheets with pagination', {
        connectionId,
        page,
        limit,
        total,
        returned: result.length,
        hasMore,
        activeCount: result.filter(c => c.isActive).length,
      });

      return {
        spreadsheets: result,
        total,
        hasMore,
        page,
        limit,
      };
    } catch (error) {
      this.logger.error('Failed to list connected spreadsheets', {
        error: error.message,
        connectionId,
      });
      throw error;
    }
  }

  /**
   * Get a specific spreadsheet connection
   */
  async getSpreadsheetConnection(
    connectionId: string,
    spreadsheetId: string,
  ): Promise<SpreadsheetConnectionData> {
    try {
      this.logger.log('Getting spreadsheet connection', {
        connectionId,
        spreadsheetId,
      });

      const spreadsheetConnection = await this.prismaService.spreadsheetConnection.findUnique({
        where: {
          connectionId_spreadsheetId: {
            connectionId,
            spreadsheetId,
          },
        },
      });

      if (!spreadsheetConnection) {
        throw new NotFoundException('Spreadsheet connection not found');
      }

      // Update last accessed time
      await this.prismaService.spreadsheetConnection.update({
        where: { id: spreadsheetConnection.id },
        data: {
          lastAccessedAt: new Date(),
        },
      });

      return this.mapToSpreadsheetConnectionData(spreadsheetConnection);
    } catch (error) {
      this.logger.error('Failed to get spreadsheet connection', {
        error: error.message,
        connectionId,
        spreadsheetId,
      });
      throw error;
    }
  }

  /**
   * Update spreadsheet connection metadata
   */
  async updateSpreadsheetConnection(
    connectionId: string,
    spreadsheetId: string,
    updates: {
      spreadsheetName?: string;
      webViewLink?: string;
      sheets?: SpreadsheetSheet[];
      permissions?: SpreadsheetPermissions;
      lastSyncAt?: Date;
      lastErrorAt?: Date;
      lastErrorMessage?: string;
    },
  ): Promise<SpreadsheetConnectionData> {
    try {
      this.logger.log('Updating spreadsheet connection', {
        connectionId,
        spreadsheetId,
        updates: Object.keys(updates),
      });

      const spreadsheetConnection = await this.prismaService.spreadsheetConnection.findUnique({
        where: {
          connectionId_spreadsheetId: {
            connectionId,
            spreadsheetId,
          },
        },
      });

      if (!spreadsheetConnection) {
        throw new NotFoundException('Spreadsheet connection not found');
      }

      const updated = await this.prismaService.spreadsheetConnection.update({
        where: { id: spreadsheetConnection.id },
        data: {
          spreadsheetName: updates.spreadsheetName,
          webViewLink: updates.webViewLink,
          lastSyncAt: updates.lastSyncAt,
          lastErrorAt: updates.lastErrorAt,
          lastErrorMessage: updates.lastErrorMessage,
          sheetsData: (updates.sheets || spreadsheetConnection.sheetsData) as any,
          permissions: (updates.permissions || spreadsheetConnection.permissions) as any,
          syncCount: updates.lastSyncAt ? { increment: 1 } : undefined,
          updatedAt: new Date(),
        },
      });

      this.logger.log('Successfully updated spreadsheet connection', {
        connectionId,
        spreadsheetId,
        spreadsheetConnectionId: updated.id,
      });

      return this.mapToSpreadsheetConnectionData(updated);
    } catch (error) {
      this.logger.error('Failed to update spreadsheet connection', {
        error: error.message,
        connectionId,
        spreadsheetId,
      });
      throw error;
    }
  }

  /**
   * Refresh spreadsheet metadata from Google Sheets API
   */
  async refreshSpreadsheetInfo(
    connectionId: string,
    spreadsheetId: string,
    spreadsheetData: {
      name: string;
      sheets: SpreadsheetSheet[];
      permissions?: SpreadsheetPermissions;
      webViewLink?: string;
    },
  ): Promise<SpreadsheetConnectionData> {
    try {
      this.logger.log('Refreshing spreadsheet metadata', {
        connectionId,
        spreadsheetId,
        sheetsCount: spreadsheetData.sheets.length,
      });

      const updated = await this.updateSpreadsheetConnection(
        connectionId,
        spreadsheetId,
        {
          spreadsheetName: spreadsheetData.name,
          webViewLink: spreadsheetData.webViewLink,
          sheets: spreadsheetData.sheets,
          permissions: spreadsheetData.permissions,
          lastSyncAt: new Date(),
        },
      );

      this.logger.log('Successfully refreshed spreadsheet metadata', {
        connectionId,
        spreadsheetId,
        sheetsCount: spreadsheetData.sheets.length,
      });

      return updated;
    } catch (error) {
      this.logger.error('Failed to refresh spreadsheet metadata', {
        error: error.message,
        connectionId,
        spreadsheetId,
      });

      // Update with error information
      await this.updateSpreadsheetConnection(connectionId, spreadsheetId, {
        lastErrorAt: new Date(),
        lastErrorMessage: error.message,
      });

      throw error;
    }
  }

  /**
   * Verify spreadsheet access and update status
   */
  async verifySpreadsheetAccess(
    connectionId: string,
    spreadsheetId: string,
    isAccessible: boolean,
    errorMessage?: string,
  ): Promise<void> {
    try {
      this.logger.log('Verifying spreadsheet access', {
        connectionId,
        spreadsheetId,
        isAccessible,
      });

      const updates: any = {
        lastSyncAt: new Date(),
      };

      if (!isAccessible) {
        updates.lastErrorAt = new Date();
        updates.lastErrorMessage = errorMessage || 'Spreadsheet access verification failed';
      } else {
        updates.lastErrorAt = null;
        updates.lastErrorMessage = null;
      }

      await this.updateSpreadsheetConnection(connectionId, spreadsheetId, updates);

      this.logger.log('Updated spreadsheet access status', {
        connectionId,
        spreadsheetId,
        isAccessible,
      });
    } catch (error) {
      this.logger.error('Failed to verify spreadsheet access', {
        error: error.message,
        connectionId,
        spreadsheetId,
      });
      throw error;
    }
  }

  /**
   * Get spreadsheets that need metadata refresh
   */
  async getSpreadsheetsNeedingRefresh(
    maxAge: number = 24 * 60 * 60 * 1000, // 24 hours in milliseconds
  ): Promise<Array<{
    connectionId: string;
    spreadsheetId: string;
    spreadsheetName: string;
    lastSyncAt?: Date;
  }>> {
    try {
      const cutoffDate = new Date(Date.now() - maxAge);

      const spreadsheets = await this.prismaService.spreadsheetConnection.findMany({
        where: {
          isActive: true,
          OR: [
            { lastSyncAt: null },
            { lastSyncAt: { lt: cutoffDate } },
          ],
        },
        select: {
          connectionId: true,
          spreadsheetId: true,
          spreadsheetName: true,
          lastSyncAt: true,
        },
        orderBy: [
          { lastSyncAt: 'asc' },
          { connectedAt: 'asc' },
        ],
      });

      this.logger.log('Found spreadsheets needing refresh', {
        count: spreadsheets.length,
        maxAge: maxAge / (60 * 60 * 1000) + ' hours',
      });

      return spreadsheets;
    } catch (error) {
      this.logger.error('Failed to get spreadsheets needing refresh', {
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Get connection statistics
   */
  async getConnectionStatistics(connectionId: string): Promise<{
    totalSpreadsheets: number;
    activeSpreadsheets: number;
    inactiveSpreadsheets: number;
    lastAccessedAt?: Date;
    totalSyncCount: number;
    spreadsheetsWithErrors: number;
    lastErrorAt?: Date;
  }> {
    try {
      const [total, active, withErrors, stats] = await Promise.all([
        this.prismaService.spreadsheetConnection.count({
          where: { connectionId },
        }),
        this.prismaService.spreadsheetConnection.count({
          where: { connectionId, isActive: true },
        }),
        this.prismaService.spreadsheetConnection.count({
          where: { 
            connectionId, 
            isActive: true,
            lastErrorAt: { not: null },
          },
        }),
        this.prismaService.spreadsheetConnection.aggregate({
          where: { connectionId },
          _sum: { syncCount: true },
          _max: { 
            lastAccessedAt: true,
            lastErrorAt: true,
          },
        }),
      ]);

      return {
        totalSpreadsheets: total,
        activeSpreadsheets: active,
        inactiveSpreadsheets: total - active,
        lastAccessedAt: stats._max.lastAccessedAt,
        totalSyncCount: stats._sum.syncCount || 0,
        spreadsheetsWithErrors: withErrors,
        lastErrorAt: stats._max.lastErrorAt,
      };
    } catch (error) {
      this.logger.error('Failed to get connection statistics', {
        error: error.message,
        connectionId,
      });
      throw error;
    }
  }

  /**
   * Batch update multiple spreadsheet connections
   */
  async batchUpdateSpreadsheets(
    updates: Array<{
      connectionId: string;
      spreadsheetId: string;
      data: {
        spreadsheetName?: string;
        sheets?: SpreadsheetSheet[];
        permissions?: SpreadsheetPermissions;
        isAccessible?: boolean;
        errorMessage?: string;
      };
    }>,
  ): Promise<void> {
    try {
      this.logger.log('Batch updating spreadsheet connections', {
        count: updates.length,
      });

      const updatePromises = updates.map(async (update) => {
        const updateData: any = {
          lastSyncAt: new Date(),
        };

        if (update.data.spreadsheetName) {
          updateData.spreadsheetName = update.data.spreadsheetName;
        }

        if (update.data.sheets) {
          updateData.sheets = update.data.sheets;
        }

        if (update.data.permissions) {
          updateData.permissions = update.data.permissions;
        }

        if (update.data.isAccessible === false) {
          updateData.lastErrorAt = new Date();
          updateData.lastErrorMessage = update.data.errorMessage || 'Access verification failed';
        } else if (update.data.isAccessible === true) {
          updateData.lastErrorAt = null;
          updateData.lastErrorMessage = null;
        }

        return this.updateSpreadsheetConnection(
          update.connectionId,
          update.spreadsheetId,
          updateData,
        );
      });

      await Promise.allSettled(updatePromises);

      this.logger.log('Completed batch update of spreadsheet connections', {
        count: updates.length,
      });
    } catch (error) {
      this.logger.error('Failed to batch update spreadsheet connections', {
        error: error.message,
        count: updates.length,
      });
      throw error;
    }
  }

  /**
   * Update the connected spreadsheets count in platform connection
   */
  private async updateConnectedSpreadsheetsCount(connectionId: string): Promise<void> {
    try {
      const activeCount = await this.prismaService.spreadsheetConnection.count({
        where: { connectionId, isActive: true },
      });

      // Get current platform data and update it
      const connection = await this.prismaService.platformConnection.findUnique({
        where: { id: connectionId },
        select: { platformData: true },
      });

      const currentPlatformData = (connection?.platformData as any) || {};
      const updatedPlatformData = {
        ...currentPlatformData,
        connected_spreadsheets_count: activeCount,
      };

      await this.prismaService.platformConnection.update({
        where: { id: connectionId },
        data: {
          platformData: updatedPlatformData,
        },
      });
    } catch (error) {
      this.logger.warn('Failed to update connected spreadsheets count', {
        error: error.message,
        connectionId,
      });
      // Don't throw error as this is not critical
    }
  }

  /**
   * Map database record to SpreadsheetConnectionData
   */
  private mapToSpreadsheetConnectionData(record: any): SpreadsheetConnectionData {
    return {
      id: record.id,
      connectionId: record.connectionId,
      spreadsheetId: record.spreadsheetId,
      spreadsheetName: record.spreadsheetName,
      webViewLink: record.webViewLink,
      connectedAt: record.connectedAt,
      lastAccessedAt: record.lastAccessedAt,
      isActive: record.isActive,
      sheetsData: record.sheetsData,
      permissions: record.permissions,
      lastSyncAt: record.lastSyncAt,
      syncCount: record.syncCount,
      lastErrorAt: record.lastErrorAt,
      lastErrorMessage: record.lastErrorMessage,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    };
  }
}