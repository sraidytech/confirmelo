import { Process, Processor } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { Job } from 'bull';
import { PollingJobData, JobResult } from '../interfaces/job.interface';
import { SpreadsheetConnectionService } from '../../auth/services/spreadsheet-connection.service';
import { SyncStatusService } from '../../auth/services/sync-status.service';
import { QueueService } from '../services/queue.service';

@Processor('polling')
export class PollingProcessor {
    private readonly logger = new Logger(PollingProcessor.name);
    private readonly pollingInterval = 15 * 60 * 1000; // 15 minutes in milliseconds

    constructor(
        private readonly spreadsheetConnectionService: SpreadsheetConnectionService,
        private readonly syncStatusService: SyncStatusService,
        private readonly queueService: QueueService,
    ) { }

    @Process('poll-sync')
    async handlePollingSync(job: Job<PollingJobData>): Promise<JobResult> {
        const { connectionId, userId, organizationId } = job.data;

        this.logger.log(
            `Processing polling sync job ${job.id} for connection ${connectionId}`,
        );

        await job.progress({
            percentage: 0,
            message: 'Starting polling sync check...',
        });

        try {
            await job.progress({
                percentage: 10,
                message: 'Checking connection status...',
            });

            // Check if connection is still active and has order sync enabled
            const connection = await this.spreadsheetConnectionService.getConnection(
                connectionId,
                userId,
                organizationId,
            );

            if (!connection) {
                await job.progress({
                    percentage: 100,
                    message: 'Connection no longer exists',
                });

                return {
                    success: true,
                    message: 'Connection no longer exists, polling stopped',
                };
            }

            if (!connection.orderSyncEnabled) {
                await job.progress({
                    percentage: 100,
                    message: 'Order sync disabled for connection',
                });

                return {
                    success: true,
                    message: 'Order sync disabled for connection, polling skipped',
                };
            }

            await job.progress({
                percentage: 20,
                message: 'Checking last sync status...',
            });

            // Check when the last successful sync occurred
            const syncHistory = await this.syncStatusService.getSyncHistory(
                connectionId,
                {
                    status: 'completed',
                    limit: 1,
                },
            );
            const lastSync = syncHistory.operations.length > 0 ? syncHistory.operations[0] : null;

            const now = new Date();
            const shouldSync = this.shouldTriggerSync(lastSync, now);

            if (!shouldSync.trigger) {
                await job.progress({
                    percentage: 100,
                    message: shouldSync.reason,
                });

                return {
                    success: true,
                    message: shouldSync.reason,
                };
            }

            await job.progress({
                percentage: 40,
                message: 'Checking for webhook failures...',
            });

            // Check if there have been recent webhook failures that might indicate
            // we need to fall back to polling
            const recentFailures = await this.checkRecentWebhookFailures(connectionId);

            if (recentFailures.hasFailures) {
                this.logger.warn(
                    `Connection ${connectionId} has recent webhook failures, triggering fallback sync`,
                );
            }

            await job.progress({
                percentage: 60,
                message: 'Triggering sync operation...',
            });

            // Trigger a sync operation
            const syncJobId = await this.queueService.addOrderSyncJob({
                connectionId,
                triggeredBy: 'polling',
                userId,
                organizationId,
            });

            await job.progress({
                percentage: 90,
                message: 'Sync job queued, scheduling next poll...',
            });

            // Schedule the next polling job
            await this.scheduleNextPoll(connectionId, userId, organizationId);

            await job.progress({
                percentage: 100,
                message: 'Polling sync completed',
            });

            this.logger.log(
                `Polling sync job ${job.id} completed for connection ${connectionId}, triggered sync job ${syncJobId}`,
            );

            return {
                success: true,
                message: 'Polling sync triggered successfully',
                data: {
                    syncJobId,
                    reason: shouldSync.reason,
                    hasWebhookFailures: recentFailures.hasFailures,
                },
            };
        } catch (error) {
            this.logger.error(
                `Polling sync job ${job.id} failed for connection ${connectionId}:`,
                error,
            );

            await job.progress({
                percentage: 100,
                message: `Polling failed: ${error.message}`,
            });

            // Still schedule next poll even if this one failed
            try {
                await this.scheduleNextPoll(connectionId, userId, organizationId);
            } catch (scheduleError) {
                this.logger.error('Failed to schedule next poll:', scheduleError);
            }

            return {
                success: false,
                message: `Polling sync failed: ${error.message}`,
                errors: [error.message],
            };
        }
    }

