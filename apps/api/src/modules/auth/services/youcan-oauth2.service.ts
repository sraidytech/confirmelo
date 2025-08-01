import { Injectable, Logger, BadRequestException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../common/database/prisma.service';
import { OAuth2Service, OAuth2Config } from './oauth2.service';
import { OAuth2ConfigService } from './oauth2-config.service';
import axios, { AxiosInstance } from 'axios';
import { PlatformType, ConnectionStatus } from '@prisma/client';

export interface YoucanShopInfo {
  id: string;
  name: string;
  domain: string;
  email: string;
  currency: string;
  timezone: string;
  plan: string;
  status: string;
}

export interface YoucanOrderSummary {
  total_orders: number;
  pending_orders: number;
  confirmed_orders: number;
  cancelled_orders: number;
}

export interface YoucanApiResponse<T = any> {
  success: boolean;
  data: T;
  message?: string;
  errors?: string[];
}

@Injectable()
export class YoucanOAuth2Service {
  private readonly logger = new Logger(YoucanOAuth2Service.name);
  private readonly youcanApiClient: AxiosInstance;

  constructor(
    private readonly configService: ConfigService,
    private readonly prismaService: PrismaService,
    private readonly oauth2Service: OAuth2Service,
    private readonly oauth2ConfigService: OAuth2ConfigService,
  ) {
    // Initialize Youcan API client
    this.youcanApiClient = axios.create({
      baseURL: 'https://youcan.shop/api/v1',
      timeout: 30000,
      headers: {
        'User-Agent': 'Confirmelo-Youcan-Client/1.0',
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
    });

    this.setupYoucanApiInterceptors();
  }

  /**
   * Initiate Youcan Shop OAuth2 authorization
   */
  async initiateYoucanAuthorization(
    userId: string,
    organizationId: string,
    shopDomain?: string,
  ): Promise<{
    authorizationUrl: string;
    state: string;
  }> {
    try {
      this.logger.log('Initiating Youcan OAuth2 authorization', {
        userId,
        organizationId,
        shopDomain,
      });

      // Get Youcan OAuth2 configuration
      const config = await this.oauth2ConfigService.getConfig(PlatformType.YOUCAN);
      
      if (!config) {
        throw new BadRequestException('Youcan OAuth2 not configured');
      }

      // Check for existing active connection
      const existingConnection = await this.prismaService.platformConnection.findFirst({
        where: {
          userId,
          organizationId,
          platformType: PlatformType.YOUCAN,
          status: ConnectionStatus.ACTIVE,
          ...(shopDomain && { 
            platformData: {
              path: ['shop_domain'],
              equals: shopDomain,
            },
          }),
        },
      });

      if (existingConnection) {
        throw new BadRequestException(
          `Active Youcan connection already exists${shopDomain ? ` for shop ${shopDomain}` : ''}`,
        );
      }

      // Generate authorization URL with PKCE
      const authRequest = await this.oauth2Service.generateAuthorizationUrl(
        PlatformType.YOUCAN,
        config,
        userId,
        organizationId,
      );

      this.logger.log('Generated Youcan authorization URL', {
        userId,
        organizationId,
        state: authRequest.state,
        shopDomain,
      });

      return {
        authorizationUrl: authRequest.authorizationUrl,
        state: authRequest.state,
      };
    } catch (error) {
      this.logger.error('Failed to initiate Youcan authorization', {
        error: error.message,
        userId,
        organizationId,
        shopDomain,
      });
      throw error;
    }
  }

  /**
   * Complete Youcan Shop OAuth2 authorization
   */
  async completeYoucanAuthorization(
    code: string,
    state: string,
    userId: string,
    organizationId: string,
  ): Promise<{
    connectionId: string;
    shopInfo: YoucanShopInfo;
  }> {
    try {
      this.logger.log('Completing Youcan OAuth2 authorization', {
        userId,
        organizationId,
        state,
      });

      // Get Youcan OAuth2 configuration
      const config = await this.oauth2ConfigService.getConfig(PlatformType.YOUCAN);
      
      // Exchange code for token
      const { tokenResponse, stateData } = await this.oauth2Service.exchangeCodeForToken(
        code,
        state,
        config,
      );

      // Verify state data matches current user
      if (stateData.userId !== userId || stateData.organizationId !== organizationId) {
        throw new UnauthorizedException('State validation failed - user mismatch');
      }

      // Get shop information using the access token
      const shopInfo = await this.getYoucanShopInfo(tokenResponse.access_token);

      // Store the connection with shop information
      const connectionId = await this.oauth2Service.storeConnection(
        userId,
        organizationId,
        PlatformType.YOUCAN,
        `Youcan Shop - ${shopInfo.name}`,
        tokenResponse,
        config.scopes,
        {
          shop_id: shopInfo.id,
          shop_name: shopInfo.name,
          shop_domain: shopInfo.domain,
          shop_email: shopInfo.email,
          shop_currency: shopInfo.currency,
          shop_timezone: shopInfo.timezone,
          shop_plan: shopInfo.plan,
          shop_status: shopInfo.status,
          api_version: 'v1',
          connected_at: new Date().toISOString(),
        },
      );

      this.logger.log('Completed Youcan OAuth2 authorization', {
        connectionId,
        userId,
        organizationId,
        shopId: shopInfo.id,
        shopName: shopInfo.name,
        shopDomain: shopInfo.domain,
      });

      return {
        connectionId,
        shopInfo,
      };
    } catch (error) {
      this.logger.error('Failed to complete Youcan authorization', {
        error: error.message,
        userId,
        organizationId,
        state,
      });
      throw error;
    }
  }

  /**
   * Test Youcan Shop connection
   */
  async testYoucanConnection(connectionId: string): Promise<{
    success: boolean;
    error?: string;
    details?: any;
  }> {
    try {
      this.logger.log('Testing Youcan connection', { connectionId });

      // Get connection details
      const connection = await this.prismaService.platformConnection.findUnique({
        where: { id: connectionId },
      });

      if (!connection || connection.platformType !== PlatformType.YOUCAN) {
        throw new Error('Youcan connection not found');
      }

      if (connection.status !== ConnectionStatus.ACTIVE) {
        throw new Error(`Connection is not active (status: ${connection.status})`);
      }

      // Get access token (this will handle refresh if needed)
      const accessToken = await this.oauth2Service.getAccessToken(connectionId);

      // Test API calls
      const [shopInfo, orderSummary] = await Promise.all([
        this.getYoucanShopInfo(accessToken),
        this.getYoucanOrderSummary(accessToken),
      ]);

      // Update last sync time
      await this.prismaService.platformConnection.update({
        where: { id: connectionId },
        data: {
          lastSyncAt: new Date(),
          syncCount: { increment: 1 },
        },
      });

      this.logger.log('Youcan connection test successful', {
        connectionId,
        shopId: shopInfo.id,
        shopName: shopInfo.name,
        totalOrders: orderSummary.total_orders,
      });

      return {
        success: true,
        details: {
          platform: 'Youcan Shop',
          apiVersion: 'v1',
          responseTime: Date.now(), // This would be calculated properly in real implementation
          shop: {
            id: shopInfo.id,
            name: shopInfo.name,
            domain: shopInfo.domain,
            status: shopInfo.status,
            plan: shopInfo.plan,
          },
          orders: orderSummary,
          features: [
            'read_orders',
            'write_orders',
            'read_products',
            'write_products',
            'read_customers',
            'write_customers',
          ],
          lastTested: new Date().toISOString(),
        },
      };
    } catch (error) {
      this.logger.error('Youcan connection test failed', {
        error: error.message,
        connectionId,
      });

      // Update connection with error information
      await this.prismaService.platformConnection.update({
        where: { id: connectionId },
        data: {
          lastErrorAt: new Date(),
          lastErrorMessage: error.message,
          ...(error.message.includes('token') && {
            status: ConnectionStatus.EXPIRED,
          }),
        },
      });

      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Get Youcan shop information
   */
  async getYoucanShopInfo(accessToken: string): Promise<YoucanShopInfo> {
    try {
      const response = await this.youcanApiClient.get('/shop', {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      if (!response.data.success) {
        throw new Error(`Youcan API error: ${response.data.message || 'Unknown error'}`);
      }

      const shopData = response.data.data;

      return {
        id: shopData.id,
        name: shopData.name,
        domain: shopData.domain,
        email: shopData.email,
        currency: shopData.currency || 'MAD',
        timezone: shopData.timezone || 'Africa/Casablanca',
        plan: shopData.plan || 'basic',
        status: shopData.status || 'active',
      };
    } catch (error) {
      this.logger.error('Failed to get Youcan shop info', {
        error: error.message,
        status: error.response?.status,
        data: error.response?.data,
      });
      throw new Error(`Failed to get shop information: ${error.message}`);
    }
  }

  /**
   * Get Youcan order summary
   */
  async getYoucanOrderSummary(accessToken: string): Promise<YoucanOrderSummary> {
    try {
      const response = await this.youcanApiClient.get('/orders/summary', {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      if (!response.data.success) {
        throw new Error(`Youcan API error: ${response.data.message || 'Unknown error'}`);
      }

      const summaryData = response.data.data;

      return {
        total_orders: summaryData.total_orders || 0,
        pending_orders: summaryData.pending_orders || 0,
        confirmed_orders: summaryData.confirmed_orders || 0,
        cancelled_orders: summaryData.cancelled_orders || 0,
      };
    } catch (error) {
      this.logger.error('Failed to get Youcan order summary', {
        error: error.message,
        status: error.response?.status,
        data: error.response?.data,
      });
      
      // Return default summary if API call fails
      return {
        total_orders: 0,
        pending_orders: 0,
        confirmed_orders: 0,
        cancelled_orders: 0,
      };
    }
  }

  /**
   * Get Youcan orders with pagination
   */
  async getYoucanOrders(
    accessToken: string,
    options: {
      page?: number;
      limit?: number;
      status?: string;
      dateFrom?: string;
      dateTo?: string;
    } = {},
  ): Promise<YoucanApiResponse> {
    try {
      const params = new URLSearchParams();
      
      if (options.page) params.append('page', options.page.toString());
      if (options.limit) params.append('limit', Math.min(options.limit, 100).toString());
      if (options.status) params.append('status', options.status);
      if (options.dateFrom) params.append('date_from', options.dateFrom);
      if (options.dateTo) params.append('date_to', options.dateTo);

      const response = await this.youcanApiClient.get(`/orders?${params.toString()}`, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      return response.data;
    } catch (error) {
      this.logger.error('Failed to get Youcan orders', {
        error: error.message,
        options,
        status: error.response?.status,
        data: error.response?.data,
      });
      throw new Error(`Failed to get orders: ${error.message}`);
    }
  }

  /**
   * Update Youcan order status
   */
  async updateYoucanOrderStatus(
    accessToken: string,
    orderId: string,
    status: string,
    notes?: string,
  ): Promise<YoucanApiResponse> {
    try {
      const response = await this.youcanApiClient.put(`/orders/${orderId}/status`, {
        status,
        notes,
      }, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      this.logger.log('Updated Youcan order status', {
        orderId,
        status,
        success: response.data.success,
      });

      return response.data;
    } catch (error) {
      this.logger.error('Failed to update Youcan order status', {
        error: error.message,
        orderId,
        status,
        responseStatus: error.response?.status,
        responseData: error.response?.data,
      });
      throw new Error(`Failed to update order status: ${error.message}`);
    }
  }

  /**
   * Refresh Youcan connection token
   */
  async refreshYoucanToken(connectionId: string): Promise<void> {
    try {
      this.logger.log('Refreshing Youcan token', { connectionId });

      const config = await this.oauth2ConfigService.getConfig(PlatformType.YOUCAN);
      
      if (!config) {
        throw new Error('Youcan OAuth2 configuration not found');
      }

      await this.oauth2Service.refreshAccessToken(connectionId, config);

      this.logger.log('Successfully refreshed Youcan token', { connectionId });
    } catch (error) {
      this.logger.error('Failed to refresh Youcan token', {
        error: error.message,
        connectionId,
      });
      throw error;
    }
  }

  /**
   * Validate Youcan webhook signature
   */
  validateYoucanWebhook(payload: string, signature: string, secret: string): boolean {
    try {
      const crypto = require('crypto');
      const expectedSignature = crypto
        .createHmac('sha256', secret)
        .update(payload)
        .digest('hex');

      return crypto.timingSafeEqual(
        Buffer.from(signature),
        Buffer.from(expectedSignature),
      );
    } catch (error) {
      this.logger.error('Failed to validate Youcan webhook', {
        error: error.message,
      });
      return false;
    }
  }

  /**
   * Setup Youcan API client interceptors
   */
  private setupYoucanApiInterceptors(): void {
    // Request interceptor
    this.youcanApiClient.interceptors.request.use(
      (config) => {
        this.logger.debug('Youcan API Request', {
          method: config.method?.toUpperCase(),
          url: config.url,
          params: config.params,
        });
        return config;
      },
      (error) => {
        this.logger.error('Youcan API Request Error', { error: error.message });
        return Promise.reject(error);
      },
    );

    // Response interceptor
    this.youcanApiClient.interceptors.response.use(
      (response) => {
        this.logger.debug('Youcan API Response', {
          status: response.status,
          url: response.config.url,
          success: response.data?.success,
        });
        return response;
      },
      (error) => {
        this.logger.error('Youcan API Response Error', {
          status: error.response?.status,
          url: error.config?.url,
          error: error.message,
          data: error.response?.data,
        });
        return Promise.reject(error);
      },
    );
  }
}