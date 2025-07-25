import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { WebsocketGateway } from './websocket.gateway';
import { WebsocketService } from './websocket.service';
import { WebsocketController } from './websocket.controller';

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
  ],
  controllers: [WebsocketController],
  providers: [WebsocketGateway, WebsocketService],
  exports: [WebsocketService, WebsocketGateway],
})
export class WebsocketModule {}