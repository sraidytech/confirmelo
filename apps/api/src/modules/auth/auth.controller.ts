import { Controller, Get, Post, Body } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { Public, Auth, CurrentUser } from '../../common/decorators';
import { PrismaService } from '../../common/database/prisma.service';
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
  async logout(@CurrentUser() user: any) {
    // TODO: Implement proper logout with session invalidation
    return { 
      message: 'Logout successful',
      userId: user.id 
    };
  }
}