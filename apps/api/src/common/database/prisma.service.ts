import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor() {
    super({
      log: ['query', 'info', 'warn', 'error'],
    });
  }

  async onModuleInit() {
    await this.$connect();
    console.log('✅ Database connected successfully');
  }

  async onModuleDestroy() {
    await this.$disconnect();
    console.log('🔌 Database disconnected');
  }

  async cleanDb() {
    if (process.env.NODE_ENV === 'production') return;

    // Define the models we want to clean in dependency order
    const models = [
      'session',
      'auditLog',
      'callLog',
      'orderActivity',
      'orderItem',
      'order',
      'shipment',
      'productShippingRef',
      'packItem',
      'product',
      'productCategory',
      'customer',
      'callStatus',
      'shippingStatus',
      'shippingCompany',
      'teamStore',
      'teamMember',
      'team',
      'store',
      'platformConnection',
      'user',
      'organization',
      'systemSetting',
    ];

    // Delete in reverse dependency order
    for (const modelName of models.reverse()) {
      if (this[modelName as keyof this] && typeof (this[modelName as keyof this] as any).deleteMany === 'function') {
        await (this[modelName as keyof this] as any).deleteMany();
      }
    }
  }
}