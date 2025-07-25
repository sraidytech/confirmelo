import { Module, forwardRef } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigService } from '@nestjs/config';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { RegistrationService } from './services/registration.service';
import { LoginService } from './services/login.service';
import { TeamAssignmentService } from './services/team-assignment.service';
import { TeamAssignmentController } from './controllers/team-assignment.controller';
import { JwtUtil } from '../../common/utils/jwt.util';
import { PasswordUtil } from '../../common/utils/password.util';
import { OrganizationUtil } from '../../common/utils/organization.util';
import { RateLimitUtil } from '../../common/utils/rate-limit.util';

@Module({
  imports: [
    PassportModule,
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get('JWT_SECRET'),
        signOptions: {
          expiresIn: configService.get('JWT_EXPIRES_IN', '15m'),
        },
      }),
    }),
    forwardRef(() => import('../websocket/websocket.module').then(m => m.WebsocketModule)),
  ],
  controllers: [AuthController, TeamAssignmentController],
  providers: [
    AuthService,
    RegistrationService,
    LoginService,
    TeamAssignmentService,
    JwtUtil,
    PasswordUtil,
    OrganizationUtil,
    RateLimitUtil,
  ],
  exports: [
    AuthService,
    RegistrationService,
    LoginService,
    TeamAssignmentService,
    JwtUtil,
    PasswordUtil,
    OrganizationUtil,
    RateLimitUtil,
  ],
})
export class AuthModule { }