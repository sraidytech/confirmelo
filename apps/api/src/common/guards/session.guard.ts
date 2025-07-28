import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { RedisService } from '../redis/redis.service';
import { PrismaService } from '../database/prisma.service';

@Injectable()
export class SessionGuard implements CanActivate {
  constructor(
    private redisService: RedisService,
    private prismaService: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user) {
      throw new UnauthorizedException('User not authenticated');
    }

    // Extract session ID from request headers or JWT payload
    const sessionId = request.headers['x-session-id'] || user.sessionId;

    if (!sessionId) {
      throw new UnauthorizedException('Session ID not provided');
    }

    // Check if session exists in Redis
    const sessionData = await this.redisService.getSession(sessionId);

    if (!sessionData) {
      throw new UnauthorizedException('Session not found or expired');
    }

    // Validate session data matches the authenticated user
    if (sessionData.userId !== user.id) {
      throw new UnauthorizedException('Session user mismatch');
    }

    // Check if session is still valid in database
    const dbSession = await this.prismaService.session.findUnique({
      where: { sessionToken: sessionId },
      include: { user: true },
    });

    if (!dbSession || dbSession.expiresAt < new Date()) {
      // Clean up expired session from Redis
      await this.redisService.deleteSession(sessionId);
      throw new UnauthorizedException('Session expired');
    }

    // Update last activity in session data
    sessionData.lastActivity = new Date();
    await this.redisService.setSession(sessionId, sessionData, 3600); // 1 hour TTL

    // Attach session data to request for use in controllers
    request.session = sessionData;

    return true;
  }
}