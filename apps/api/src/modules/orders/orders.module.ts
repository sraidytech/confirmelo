import { Module } from '@nestjs/common';
import { OrdersController } from './orders.controller';
import { PrismaService } from '../../common/database/prisma.service';

@Module({
  controllers: [OrdersController],
  providers: [PrismaService],
  exports: [],
})
export class OrdersModule {}