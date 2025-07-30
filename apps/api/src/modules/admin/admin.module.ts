import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { PrismaModule } from '../../common/database/prisma.module';
import { AuthorizationService } from '../../common/services/authorization.service';
import { RedisModule } from '../../common/redis/redis.module';

@Module({
  imports: [PrismaModule, RedisModule],
  controllers: [AdminController],
  providers: [AdminService, AuthorizationService],
  exports: [AdminService],
})
export class AdminModule {}