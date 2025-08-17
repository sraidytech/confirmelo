import { Test, TestingModule } from '@nestjs/testing';
import { QueueService } from '../services/queue.service';
import { JobMonitoringService } from '../services/job-monitoring.service';
import { QueueModule } from '../queue.module';
import { ConfigModule } from '@nestjs/config';

describe('Queue Integration', () => {
  let module: TestingModule;
  let queueService: QueueService;
  let jobMonitoringService: JobMonitoringService;

  beforeAll(async () => {
    module = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          envFilePath: ['.env.test', '.env'],
        }),
        QueueModule,
      ],
    }).compile();

    queueService = module.get<QueueService>(QueueService);
    jobMonitoringService = module.get<JobMonitoringService>(JobMonitoringService);
  });

  afterAll(async () => {
    await module.close();
  });

  describe('QueueService', () => {
    it('should be defined', () => {
      expect(queueService).toBeDefined();
    });

    it('should be able to get queue statistics', async () => {
      const stats = await jobMonitoringService.getQueueStatistics();
      expect(stats).toBeDefined();
      expect(stats.queues).toBeDefined();
      expect(Array.isArray(stats.queues)).toBe(true);
    });

    it('should have all expected queues', async () => {
      const stats = await jobMonitoringService.getQueueStatistics();
      const queueNames = stats.queues.map(q => q.name);
      
      expect(queueNames).toContain('order-sync');
      expect(queueNames).toContain('webhook-renewal');
      expect(queueNames).toContain('sync-retry');
      expect(queueNames).toContain('polling');
    });
  });

  describe('Job Management', () => {
    it('should be able to add an order sync job', async () => {
      const jobData = {
        connectionId: 'test-connection-id',
        sheetId: 'test-sheet-id',
        triggeredBy: 'manual' as const,
        userId: 'test-user-id',
        organizationId: 'test-org-id',
      };

      const jobId = await queueService.addOrderSyncJob(jobData);
      expect(jobId).toBeDefined();
      expect(typeof jobId).toBe('string');
    });

    it('should be able to get job status', async () => {
      const jobData = {
        connectionId: 'test-connection-id-2',
        sheetId: 'test-sheet-id-2',
        triggeredBy: 'manual' as const,
        userId: 'test-user-id-2',
        organizationId: 'test-org-id-2',
      };

      const jobId = await queueService.addOrderSyncJob(jobData);
      const jobStatus = await queueService.getJobStatus('order-sync', jobId);
      
      expect(jobStatus).toBeDefined();
      expect(jobStatus.id).toBe(jobId);
      expect(jobStatus.data).toEqual(jobData);
    });
  });
});