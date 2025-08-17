import { Module, NestModule, MiddlewareConsumer } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './common/database/prisma.module';
import { RedisModule } from './common/redis/redis.module';
import { GuardsModule } from './common/guards/guards.module';
import { ExceptionsModule } from './common/exceptions/exceptions.module';
import { ValidationModule } from './common/validation/validation.module';
import { CorrelationIdMiddleware } from './common/middleware/correlation-id.middleware';
import { RequestLoggingMiddleware } from './common/middleware/request-logging.middleware';
import { RequestSizeMiddleware } from './common/validation/middleware/request-size.middleware';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { AdminModule } from './modules/admin/admin.module';
import { OrdersModule } from './modules/orders/orders.module';
import { QueueModule } from './modules/queue/queue.module';
import { QueueProcessorsModule } from './modules/queue/queue-processors.module';
import { HealthController } from './health/health.controller';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.local', '.env'],
    }),
    PrismaModule,
    RedisModule,
    GuardsModule,
    ExceptionsModule,
    ValidationModule,
    QueueModule, // Must be imported before AuthModule
    AuthModule,
    UsersModule,
    AdminModule,
    OrdersModule,
    QueueProcessorsModule, // Import processors after AuthModule
  ],
  controllers: [HealthController],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(CorrelationIdMiddleware, RequestSizeMiddleware, RequestLoggingMiddleware)
      .forRoutes('*');
  }
}