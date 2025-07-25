import { Injectable, UnauthorizedException, BadRequestException, ForbiddenException, HttpException, HttpStatus } from '@nestjs/common';
import { PrismaService } from '../../../common/database/prisma.service';
import { RedisService } from '../../../common/redis/redis.service';
import { AuditLogService } from '../../../common/services/audit-log.service';
import { PasswordUtil } from '../../../common/utils/password.util';
import { JwtUtil } from '../../../common/utils/jwt.util';
import { RateLimitUtil } from '../../../common/utils/rate-limit.util';
import { LoginDto, LoginResponseDto, RefreshTokenDto, RefreshTokenResponseDto } from '../dto/login.dto';
import { UserStatus } from '@prisma/client';

@Injectable()
export class LoginService {
  constructor(
    private prisma: PrismaService,
    private redisService: RedisService,
    private auditLogService: AuditLogService,
    private passwordUtil: PasswordUtil,
    private jwtUtil: JwtUtil,
    private rateLimitUtil: RateLimitUtil,
  ) {}

  async login(dto: LoginDto, ipAddress: string, userAgent: string): Promise<LoginResponseDto> {
    const identifier = `${dto.email}:${ipAddress}`;

    // Check rate limiting
    const rateLimitResult = await this.rateLimitUtil.checkLoginRateLimit(identifier);
    if (!rateLimitResult.allowed) {
      throw new HttpException({
        message: 'Too many login attempts. Please try again later.',
        retryAfter: rateLimitResult.retryAfter,
        delay: rateLimitResult.delay,
      }, HttpStatus.TOO_MANY_REQUESTS);
    }

    // Check if account is locked
    const lockStatus = await this.rateLimitUtil.isAccountLocked(identifier);
    if (lockStatus.locked) {
      throw new ForbiddenException({
        message: 'Account is temporarily locked due to too many failed attempts.',
        unlockTime: lockStatus.unlockTime,
      });
    }

    try {
      // Find user by email
      const user = await this.prisma.user.findUnique({
        where: { email: dto.email },
        include: { organization: true },
      });

      if (!user) {
        await this.rateLimitUtil.recordFailedLogin(identifier);
        throw new UnauthorizedException('Invalid email or password');
      }

      // Check user status
      if (user.status !== UserStatus.ACTIVE) {
        throw new ForbiddenException({
          message: 'Account is not active',
          status: user.status,
        });
      }

      // Validate password
      const isPasswordValid = await this.passwordUtil.validatePassword(dto.password, user.password);
      if (!isPasswordValid) {
        await this.rateLimitUtil.recordFailedLogin(identifier);
        throw new UnauthorizedException('Invalid email or password');
      }

      // Clear failed login attempts on successful login
      await this.rateLimitUtil.clearFailedLogins(identifier);

      // Generate session ID and tokens
      const sessionId = this.jwtUtil.generateSessionId();
      const tokenPair = this.jwtUtil.generateTokenPair({
        sub: user.id,
        email: user.email,
        role: user.role,
        organizationId: user.organizationId,
        sessionId,
      }, dto.rememberMe);

      // Create session in database
      const session = await this.prisma.session.create({
        data: {
          sessionToken: sessionId,
          userId: user.id,
          expiresAt: new Date(Date.now() + (dto.rememberMe ? 30 * 24 * 60 * 60 * 1000 : 7 * 24 * 60 * 60 * 1000)),
          ipAddress,
          userAgent,
        },
      });

      // Store session in Redis for quick access
      await this.redisService.setSession(sessionId, {
        userId: user.id,
        organizationId: user.organizationId,
        role: user.role,
        permissions: [], // Will be populated by authorization service
        assignments: [], // Will be populated by authorization service
        lastActivity: new Date(),
        ipAddress,
        userAgent,
      }, dto.rememberMe ? 30 * 24 * 3600 : 7 * 24 * 3600);

      // Update user's last login and online status
      await this.prisma.user.update({
        where: { id: user.id },
        data: {
          lastActiveAt: new Date(),
          isOnline: true,
        },
      });

      // Log successful login
      await this.logSecurityEvent('LOGIN_SUCCESS', {
        userId: user.id,
        email: user.email,
        ipAddress,
        userAgent,
        sessionId,
      });

      return {
        success: true,
        message: 'Login successful',
        user: {
          id: user.id,
          email: user.email,
          username: user.username,
          firstName: user.firstName,
          lastName: user.lastName,
          role: user.role,
          status: user.status,
          organizationId: user.organizationId,
          isOnline: true,
        },
        tokens: tokenPair,
        sessionId,
      };

    } catch (error) {
      // Log failed login attempt
      await this.logSecurityEvent('LOGIN_FAILURE', {
        email: dto.email,
        ipAddress,
        userAgent,
        error: error.message,
      });

      throw error;
    }
  }

