import { Module, Global } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { QueueService } from './services/queue.service';
import { JobMonitoringService } from './services/job-monitoring.service';
import { QueueManagementController } from './controllers/queue-management.controller';

@Global()
@Module({
  imports: [
    ConfigModule,
    BullModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => ({
        redis: {
          host: configService.get('REDIS_HOST', 'localhost'),
          port: configService.get('REDIS_PORT', 6379),
          password: configService.get('REDIS_PASSWORD'),
          db: configService.get('REDIS_DB', 0),
        },
        defaultJobOptions: {
          removeOnComplete: 50,
          removeOnFail: 100,
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 2000,
          },
        },
      }),
      inject: [ConfigService],
    }),
    BullModule.registerQueue(
      { name: 'order-sync' },
      { name: 'webhook-renewal' },
      { name: 'sync-retry' },
      { name: 'polling' },
    ),
  ],
  controllers: [QueueManagementController],
  providers: [
    QueueService,
    JobMonitoringService,
  ],
  exports: [QueueService, JobMonitoringService, BullModule],
})
export class QueueModule {}