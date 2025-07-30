import { Controller, Get, Post, Body, Query, Param, Delete } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { Public, Auth, CurrentUser } from '../../common/decorators';
import { PrismaService } from '../../common/database/prisma.service';
import { RedisService } from '../../common/redis/redis.service';
import { RealtimeNotificationService } from '../websocket/services/realtime-notification.service';
import { WebsocketGateway } from '../websocket/websocket.gateway';
import { LogoutDto, LogoutResponse } from './dto/logout.dto';
import { 
  GetSessionsDto, 
  TerminateSessionDto, 
  GetSessionsResponse, 
  TerminateSessionResponse,
  SessionStatsDto,
  SessionActivityDto
} from './dto/session-management.dto';
import { SessionManagementService } from './services/session-management.service';
import * as bcrypt from 'bcrypt';
import { JwtService } from '@nestjs/jwt';

interface RegisterDto {
  // Organization details
  organizationName: string;
  organizationEmail: string;
  organizationCountry: string;
  
  // Admin user details
  firstName: string;
  lastName: string;
  email: string;
  password: string;
}

interface LoginDto {
  email: string;
  password: string;
}

@ApiTags('Authentication')
@Controller('auth')
export class AuthController {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private redisService: RedisService,
    private realtimeNotificationService: RealtimeNotificationService,
    private websocketGateway: WebsocketGateway,
    private sessionManagementService: SessionManagementService,
  ) {}

  @Public()
  @Get('health')
  @ApiOperation({ summary: 'Health check endpoint' })
  healthCheck() {
    return {
      status: 'ok',
      message: 'Authentication service is running',
      timestamp: new Date().toISOString(),
    };
  }

  @Public()
  @Post('register')
  @ApiOperation({ summary: 'Register organization and admin user' })
  @ApiResponse({ status: 201, description: 'Registration successful' })
  async register(@Body() dto: RegisterDto) {
    try {
      // Hash password
      const hashedPassword = await bcrypt.hash(dto.password, 12);
      
      // Generate organization code
      const orgCode = dto.organizationName
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, '')
        .substring(0, 6) + Math.floor(Math.random() * 1000);

      // Create organization and user in transaction
      const result = await this.prisma.$transaction(async (tx) => {
        // Create organization
        const organization = await tx.organization.create({
          data: {
            name: dto.organizationName,
            code: orgCode,
            email: dto.organizationEmail,
            country: dto.organizationCountry,
            timezone: 'UTC',
            currency: 'USD',
          },
        });

        // Create admin user
        const user = await tx.user.create({
          data: {
            email: dto.email,
            username: dto.email,
            password: hashedPassword,
            firstName: dto.firstName,
            lastName: dto.lastName,
            role: 'ADMIN',
            status: 'ACTIVE',
            organizationId: organization.id,
          },
        });

        return { organization, user };
      });

      // Generate JWT tokens
      const payload = { 
        sub: result.user.id, 
        email: result.user.email,
        role: result.user.role,
        organizationId: result.organization.id 
      };
      
      const accessToken = this.jwtService.sign(payload, { expiresIn: '15m' });
      const refreshToken = this.jwtService.sign(payload, { expiresIn: '7d' });

      return {
        user: {
          id: result.user.id,
          email: result.user.email,
          firstName: result.user.firstName,
          lastName: result.user.lastName,
          role: result.user.role,
          status: result.user.status,
          organization: {
            id: result.organization.id,
            name: result.organization.name,
            code: result.organization.code,
          },
        },
        tokens: {
          accessToken,
          refreshToken,
        },
      };
    } catch (error) {
      console.error('Registration error:', error);
      throw new Error('Registration failed');
    }
  }

  @Public()
  @Post('login')
  @ApiOperation({ summary: 'Login user' })
  @ApiResponse({ status: 200, description: 'Login successful' })
  async login(@Body() dto: LoginDto) {
    try {
      // Find user
      const user = await this.prisma.user.findUnique({
        where: { email: dto.email },
        include: { organization: true },
      });

      if (!user) {
        throw new Error('Invalid credentials');
      }

      // Verify password
      const isValidPassword = await bcrypt.compare(dto.password, user.password);
      if (!isValidPassword) {
        throw new Error('Invalid credentials');
      }

      // Generate JWT tokens
      const payload = { 
        sub: user.id, 
        email: user.email,
        role: user.role,
        organizationId: user.organizationId 
      };
      
      const accessToken = this.jwtService.sign(payload, { expiresIn: '15m' });
      const refreshToken = this.jwtService.sign(payload, { expiresIn: '7d' });

      return {
        user: {
          id: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          role: user.role,
          status: user.status,
          organization: user.organization ? {
            id: user.organization.id,
            name: user.organization.name,
            code: user.organization.code,
          } : null,
        },
        tokens: {
          accessToken,
          refreshToken,
        },
      };
    } catch (error) {
      console.error('Login error:', error);
      throw new Error('Login failed');
    }
  }

  @Public()
  @Post('refresh')
  @ApiOperation({ summary: 'Refresh access token' })
  async refreshToken(@Body() body: { refreshToken: string }) {
    try {
      const payload = this.jwtService.verify(body.refreshToken);
      
      const newAccessToken = this.jwtService.sign({
        sub: payload.sub,
        email: payload.email,
        role: payload.role,
        organizationId: payload.organizationId,
      }, { expiresIn: '15m' });

      const newRefreshToken = this.jwtService.sign({
        sub: payload.sub,
        email: payload.email,
        role: payload.role,
        organizationId: payload.organizationId,
      }, { expiresIn: '7d' });

      return {
        tokens: {
          accessToken: newAccessToken,
          refreshToken: newRefreshToken,
        },
      };
    } catch (error) {
      console.error('Token refresh error:', error);
      throw new Error('Token refresh failed');
    }
  }

  @Auth()
  @Get('me')
  @ApiOperation({ summary: 'Get current user profile' })
  @ApiResponse({ status: 200, description: 'User profile retrieved successfully' })
  async getCurrentUser(@CurrentUser() user: any) {
    // Get fresh user data from database
    const userData = await this.prisma.user.findUnique({
      where: { id: user.id },
      include: {
        organization: {
          select: {
            id: true,
            name: true,
            code: true,
            email: true,
            country: true,
            timezone: true,
            currency: true,
          },
        },
      },
    });

    if (!userData) {
      throw new Error('User not found');
    }

    return {
      id: userData.id,
      email: userData.email,
      username: userData.username,
      firstName: userData.firstName,
      lastName: userData.lastName,
      phone: userData.phone,
      avatar: userData.avatar,
      role: userData.role,
      status: userData.status,
      isOnline: userData.isOnline,
      lastActiveAt: userData.lastActiveAt,
      organizationId: userData.organizationId,
      organization: userData.organization,
      createdAt: userData.createdAt,
      updatedAt: userData.updatedAt,
    };
  }

  @Auth()
  @Post('logout')
  @ApiOperation({ summary: 'Logout user' })
  @ApiResponse({ status: 200, description: 'Logout successful', type: LogoutResponse })
  async logout(@CurrentUser() user: any, @Body() body: LogoutDto) {
    try {
      const userId = user.id;
      const { sessionId, logoutFromAll = false } = body;

      if (logoutFromAll) {
        // Logout from all devices/sessions
        await this.logoutFromAllSessions(userId);
        return {
          message: 'Successfully logged out from all devices',
          userId,
          timestamp: new Date().toISOString(),
        };
      } else {
        // Logout from current session only
        await this.logoutFromCurrentSession(userId, sessionId);
        return {
          message: 'Logout successful',
          userId,
          timestamp: new Date().toISOString(),
        };
      }
    } catch (error) {
      console.error('Logout error:', error);
      throw new Error('Logout failed');
    }
  }

  @Auth()
  @Post('logout-all')
  @ApiOperation({ summary: 'Logout user from all devices' })
  @ApiResponse({ status: 200, description: 'Logged out from all devices successfully' })
  async logoutFromAllDevices(@CurrentUser() user: any) {
    try {
      const userId = user.id;
      await this.logoutFromAllSessions(userId);
      
      return {
        message: 'Successfully logged out from all devices',
        userId,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      console.error('Logout from all devices error:', error);
      throw new Error('Logout from all devices failed');
    }
  }

  /**
   * Logout from current session only
   */
  private async logoutFromCurrentSession(userId: string, sessionId?: string): Promise<void> {
    try {
      // If sessionId is provided, invalidate specific session
      if (sessionId) {
        // Remove session from database
        await this.prisma.session.deleteMany({
          where: {
            userId,
            sessionToken: sessionId,
          },
        });

        // Remove session from Redis
        await this.redisService.deleteSession(sessionId);

        // Add token to blacklist in Redis (for JWT invalidation)
        await this.blacklistToken(sessionId);
      } else {
        // If no sessionId provided, invalidate all sessions for the user
        // This is a fallback - ideally sessionId should always be provided
        await this.logoutFromAllSessions(userId);
        return;
      }

      // Update user online status
      await this.updateUserOnlineStatus(userId, false);

      // Broadcast session termination event
      await this.realtimeNotificationService.broadcastSessionUpdate({
        userId,
        sessionId,
        action: 'terminated',
        reason: 'User logout',
        timestamp: new Date(),
        organizationId: await this.getUserOrganizationId(userId),
      });

      // Disconnect WebSocket connections for this session
      await this.websocketGateway.disconnectUser(userId, 'User logged out');

      console.log(`User ${userId} logged out from session ${sessionId}`);
    } catch (error) {
      console.error(`Error logging out user ${userId} from session ${sessionId}:`, error);
      throw error;
    }
  }

  /**
   * Logout from all sessions/devices
   */
  private async logoutFromAllSessions(userId: string): Promise<void> {
    try {
      // Get all user sessions from database
      const userSessions = await this.prisma.session.findMany({
        where: { userId },
        select: { sessionToken: true },
      });

      // Remove all sessions from database
      await this.prisma.session.deleteMany({
        where: { userId },
      });

      // Remove all sessions from Redis and blacklist tokens
      if (userSessions && userSessions.length > 0) {
        for (const session of userSessions) {
          await this.redisService.deleteSession(session.sessionToken);
          await this.blacklistToken(session.sessionToken);
        }
      }

      // Clear any user-specific Redis data
      await this.clearUserRedisData(userId);

      // Update user online status
      await this.updateUserOnlineStatus(userId, false);

      // Broadcast session termination event
      await this.realtimeNotificationService.broadcastSessionUpdate({
        userId,
        action: 'terminated',
        reason: 'Logged out from all devices',
        timestamp: new Date(),
        organizationId: await this.getUserOrganizationId(userId),
      });

      // Force disconnect all WebSocket connections
      await this.websocketGateway.disconnectUser(userId, 'Logged out from all devices');

      console.log(`User ${userId} logged out from all sessions`);
    } catch (error) {
      console.error(`Error logging out user ${userId} from all sessions:`, error);
      throw error;
    }
  }

  /**
   * Add token to blacklist in Redis
   */
  private async blacklistToken(token: string): Promise<void> {
    try {
      // Decode token to get expiration time
      let expirationTime = 3600; // Default 1 hour
      try {
        const decoded = this.jwtService.decode(token) as any;
        if (decoded && decoded.exp) {
          const now = Math.floor(Date.now() / 1000);
          expirationTime = Math.max(decoded.exp - now, 0);
        }
      } catch (decodeError) {
        // If token can't be decoded, use default expiration
        console.warn('Could not decode token for blacklisting, using default expiration');
      }

      // Add to blacklist with expiration
      await this.redisService.set(`blacklist:${token}`, true, expirationTime);
    } catch (error) {
      console.error('Error blacklisting token:', error);
      // Don't throw error here as it's not critical for logout
    }
  }

  /**
   * Clear user-specific Redis data
   */
  private async clearUserRedisData(userId: string): Promise<void> {
    try {
      const redisClient = this.redisService.getClient();
      
      // Clear user permissions cache
      await this.redisService.del(`user_permissions:${userId}`);
      
      // Clear user online status
      await this.redisService.del(`user:${userId}:online`);
      
      // Clear any rate limiting data for the user
      const rateLimitKeys = await redisClient.keys(`rate_limit:user:${userId}:*`);
      if (rateLimitKeys.length > 0) {
        await redisClient.del(rateLimitKeys);
      }

      // Clear any other user-specific cached data
      const userCacheKeys = await redisClient.keys(`user:${userId}:*`);
      if (userCacheKeys.length > 0) {
        await redisClient.del(userCacheKeys);
      }
    } catch (error) {
      console.error(`Error clearing Redis data for user ${userId}:`, error);
      // Don't throw error here as it's not critical for logout
    }
  }

  /**
   * Update user online status in database
   */
  private async updateUserOnlineStatus(userId: string, isOnline: boolean): Promise<void> {
    try {
      await this.prisma.user.update({
        where: { id: userId },
        data: {
          isOnline,
          lastActiveAt: new Date(),
        },
      });
    } catch (error) {
      console.error(`Error updating online status for user ${userId}:`, error);
      // Don't throw error here as it's not critical for logout
    }
  }

  /**
   * Get user's organization ID
   */
  private async getUserOrganizationId(userId: string): Promise<string> {
    try {
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { organizationId: true },
      });
      return user?.organizationId || '';
    } catch (error) {
      console.error(`Error getting organization ID for user ${userId}:`, error);
      return '';
    }
  }

  // ==================== SESSION MANAGEMENT ENDPOINTS ====================

  @Auth()
  @Get('sessions')
  @ApiOperation({ summary: 'Get user sessions with detailed information' })
  @ApiResponse({ status: 200, description: 'Sessions retrieved successfully', type: GetSessionsResponse })
  async getUserSessions(
    @CurrentUser() user: any,
    @Query() query: GetSessionsDto
  ): Promise<GetSessionsResponse> {
    return this.sessionManagementService.getUserSessions(user.id, query.includeExpired);
  }

  @Auth()
  @Get('sessions/stats')
  @ApiOperation({ summary: 'Get session statistics for current user' })
  @ApiResponse({ status: 200, description: 'Session statistics retrieved successfully', type: SessionStatsDto })
  async getSessionStats(@CurrentUser() user: any): Promise<SessionStatsDto> {
    return this.sessionManagementService.getSessionStats(user.id);
  }

  @Auth()
  @Get('sessions/activity')
  @ApiOperation({ summary: 'Get session activity history' })
  @ApiResponse({ status: 200, description: 'Session activity retrieved successfully', type: [SessionActivityDto] })
  async getSessionActivity(
    @CurrentUser() user: any,
    @Query('sessionId') sessionId?: string
  ): Promise<SessionActivityDto[]> {
    return this.sessionManagementService.getSessionActivity(user.id, sessionId);
  }

  @Auth()
  @Delete('sessions/:sessionId')
  @ApiOperation({ summary: 'Terminate a specific session' })
  @ApiResponse({ status: 200, description: 'Session terminated successfully', type: TerminateSessionResponse })
  async terminateSession(
    @CurrentUser() user: any,
    @Param('sessionId') sessionId: string,
    @Body() body: { reason?: string }
  ): Promise<TerminateSessionResponse> {
    return this.sessionManagementService.terminateSession(
      user.id, 
      sessionId, 
      body.reason,
      user.id // terminated by self
    );
  }

  @Auth()
  @Post('sessions/terminate')
  @ApiOperation({ summary: 'Terminate a session (alternative endpoint)' })
  @ApiResponse({ status: 200, description: 'Session terminated successfully', type: TerminateSessionResponse })
  async terminateSessionPost(
    @CurrentUser() user: any,
    @Body() body: TerminateSessionDto
  ): Promise<TerminateSessionResponse> {
    return this.sessionManagementService.terminateSession(
      user.id, 
      body.sessionId, 
      body.reason,
      user.id // terminated by self
    );
  }
}