    @Process('schedule-all-polls')
    async handleScheduleAllPolls(job: Job): Promise<JobResult> {
        this.logger.log(`Processing schedule all polls job ${job.id}`);

        await job.progress({
            percentage: 0,
            message: 'Starting to schedule polling for all active connections...',
        });

        try {
            await job.progress({
                percentage: 20,
                message: 'Fetching active connections with order sync enabled...',
            });

            // Get all active connections with order sync enabled
            const activeConnections = await this.spreadsheetConnectionService.getActiveConnectionsWithOrderSync();

            if (!activeConnections || activeConnections.length === 0) {
                await job.progress({
                    percentage: 100,
                    message: 'No active connections found',
                });

                return {
                    success: true,
                    message: 'No active connections with order sync enabled found',
                    processedCount: 0,
                };
            }

            await job.progress({
                percentage: 40,
                message: `Found ${activeConnections.length} connections, scheduling polls...`,
            });

            let scheduledCount = 0;
            const errors = [];

            for (let i = 0; i < activeConnections.length; i++) {
                const connection = activeConnections[i];
                const progressPercentage = 40 + ((i + 1) / activeConnections.length) * 50;

                await job.progress({
                    percentage: progressPercentage,
                    message: `Scheduling poll for connection ${connection.id} (${i + 1}/${activeConnections.length})...`,
                });

                try {
                    await this.queueService.addPollingJob({
                        connectionId: connection.id,
                        userId: connection.userId,
                        organizationId: connection.organizationId,
                    });

                    scheduledCount++;
                } catch (error) {
                    this.logger.error(`Failed to schedule poll for connection ${connection.id}:`, error);
                    errors.push(`Connection ${connection.id}: ${error.message}`);
                }
            }

            await job.progress({
                percentage: 100,
                message: `Scheduled ${scheduledCount} polling jobs`,
            });

            this.logger.log(
                `Schedule all polls job ${job.id} completed: ${scheduledCount}/${activeConnections.length} polls scheduled`,
            );

            return {
                success: errors.length === 0,
                message: `Scheduled ${scheduledCount} polling jobs out of ${activeConnections.length} connections`,
                processedCount: scheduledCount,
                errorCount: errors.length,
                errors,
            };
        } catch (error) {
            this.logger.error(
                `Schedule all polls job ${job.id} failed:`,
                error,
            );

            await job.progress({
                percentage: 100,
                message: `Scheduling failed: ${error.message}`,
            });

            return {
                success: false,
                message: `Failed to schedule polling jobs: ${error.message}`,
                errors: [error.message],
            };
        }
    }

    private shouldTriggerSync(lastSync: any, now: Date): { trigger: boolean; reason: string } {
        if (!lastSync) {
            return {
                trigger: true,
                reason: 'No previous sync found, triggering initial sync',
            };
        }

        const lastSyncTime = new Date(lastSync.createdAt);
        const timeSinceLastSync = now.getTime() - lastSyncTime.getTime();

        // Trigger sync if it's been more than the polling interval since last sync
        if (timeSinceLastSync > this.pollingInterval) {
            return {
                trigger: true,
                reason: `Last sync was ${Math.round(timeSinceLastSync / 60000)} minutes ago, triggering sync`,
            };
        }

        return {
            trigger: false,
            reason: `Last sync was ${Math.round(timeSinceLastSync / 60000)} minutes ago, too recent to sync again`,
        };
    }

    private async checkRecentWebhookFailures(connectionId: string): Promise<{ hasFailures: boolean; failureCount: number }> {
        try {
            // Check for webhook-related sync failures in the last hour
            const oneHourAgo = new Date();
            oneHourAgo.setHours(oneHourAgo.getHours() - 1);

            const recentFailures = await this.syncStatusService.getSyncHistory(
                connectionId,
                {
                    status: 'failed',
                    operationType: 'webhook',
                    limit: 10,
                },
            );

            return {
                hasFailures: recentFailures.operations.length > 0,
                failureCount: recentFailures.operations.length,
            };
        } catch (error) {
            this.logger.error('Failed to check recent webhook failures:', error);
            return { hasFailures: false, failureCount: 0 };
        }
    }

    private async scheduleNextPoll(connectionId: string, userId: string, organizationId: string): Promise<void> {
        try {
            // Schedule the next polling job with a delay
            await this.queueService.addPollingJob(
                {
                    connectionId,
                    userId,
                    organizationId,
                },
                {
                    delay: this.pollingInterval,
                },
            );
        } catch (error) {
            this.logger.error(`Failed to schedule next poll for connection ${connectionId}:`, error);
            throw error;
        }
    }
}