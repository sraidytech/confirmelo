/**
 * Middleware Module
 * Provides request correlation and logging middleware
 */

import { Module, NestModule, MiddlewareConsumer } from '@nestjs/common';
import { CorrelationIdMiddleware } from './correlation-id.middleware';
import { RequestLoggingMiddleware } from './request-logging.middleware';
import { LoggingService } from '../services/logging.service';

@Module({
  providers: [
    CorrelationIdMiddleware,
    RequestLoggingMiddleware,
  ],
  exports: [
    CorrelationIdMiddleware,
    RequestLoggingMiddleware,
  ],
})
export class MiddlewareModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(CorrelationIdMiddleware, RequestLoggingMiddleware)
      .forRoutes('*');
  }
}