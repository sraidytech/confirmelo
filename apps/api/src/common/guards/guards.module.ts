import { Module, Global } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtAuthGuard } from './jwt-auth.guard';
import { RolesGuard } from './roles.guard';
import { ResourceAccessGuard } from './resource-access.guard';
import { SessionGuard } from './session.guard';
import { AuthorizationService } from '../services/authorization.service';
import { PrismaService } from '../database/prisma.service';
import { RedisService } from '../redis/redis.service';

@Global()
@Module({
  providers: [
    // Guards
    JwtAuthGuard,
    RolesGuard,
    ResourceAccessGuard,
    SessionGuard,
    
    // Services
    AuthorizationService,
    PrismaService,
    RedisService,
    
    // Global guard configuration (optional - can be applied per controller instead)
    // {
    //   provide: APP_GUARD,
    //   useClass: JwtAuthGuard,
    // },
  ],
  exports: [
    JwtAuthGuard,
    RolesGuard,
    ResourceAccessGuard,
    SessionGuard,
    AuthorizationService,
  ],
})
export class GuardsModule {}