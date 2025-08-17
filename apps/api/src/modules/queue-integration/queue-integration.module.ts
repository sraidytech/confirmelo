import { Module, forwardRef } from '@nestjs/common';
import { QueueIntegrationService } from './services/queue-integration.service';
import { QueueModule } from '../queue/queue.module';

@Module({
  imports: [forwardRef(() => QueueModule)],
  providers: [QueueIntegrationService],
  exports: [QueueIntegrationService],
})
export class QueueIntegrationModule {}