import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigService } from '@nestjs/config';
import { AuthController } from './auth.controller';
import { JwtStrategy } from '../../common/strategies/jwt.strategy';
import { AuthorizationService } from '../../common/services/authorization.service';
import { SessionManagementService } from './services/session-management.service';
import { PrismaService } from '../../common/database/prisma.service';
import { RedisService } from '../../common/redis/redis.service';
import { RealtimeNotificationService } from '../websocket/services/realtime-notification.service';
import { WebsocketGateway } from '../websocket/websocket.gateway';
import { ValidationModule } from '../../common/validation/validation.module';

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get('JWT_SECRET', 'dev-jwt-secret-key'),
        signOptions: {
          expiresIn: '15m',
        },
      }),
    }),
    ValidationModule,
  ],
  controllers: [AuthController],
  providers: [
    JwtStrategy,
    AuthorizationService,
    SessionManagementService,
    PrismaService,
    RedisService,
    RealtimeNotificationService,
    WebsocketGateway,
  ],
  exports: [
    JwtStrategy,
    AuthorizationService,
    SessionManagementService,
    PassportModule,
    JwtModule,
  ],
})
export class AuthModule { }