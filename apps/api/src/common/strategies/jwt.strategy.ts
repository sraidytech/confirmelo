import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../database/prisma.service';

export interface JwtPayload {
  sub: string; // user ID
  email: string;
  role: string;
  organizationId?: string;
  sessionId?: string;
  iat?: number;
  exp?: number;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private configService: ConfigService,
    private prismaService: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get('JWT_SECRET', 'dev-jwt-secret-key'),
    });
  }

  async validate(payload: JwtPayload) {
    // Validate that the user still exists and is active
    const user = await this.prismaService.user.findUnique({
      where: { id: payload.sub },
      include: {
        organization: {
          select: {
            id: true,
            name: true,
            code: true,
            deletedAt: true,
          },
        },
        leadingTeams: {
          select: {
            id: true,
            name: true,
          },
        },
        teamMemberships: {
          select: {
            team: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
      },
    });

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    if (user.status !== 'ACTIVE') {
      throw new UnauthorizedException('User account is not active');
    }

    if (user.deletedAt) {
      throw new UnauthorizedException('User account has been deleted');
    }

    // Check if organization exists and is not deleted
    if (user.organization && user.organization.deletedAt) {
      throw new UnauthorizedException('Organization is not active');
    }

    // Update last active timestamp
    await this.prismaService.user.update({
      where: { id: user.id },
      data: { lastActiveAt: new Date() },
    });

    // Return user data that will be attached to request.user
    return {
      id: user.id,
      email: user.email,
      username: user.username,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
      status: user.status,
      organizationId: user.organizationId,
      organization: user.organization,
      leadingTeams: user.leadingTeams,
      teamMemberships: user.teamMemberships.map(tm => tm.team),
      sessionId: payload.sessionId,
      isOnline: user.isOnline,
      lastActiveAt: user.lastActiveAt,
    };
  }
}