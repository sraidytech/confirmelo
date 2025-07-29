import { Module } from '@nestjs/common';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { UserPresenceService } from './services';
import { PrismaService } from '../../common/database/prisma.service';
import { RedisService } from '../../common/redis/redis.service';
import { AuthorizationService } from '../../common/services/authorization.service';
import { WebsocketGateway } from '../websocket/websocket.gateway';
import { JwtService } from '@nestjs/jwt';

@Module({
  controllers: [UsersController],
  providers: [
    UsersService,
    UserPresenceService,
    PrismaService,
    RedisService,
    AuthorizationService,
    WebsocketGateway,
    JwtService,
  ],
  exports: [UsersService, UserPresenceService],
})
export class UsersModule {}