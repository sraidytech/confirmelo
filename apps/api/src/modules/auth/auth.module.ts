import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigService } from '@nestjs/config';
import { AuthController } from './auth.controller';
import { OAuth2Controller } from './controllers/oauth2.controller';
import { YoucanOAuth2Controller } from './controllers/youcan-oauth2.controller';
import { GoogleSheetsOAuth2Controller } from './controllers/google-sheets-oauth2.controller';
import { JwtStrategy } from '../../common/strategies/jwt.strategy';
import { AuthorizationService } from '../../common/services/authorization.service';
import { SessionManagementService } from './services/session-management.service';
import { OAuth2Service } from './services/oauth2.service';
import { OAuth2ConfigService } from './services/oauth2-config.service';
import { YoucanOAuth2Service } from './services/youcan-oauth2.service';
import { GoogleSheetsOAuth2Service } from './services/google-sheets-oauth2.service';
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
  controllers: [AuthController, OAuth2Controller, YoucanOAuth2Controller, GoogleSheetsOAuth2Controller],
  providers: [
    JwtStrategy,
    AuthorizationService,
    SessionManagementService,
    OAuth2Service,
    OAuth2ConfigService,
    YoucanOAuth2Service,
    GoogleSheetsOAuth2Service,
    PrismaService,
    RedisService,
    RealtimeNotificationService,
    WebsocketGateway,
  ],
  exports: [
    JwtStrategy,
    AuthorizationService,
    SessionManagementService,
    OAuth2Service,
    OAuth2ConfigService,
    YoucanOAuth2Service,
    GoogleSheetsOAuth2Service,
    PassportModule,
    JwtModule,
  ],
})
export class AuthModule { }