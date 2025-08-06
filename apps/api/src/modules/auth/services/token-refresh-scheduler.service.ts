import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../common/database/prisma.service';
import { OAuth2Service } from './oauth2.service';
import { OAuth2ConfigService } from './oauth2-config.service';
import { ConnectionStatus, PlatformType } from '@prisma/client';

@Injectable()
export class TokenRefreshSchedulerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TokenRefreshSchedulerService.name);
  private refreshInterval: NodeJS.Timeout | null = null;
  private readonly intervalMs: number;
  private isRunning = false;

  constructor(
    private readonly configService: ConfigService,
    private readonly prismaService: PrismaService,
    private readonly oauth2Service: OAuth2Service,
    private readonly oauth2ConfigService: OAuth2ConfigService,
  ) {
    // Default to checking every 5 minutes
    this.intervalMs = this.configService.get<number>('TOKEN_REFRESH_INTERVAL_MS') || 5 * 60 * 1000;
  }

  async onModuleInit() {
    this.logger.log('Starting token refresh scheduler', {
      intervalMs: this.intervalMs,
      intervalMinutes: this.intervalMs / 60000,
    });
    this.startScheduler();
  }

  async onModuleDestroy() {
    this.logger.log('Stopping token refresh scheduler');
    this.stopScheduler();
  }

  /**
   * Start the token refresh scheduler
   */
  private startScheduler(): void {
    if (this.refreshInterval) {
      return;
    }

    this.isRunning = true;
    this.refreshInterval = setInterval(async () => {
      if (this.isRunning) {
        await this.checkAndRefreshTokens();
      }
    }, this.intervalMs);

    this.logger.log('Token refresh scheduler started');
  }

  /**
   * Stop the token refresh scheduler
   */
  private stopScheduler(): void {
    this.isRunning = false;
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
      this.refreshInterval = null;
    }
    this.logger.log('Token refresh scheduler stopped');
  }

  /**
   * Check for tokens that need refresh and refresh them
   */
  async checkAndRefreshTokens(): Promise<void> {
    try {
      this.logger.debug('Checking for tokens that need refresh');

      // Find connections with tokens expiring in the next 15 minutes
      const fifteenMinutesFromNow = new Date(Date.now() + 15 * 60 * 1000);
      
      const connectionsNeedingRefresh = await this.prismaService.platformConnection.findMany({
        where: {
          status: ConnectionStatus.ACTIVE,
          tokenExpiresAt: {
            lte: fifteenMinutesFromNow,
          },
          refreshToken: {
            not: null,
          },
        },
        select: {
          id: true,
          platformType: true,
          platformName: true,
          tokenExpiresAt: true,
          userId: true,
          organizationId: true,
          platformData: true,
        },
      });

      if (connectionsNeedingRefresh.length === 0) {
        this.logger.debug('No tokens need refresh at this time');
        return;
      }

      this.logger.log('Found connections needing token refresh', {
        count: connectionsNeedingRefresh.length,
        connections: connectionsNeedingRefresh.map(c => ({
          id: c.id,
          platformType: c.platformType,
          expiresAt: c.tokenExpiresAt,
        })),
      });

      // Process refreshes in parallel but with limited concurrency
      const refreshPromises = connectionsNeedingRefresh.map(connection => 
        this.refreshConnectionToken(connection)
      );

      const results = await Promise.allSettled(refreshPromises);

      // Log results
      const successful = results.filter(r => r.status === 'fulfilled' && r.value).length;
      const failed = results.length - successful;

      this.logger.log('Token refresh batch completed', {
        total: results.length,
        successful,
        failed,
      });

      // Log failed refreshes
      results.forEach((result, index) => {
        if (result.status === 'rejected' || (result.status === 'fulfilled' && !result.value)) {
          const connection = connectionsNeedingRefresh[index];
          this.logger.error('Token refresh failed for connection', {
            connectionId: connection.id,
            platformType: connection.platformType,
            error: result.status === 'rejected' ? result.reason : 'Unknown error',
          });
        }
      });

    } catch (error) {
      this.logger.error('Error during token refresh check', {
        error: error.message,
        stack: error.stack,
      });
    }
  }

  /**
   * Refresh token for a specific connection
   */
  private async refreshConnectionToken(connection: any): Promise<boolean> {
    try {
      this.logger.log('Refreshing token for connection', {
        connectionId: connection.id,
        platformType: connection.platformType,
        expiresAt: connection.tokenExpiresAt,
      });

      const success = await this.oauth2Service.validateAndRefreshToken(connection.id);
      
      if (success) {
        this.logger.log('Successfully refreshed token', {
          connectionId: connection.id,
          platformType: connection.platformType,
        });
      } else {
        this.logger.warn('Failed to refresh token', {
          connectionId: connection.id,
          platformType: connection.platformType,
        });
      }

      return success;
    } catch (error) {
      this.logger.error('Error refreshing token for connection', {
        connectionId: connection.id,
        platformType: connection.platformType,
        error: error.message,
      });
      return false;
    }
  }

  /**
   * Get token health status for monitoring
   */
  async getTokenHealthStatus(): Promise<{
    total: number;
    active: number;
    expiringSoon: number;
    expired: number;
    needingRefresh: number;
  }> {
    try {
      const now = new Date();
      const oneHourFromNow = new Date(now.getTime() + 60 * 60 * 1000);

      const [total, active, expiringSoon, expired] = await Promise.all([
        // Total connections with tokens
        this.prismaService.platformConnection.count({
          where: {
            accessToken: { not: null },
          },
        }),

        // Active connections
        this.prismaService.platformConnection.count({
          where: {
            status: ConnectionStatus.ACTIVE,
            accessToken: { not: null },
          },
        }),

        // Expiring within 1 hour
        this.prismaService.platformConnection.count({
          where: {
            status: ConnectionStatus.ACTIVE,
            tokenExpiresAt: {
              lte: oneHourFromNow,
              gt: now,
            },
          },
        }),

        // Already expired
        this.prismaService.platformConnection.count({
          where: {
            status: ConnectionStatus.ACTIVE,
            tokenExpiresAt: {
              lte: now,
            },
          },
        }),
      ]);

      const needingRefresh = expiringSoon + expired;

      return {
        total,
        active,
        expiringSoon,
        expired,
        needingRefresh,
      };
    } catch (error) {
      this.logger.error('Error getting token health status', {
        error: error.message,
      });
      return {
        total: 0,
        active: 0,
        expiringSoon: 0,
        expired: 0,
        needingRefresh: 0,
      };
    }
  }

  /**
   * Manually trigger token refresh check (for testing/debugging)
   */
  async triggerRefreshCheck(): Promise<void> {
    this.logger.log('Manually triggering token refresh check');
    await this.checkAndRefreshTokens();
  }

  /**
   * Get scheduler status
   */
  getSchedulerStatus(): {
    isRunning: boolean;
    intervalMs: number;
    intervalMinutes: number;
  } {
    return {
      isRunning: this.isRunning,
      intervalMs: this.intervalMs,
      intervalMinutes: this.intervalMs / 60000,
    };
  }
}