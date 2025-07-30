/**
 * Exceptions Module
 * Provides global error handling, logging, and monitoring services
 */

import { Module, Global } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { GlobalExceptionFilter } from './global-exception.filter';
import { LoggingService } from '../services/logging.service';
import { ErrorMonitoringService } from '../services/error-monitoring.service';
import { ErrorMonitoringController } from '../controllers/error-monitoring.controller';

@Global()
@Module({
  controllers: [ErrorMonitoringController],
  providers: [
    LoggingService,
    ErrorMonitoringService,
    {
      provide: APP_FILTER,
      useClass: GlobalExceptionFilter,
    },
  ],
  exports: [
    LoggingService,
    ErrorMonitoringService,
  ],
})
export class ExceptionsModule {}