  async refreshToken(dto: RefreshTokenDto): Promise<RefreshTokenResponseDto> {
    try {
      // Verify refresh token
      const refreshPayload = this.jwtUtil.verifyRefreshToken(dto.refreshToken);

      // Get session from database
      const session = await this.prisma.session.findUnique({
        where: { sessionToken: refreshPayload.sessionId },
        include: { user: { include: { organization: true } } },
      });

      if (!session || session.expiresAt < new Date()) {
        throw new UnauthorizedException('Invalid or expired refresh token');
      }

      // Check if user is still active
      if (session.user.status !== UserStatus.ACTIVE) {
        throw new ForbiddenException('User account is not active');
      }

      // Generate new token pair
      const newTokenPair = this.jwtUtil.generateTokenPair({
        sub: session.user.id,
        email: session.user.email,
        role: session.user.role,
        organizationId: session.user.organizationId,
        sessionId: refreshPayload.sessionId,
      });

      // Update session expiration
      await this.prisma.session.update({
        where: { id: session.id },
        data: { expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) },
      });

      // Update Redis session
      await this.redisService.setSession(refreshPayload.sessionId, {
        userId: session.user.id,
        organizationId: session.user.organizationId,
        role: session.user.role,
        permissions: [],
        assignments: [],
        lastActivity: new Date(),
        ipAddress: session.ipAddress,
        userAgent: session.userAgent,
      }, 7 * 24 * 3600);

      return {
        success: true,
        message: 'Token refreshed successfully',
        tokens: newTokenPair,
      };

    } catch (error) {
      throw new UnauthorizedException('Invalid refresh token');
    }
  }

  async logout(sessionId: string, accessToken: string): Promise<{ success: boolean; message: string }> {
    try {
      // Get session from Redis
      const sessionData = await this.redisService.getSession(sessionId);
      
      if (sessionData) {
        // Update user online status
        await this.prisma.user.update({
          where: { id: sessionData.userId },
          data: { isOnline: false },
        });

        // Log logout event
        await this.logSecurityEvent('LOGOUT', {
          userId: sessionData.userId,
          sessionId,
        });
      }

      // Remove session from database
      await this.prisma.session.deleteMany({
        where: { sessionToken: sessionId },
      });

      // Remove session from Redis
      await this.redisService.deleteSession(sessionId);

      // Blacklist the access token
      // Note: TokenBlacklistUtil would be injected here if we implement it

      return {
        success: true,
        message: 'Logout successful',
      };

    } catch (error) {
      console.error('Logout error:', error);
      return {
        success: true,
        message: 'Logout successful', // Always return success for security
      };
    }
  }

  async logoutFromAllDevices(userId: string): Promise<{ success: boolean; message: string }> {
    try {
      // Get all user sessions
      const sessions = await this.prisma.session.findMany({
        where: { userId },
      });

      // Remove all sessions from Redis
      for (const session of sessions) {
        await this.redisService.deleteSession(session.sessionToken);
      }

      // Remove all sessions from database
      await this.prisma.session.deleteMany({
        where: { userId },
      });

      // Update user online status
      await this.prisma.user.update({
        where: { id: userId },
        data: { isOnline: false },
      });

      // Log logout from all devices
      await this.logSecurityEvent('LOGOUT_ALL_DEVICES', {
        userId,
        sessionCount: sessions.length,
      });

      return {
        success: true,
        message: 'Logged out from all devices successfully',
      };

    } catch (error) {
      console.error('Logout from all devices error:', error);
      throw new Error('Failed to logout from all devices');
    }
  }

  private async logSecurityEvent(type: string, details: any): Promise<void> {
    await this.auditLogService.logSecurityEvent(
      type,
      details.userId,
      details.organizationId,
      details,
      details.ipAddress,
      details.userAgent,
    );
  }
}