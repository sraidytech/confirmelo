import { Module } from '@nestjs/common';
import { OrderSyncProcessor } from './processors/order-sync.processor';
import { WebhookRenewalProcessor } from './processors/webhook-renewal.processor';
import { SyncRetryProcessor } from './processors/sync-retry.processor';
import { PollingProcessor } from './processors/polling.processor';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuthModule],
  providers: [
    OrderSyncProcessor,
    WebhookRenewalProcessor,
    SyncRetryProcessor,
    PollingProcessor,
  ],
})
export class QueueProcessorsModule {}