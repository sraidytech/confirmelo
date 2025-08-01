import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  Query,
  UseGuards,
  Logger,
  BadRequestException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { Roles } from '../../../common/decorators/roles.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { YoucanOAuth2Service } from '../services/youcan-oauth2.service';
import { UserRole } from '@prisma/client';

export class InitiateYoucanOAuth2Dto {
  shopDomain?: string;
}

export class CompleteYoucanOAuth2Dto {
  code: string;
  state: string;
  error?: string;
  error_description?: string;
}

export class YoucanAuthorizationResponseDto {
  authorizationUrl: string;
  state: string;
}

export class YoucanConnectionResponseDto {
  connectionId: string;
  shopInfo: {
    id: string;
    name: string;
    domain: string;
    email: string;
    currency: string;
    timezone: string;
    plan: string;
    status: string;
  };
}

export class YoucanOrdersQueryDto {
  page?: number;
  limit?: number;
  status?: string;
  dateFrom?: string;
  dateTo?: string;
}

export class UpdateYoucanOrderDto {
  status: string;
  notes?: string;
}

@ApiTags('Youcan Shop OAuth2')
@Controller('auth/oauth2/youcan')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class YoucanOAuth2Controller {
  private readonly logger = new Logger(YoucanOAuth2Controller.name);

  constructor(private readonly youcanOAuth2Service: YoucanOAuth2Service) {}

  @Post('initiate')
  @ApiOperation({
    summary: 'Initiate Youcan Shop OAuth2 authorization',
    description: 'Generate authorization URL for Youcan Shop integration',
  })
  @ApiResponse({
    status: 200,
    description: 'Authorization URL generated successfully',
    type: YoucanAuthorizationResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid request or Youcan not configured',
  })
  @ApiResponse({
    status: 403,
    description: 'Insufficient permissions',
  })
  @Roles(UserRole.ADMIN, UserRole.TEAM_LEADER, UserRole.CLIENT_ADMIN)
  async initiateYoucanOAuth2(
    @Body() dto: InitiateYoucanOAuth2Dto,
    @CurrentUser() user: any,
  ): Promise<YoucanAuthorizationResponseDto> {
    try {
      this.logger.log('Initiating Youcan OAuth2 flow', {
        userId: user.id,
        organizationId: user.organizationId,
        shopDomain: dto.shopDomain,
      });

      const result = await this.youcanOAuth2Service.initiateYoucanAuthorization(
        user.id,
        user.organizationId,
        dto.shopDomain,
      );

      return result;
    } catch (error) {
      this.logger.error('Failed to initiate Youcan OAuth2 flow', {
        error: error.message,
        userId: user.id,
        shopDomain: dto.shopDomain,
      });
      throw error;
    }
  }

  @Post('complete')
  @ApiOperation({
    summary: 'Complete Youcan Shop OAuth2 authorization',
    description: 'Exchange authorization code for access token and store Youcan connection',
  })
  @ApiResponse({
    status: 200,
    description: 'Youcan connection established successfully',
    type: YoucanConnectionResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid authorization code or state',
  })
  @ApiResponse({
    status: 401,
    description: 'Authorization failed or expired',
  })
  @Roles(UserRole.ADMIN, UserRole.TEAM_LEADER, UserRole.CLIENT_ADMIN)
  async completeYoucanOAuth2(
    @Body() dto: CompleteYoucanOAuth2Dto,
    @CurrentUser() user: any,
  ): Promise<YoucanConnectionResponseDto> {
    try {
      // Handle OAuth2 errors
      if (dto.error) {
        this.logger.warn('Youcan OAuth2 authorization error', {
          error: dto.error,
          description: dto.error_description,
          userId: user.id,
        });
        throw new BadRequestException(
          `Youcan authorization failed: ${dto.error_description || dto.error}`,
        );
      }

      this.logger.log('Completing Youcan OAuth2 flow', {
        userId: user.id,
        state: dto.state,
      });

      const result = await this.youcanOAuth2Service.completeYoucanAuthorization(
        dto.code,
        dto.state,
        user.id,
        user.organizationId,
      );

      return result;
    } catch (error) {
      this.logger.error('Failed to complete Youcan OAuth2 flow', {
        error: error.message,
        userId: user.id,
        state: dto.state,
      });
      throw error;
    }
  }

  @Post('connections/:id/test')
  @ApiOperation({
    summary: 'Test Youcan Shop connection',
    description: 'Test if the Youcan Shop connection is working properly',
  })
  @ApiParam({ name: 'id', description: 'Connection ID' })
  @ApiResponse({
    status: 200,
    description: 'Connection test completed',
  })
  @ApiResponse({
    status: 404,
    description: 'Connection not found',
  })
  @Roles(UserRole.ADMIN, UserRole.TEAM_LEADER, UserRole.CLIENT_ADMIN, UserRole.CLIENT_USER)
  async testYoucanConnection(
    @Param('id') connectionId: string,
    @CurrentUser() user: any,
  ): Promise<any> {
    try {
      this.logger.log('Testing Youcan connection', {
        connectionId,
        userId: user.id,
      });

      const result = await this.youcanOAuth2Service.testYoucanConnection(connectionId);

      return {
        ...result,
        testedAt: new Date(),
      };
    } catch (error) {
      this.logger.error('Failed to test Youcan connection', {
        error: error.message,
        connectionId,
        userId: user.id,
      });

      return {
        success: false,
        error: error.message,
        testedAt: new Date(),
      };
    }
  }

  @Post('connections/:id/refresh')
  @ApiOperation({
    summary: 'Refresh Youcan Shop access token',
    description: 'Refresh the access token for a Youcan Shop connection',
  })
  @ApiParam({ name: 'id', description: 'Connection ID' })
  @ApiResponse({
    status: 200,
    description: 'Token refreshed successfully',
  })
  @ApiResponse({
    status: 404,
    description: 'Connection not found',
  })
  @ApiResponse({
    status: 401,
    description: 'Token refresh failed',
  })
  @Roles(UserRole.ADMIN, UserRole.TEAM_LEADER, UserRole.CLIENT_ADMIN)
  async refreshYoucanToken(
    @Param('id') connectionId: string,
    @CurrentUser() user: any,
  ): Promise<{ message: string; refreshedAt: Date }> {
    try {
      this.logger.log('Refreshing Youcan token', {
        connectionId,
        userId: user.id,
      });

      await this.youcanOAuth2Service.refreshYoucanToken(connectionId);

      return {
        message: 'Token refreshed successfully',
        refreshedAt: new Date(),
      };
    } catch (error) {
      this.logger.error('Failed to refresh Youcan token', {
        error: error.message,
        connectionId,
        userId: user.id,
      });
      throw error;
    }
  }

  @Get('connections/:id/orders')
  @ApiOperation({
    summary: 'Get Youcan Shop orders',
    description: 'Retrieve orders from Youcan Shop with pagination and filtering',
  })
  @ApiParam({ name: 'id', description: 'Connection ID' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'status', required: false, type: String })
  @ApiQuery({ name: 'dateFrom', required: false, type: String })
  @ApiQuery({ name: 'dateTo', required: false, type: String })
  @ApiResponse({
    status: 200,
    description: 'Orders retrieved successfully',
  })
  @ApiResponse({
    status: 404,
    description: 'Connection not found',
  })
  @Roles(UserRole.ADMIN, UserRole.TEAM_LEADER, UserRole.CLIENT_ADMIN, UserRole.CLIENT_USER)
  async getYoucanOrders(
    @Param('id') connectionId: string,
    @Query() query: YoucanOrdersQueryDto,
    @CurrentUser() user: any,
  ): Promise<any> {
    try {
      this.logger.log('Getting Youcan orders', {
        connectionId,
        userId: user.id,
        query,
      });

      // Get access token for the connection
      const accessToken = await this.youcanOAuth2Service['oauth2Service'].getAccessToken(connectionId);

      // Fetch orders from Youcan API
      const orders = await this.youcanOAuth2Service.getYoucanOrders(accessToken, {
        page: query.page || 1,
        limit: Math.min(query.limit || 20, 100),
        status: query.status,
        dateFrom: query.dateFrom,
        dateTo: query.dateTo,
      });

      return orders;
    } catch (error) {
      this.logger.error('Failed to get Youcan orders', {
        error: error.message,
        connectionId,
        userId: user.id,
      });
      throw error;
    }
  }

  @Post('connections/:id/orders/:orderId/status')
  @ApiOperation({
    summary: 'Update Youcan Shop order status',
    description: 'Update the status of a specific order in Youcan Shop',
  })
  @ApiParam({ name: 'id', description: 'Connection ID' })
  @ApiParam({ name: 'orderId', description: 'Order ID' })
  @ApiResponse({
    status: 200,
    description: 'Order status updated successfully',
  })
  @ApiResponse({
    status: 404,
    description: 'Connection or order not found',
  })
  @Roles(UserRole.ADMIN, UserRole.TEAM_LEADER, UserRole.CALL_CENTER_AGENT, UserRole.FOLLOWUP_AGENT)
  async updateYoucanOrderStatus(
    @Param('id') connectionId: string,
    @Param('orderId') orderId: string,
    @Body() dto: UpdateYoucanOrderDto,
    @CurrentUser() user: any,
  ): Promise<any> {
    try {
      this.logger.log('Updating Youcan order status', {
        connectionId,
        orderId,
        status: dto.status,
        userId: user.id,
      });

      // Get access token for the connection
      const accessToken = await this.youcanOAuth2Service['oauth2Service'].getAccessToken(connectionId);

      // Update order status in Youcan
      const result = await this.youcanOAuth2Service.updateYoucanOrderStatus(
        accessToken,
        orderId,
        dto.status,
        dto.notes,
      );

      return result;
    } catch (error) {
      this.logger.error('Failed to update Youcan order status', {
        error: error.message,
        connectionId,
        orderId,
        status: dto.status,
        userId: user.id,
      });
      throw error;
    }
  }

  @Get('connections/:id/shop')
  @ApiOperation({
    summary: 'Get Youcan Shop information',
    description: 'Retrieve shop information from Youcan Shop',
  })
  @ApiParam({ name: 'id', description: 'Connection ID' })
  @ApiResponse({
    status: 200,
    description: 'Shop information retrieved successfully',
  })
  @ApiResponse({
    status: 404,
    description: 'Connection not found',
  })
  @Roles(UserRole.ADMIN, UserRole.TEAM_LEADER, UserRole.CLIENT_ADMIN, UserRole.CLIENT_USER)
  async getYoucanShopInfo(
    @Param('id') connectionId: string,
    @CurrentUser() user: any,
  ): Promise<any> {
    try {
      this.logger.log('Getting Youcan shop info', {
        connectionId,
        userId: user.id,
      });

      // Get access token for the connection
      const accessToken = await this.youcanOAuth2Service['oauth2Service'].getAccessToken(connectionId);

      // Get shop information
      const shopInfo = await this.youcanOAuth2Service.getYoucanShopInfo(accessToken);

      return {
        success: true,
        data: shopInfo,
      };
    } catch (error) {
      this.logger.error('Failed to get Youcan shop info', {
        error: error.message,
        connectionId,
        userId: user.id,
      });
      throw error;
    }
  }

  @Get('connections/:id/orders/summary')
  @ApiOperation({
    summary: 'Get Youcan Shop order summary',
    description: 'Retrieve order summary statistics from Youcan Shop',
  })
  @ApiParam({ name: 'id', description: 'Connection ID' })
  @ApiResponse({
    status: 200,
    description: 'Order summary retrieved successfully',
  })
  @ApiResponse({
    status: 404,
    description: 'Connection not found',
  })
  @Roles(UserRole.ADMIN, UserRole.TEAM_LEADER, UserRole.CLIENT_ADMIN, UserRole.CLIENT_USER)
  async getYoucanOrderSummary(
    @Param('id') connectionId: string,
    @CurrentUser() user: any,
  ): Promise<any> {
    try {
      this.logger.log('Getting Youcan order summary', {
        connectionId,
        userId: user.id,
      });

      // Get access token for the connection
      const accessToken = await this.youcanOAuth2Service['oauth2Service'].getAccessToken(connectionId);

      // Get order summary
      const orderSummary = await this.youcanOAuth2Service.getYoucanOrderSummary(accessToken);

      return {
        success: true,
        data: orderSummary,
      };
    } catch (error) {
      this.logger.error('Failed to get Youcan order summary', {
        error: error.message,
        connectionId,
        userId: user.id,
      });
      throw error;
    }
  }
}