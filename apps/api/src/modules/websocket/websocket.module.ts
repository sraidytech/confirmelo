import { Module, forwardRef } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { WebsocketGateway } from './websocket.gateway';
import { WebsocketService } from './websocket.service';
import { WebsocketController } from './websocket.controller';
import { RealtimeNotificationService } from './services/realtime-notification.service';
import { RealtimeNotificationController } from './controllers/realtime-notification.controller';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get('JWT_SECRET'),
        signOptions: {
          expiresIn: configService.get('JWT_EXPIRES_IN', '15m'),
        },
      }),
    }),
    ScheduleModule.forRoot(),
    forwardRef(() => AuthModule),
  ],
  controllers: [WebsocketController, RealtimeNotificationController],
  providers: [WebsocketGateway, WebsocketService, RealtimeNotificationService],
  exports: [WebsocketService, WebsocketGateway, RealtimeNotificationService],
})
export class WebsocketModule {}