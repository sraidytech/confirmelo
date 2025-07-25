import { Controller, Get, Post, Body, Query, Req, Ip } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiQuery } from '@nestjs/swagger';
import { RegistrationService } from './services/registration.service';
import { LoginService } from './services/login.service';
import { OrganizationUtil } from '../../common/utils/organization.util';
import { RegisterOrganizationDto, RegisterResponseDto } from './dto/register.dto';
import { LoginDto, LoginResponseDto, RefreshTokenDto, RefreshTokenResponseDto } from './dto/login.dto';

@ApiTags('Authentication')
@Controller('auth')
export class AuthController {
  constructor(
    private registrationService: RegistrationService,
    private loginService: LoginService,
    private organizationUtil: OrganizationUtil,
  ) {}

  @Get('health')
  @ApiOperation({ summary: 'Health check endpoint' })
  healthCheck() {
    return {
      status: 'ok',
      message: 'Authentication service is running',
      timestamp: new Date().toISOString(),
    };
  }

  @Post('register')
  @ApiOperation({ summary: 'Register a new organization with admin user' })
  @ApiResponse({
    status: 201,
    description: 'Organization registered successfully',
    type: RegisterResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Bad request - validation errors or weak password',
  })
  @ApiResponse({
    status: 409,
    description: 'Conflict - email, username, or organization already exists',
  })
  async register(@Body() dto: RegisterOrganizationDto): Promise<RegisterResponseDto> {
    return this.registrationService.registerOrganization(dto);
  }

  @Get('check-availability')
  @ApiOperation({ summary: 'Check availability of email, username, or organization name' })
  @ApiQuery({ name: 'email', required: false, description: 'Email to check' })
  @ApiQuery({ name: 'username', required: false, description: 'Username to check' })
  @ApiQuery({ name: 'organizationName', required: false, description: 'Organization name to check' })
  @ApiResponse({
    status: 200,
    description: 'Availability check results',
    schema: {
      type: 'object',
      properties: {
        email: { type: 'boolean', description: 'True if email is available' },
        username: { type: 'boolean', description: 'True if username is available' },
        organizationName: { type: 'boolean', description: 'True if organization name is available' },
      },
    },
  })
  async checkAvailability(
    @Query('email') email?: string,
    @Query('username') username?: string,
    @Query('organizationName') organizationName?: string,
  ) {
    const result: any = {};

    if (email) {
      result.email = await this.registrationService.isEmailAvailable(email);
    }

    if (username) {
      result.username = await this.registrationService.isUsernameAvailable(username);
    }

    if (organizationName) {
      result.organizationName = await this.registrationService.isOrganizationNameAvailable(organizationName);
    }

    return result;
  }

  @Get('validate-organization-code')
  @ApiOperation({ summary: 'Validate organization code format and availability' })
  @ApiQuery({ name: 'code', required: true, description: 'Organization code to validate' })
  @ApiResponse({
    status: 200,
    description: 'Code validation results',
    schema: {
      type: 'object',
      properties: {
        isValid: { type: 'boolean', description: 'True if code format is valid' },
        isAvailable: { type: 'boolean', description: 'True if code is available' },
        suggestedCode: { type: 'string', description: 'Suggested alternative code if not available' },
      },
    },
  })
  async validateOrganizationCode(@Query('code') code: string) {
    const isValid = this.organizationUtil.validateCodeFormat(code);
    const isAvailable = isValid ? !(await this.organizationUtil['codeExists'](code)) : false;
    
    let suggestedCode: string | undefined;
    if (!isAvailable && isValid) {
      // Generate a suggestion based on the provided code
      try {
        suggestedCode = await this.organizationUtil.generateUniqueCode(code.replace(/_/g, ' '));
      } catch (error) {
        // If generation fails, provide a simple suggestion
        suggestedCode = `${code}_${Math.floor(Math.random() * 1000)}`;
      }
    }

    return {
      isValid,
      isAvailable,
      ...(suggestedCode && { suggestedCode }),
    };
  }

  @Post('login')
  @ApiOperation({ summary: 'Login with email and password' })
  @ApiResponse({
    status: 200,
    description: 'Login successful',
    type: LoginResponseDto,
  })
  @ApiResponse({
    status: 401,
    description: 'Invalid credentials',
  })
  @ApiResponse({
    status: 403,
    description: 'Account locked or inactive',
  })
  @ApiResponse({
    status: 429,
    description: 'Too many requests - rate limited',
  })
  async login(
    @Body() dto: LoginDto,
    @Req() req: Request,
    @Ip() ip: string,
  ): Promise<LoginResponseDto> {
    const userAgent = req.headers['user-agent'] || 'Unknown';
    return this.loginService.login(dto, ip, userAgent);
  }

  @Post('refresh')
  @ApiOperation({ summary: 'Refresh access token using refresh token' })
  @ApiResponse({
    status: 200,
    description: 'Token refreshed successfully',
    type: RefreshTokenResponseDto,
  })
  @ApiResponse({
    status: 401,
    description: 'Invalid refresh token',
  })
  async refreshToken(@Body() dto: RefreshTokenDto): Promise<RefreshTokenResponseDto> {
    return this.loginService.refreshToken(dto);
  }

  @Post('logout')
  @ApiOperation({ summary: 'Logout from current session' })
  @ApiResponse({
    status: 200,
    description: 'Logout successful',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        message: { type: 'string' },
      },
    },
  })
  async logout(
    @Body() body: { sessionId: string; accessToken: string },
  ) {
    return this.loginService.logout(body.sessionId, body.accessToken);
  }

  @Post('logout-all')
  @ApiOperation({ summary: 'Logout from all devices' })
  @ApiResponse({
    status: 200,
    description: 'Logged out from all devices successfully',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        message: { type: 'string' },
      },
    },
  })
  async logoutFromAllDevices(
    @Body() body: { userId: string },
  ) {
    return this.loginService.logoutFromAllDevices(body.userId);
  }
}