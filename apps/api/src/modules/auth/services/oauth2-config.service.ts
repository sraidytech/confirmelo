import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PlatformType } from '@prisma/client';
import { OAuth2Config } from './oauth2.service';
import axios from 'axios';

export interface ConnectionTestResult {
  success: boolean;
  error?: string;
  details?: any;
}

@Injectable()
export class OAuth2ConfigService {
  private readonly logger = new Logger(OAuth2ConfigService.name);
  private readonly configs: Map<PlatformType, OAuth2Config> = new Map();

  constructor(
    private readonly configService: ConfigService,
  ) {
    this.initializeConfigs();
  }

  /**
   * Get OAuth2 configuration for a platform
   */
  async getConfig(platformType: PlatformType): Promise<OAuth2Config | null> {
    return this.configs.get(platformType) || null;
  }

  /**
   * Test a platform connection
   */
  async testConnection(connectionId: string, platformType: PlatformType): Promise<ConnectionTestResult> {
    try {
      switch (platformType) {
        case PlatformType.YOUCAN:
          return await this.testYoucanConnection(connectionId);
        case PlatformType.GOOGLE_SHEETS:
          return await this.testGoogleSheetsConnection(connectionId);
        case PlatformType.SHOPIFY:
          return await this.testShopifyConnection(connectionId);
        default:
          return {
            success: false,
            error: `Testing not implemented for platform: ${platformType}`,
          };
      }
    } catch (error) {
      this.logger.error('Connection test failed', {
        error: error.message,
        connectionId,
        platformType,
      });
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Initialize OAuth2 configurations for all platforms
   */
  private initializeConfigs(): void {
    // Youcan Shop OAuth2 Configuration
    const youcanConfig = this.createYoucanConfig();
    if (youcanConfig) {
      this.configs.set(PlatformType.YOUCAN, youcanConfig);
      this.logger.log('Youcan OAuth2 configuration loaded');
    }

    // Google Sheets OAuth2 Configuration
    const googleConfig = this.createGoogleSheetsConfig();
    if (googleConfig) {
      this.configs.set(PlatformType.GOOGLE_SHEETS, googleConfig);
      this.logger.log('Google Sheets OAuth2 configuration loaded');
    }

    // Shopify OAuth2 Configuration
    const shopifyConfig = this.createShopifyConfig();
    if (shopifyConfig) {
      this.configs.set(PlatformType.SHOPIFY, shopifyConfig);
      this.logger.log('Shopify OAuth2 configuration loaded');
    }

    this.logger.log(`Loaded OAuth2 configurations for ${this.configs.size} platforms`);
  }

  /**
   * Create Youcan Shop OAuth2 configuration
   */
  private createYoucanConfig(): OAuth2Config | null {
    const clientId = this.configService.get<string>('YOUCAN_CLIENT_ID');
    const clientSecret = this.configService.get<string>('YOUCAN_CLIENT_SECRET');
    const redirectUri = this.configService.get<string>('YOUCAN_REDIRECT_URI');

    if (!clientId || !clientSecret || !redirectUri) {
      this.logger.warn('Youcan OAuth2 configuration incomplete - missing required environment variables');
      return null;
    }

    return {
      clientId,
      clientSecret,
      redirectUri,
      authorizationUrl: 'https://youcan.shop/oauth/authorize',
      tokenUrl: 'https://youcan.shop/oauth/token',
      scopes: [
        'read_orders',
        'write_orders',
        'read_products',
        'write_products',
        'read_customers',
        'write_customers',
      ],
      usePKCE: true, // Enhanced security with PKCE
    };
  }

  /**
   * Create Google Sheets OAuth2 configuration
   */
  private createGoogleSheetsConfig(): OAuth2Config | null {
    const clientId = this.configService.get<string>('GOOGLE_CLIENT_ID');
    const clientSecret = this.configService.get<string>('GOOGLE_CLIENT_SECRET');
    const redirectUri = this.configService.get<string>('GOOGLE_REDIRECT_URI');

    if (!clientId || !clientSecret || !redirectUri) {
      this.logger.warn('Google OAuth2 configuration incomplete - missing required environment variables');
      return null;
    }

    return {
      clientId,
      clientSecret,
      redirectUri,
      authorizationUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
      tokenUrl: 'https://oauth2.googleapis.com/token',
      scopes: [
        'https://www.googleapis.com/auth/spreadsheets',
        'https://www.googleapis.com/auth/drive.readonly',
      ],
      usePKCE: true,
    };
  }

  /**
   * Create Shopify OAuth2 configuration
   */
  private createShopifyConfig(): OAuth2Config | null {
    const clientId = this.configService.get<string>('SHOPIFY_CLIENT_ID');
    const clientSecret = this.configService.get<string>('SHOPIFY_CLIENT_SECRET');
    const redirectUri = this.configService.get<string>('SHOPIFY_REDIRECT_URI');

    if (!clientId || !clientSecret || !redirectUri) {
      this.logger.warn('Shopify OAuth2 configuration incomplete - missing required environment variables');
      return null;
    }

    // Note: Shopify OAuth URLs are shop-specific, this is a template
    return {
      clientId,
      clientSecret,
      redirectUri,
      authorizationUrl: 'https://{shop}.myshopify.com/admin/oauth/authorize',
      tokenUrl: 'https://{shop}.myshopify.com/admin/oauth/access_token',
      scopes: [
        'read_orders',
        'write_orders',
        'read_products',
        'write_products',
        'read_customers',
        'write_customers',
      ],
      usePKCE: false, // Shopify doesn't support PKCE
    };
  }

  /**
   * Test Youcan connection
   */
  private async testYoucanConnection(connectionId: string): Promise<ConnectionTestResult> {
    try {
      // For now, return a mock successful test
      // TODO: Implement actual Youcan API testing when needed
      return {
        success: true,
        details: {
          platform: 'Youcan Shop',
          apiVersion: 'v1',
          responseTime: 150,
          features: ['orders', 'products', 'customers'],
          note: 'Mock test - actual implementation pending',
        },
      };
    } catch (error) {
      return {
        success: false,
        error: `Youcan connection test failed: ${error.message}`,
      };
    }
  }

  /**
   * Test Google Sheets connection
   */
  private async testGoogleSheetsConnection(connectionId: string): Promise<ConnectionTestResult> {
    try {
      // This would be implemented with actual Google Sheets API calls
      // For now, return a mock successful test
      return {
        success: true,
        details: {
          platform: 'Google Sheets',
          apiVersion: 'v4',
          responseTime: 200,
          features: ['read_sheets', 'write_sheets'],
        },
      };
    } catch (error) {
      return {
        success: false,
        error: `Google Sheets connection test failed: ${error.message}`,
      };
    }
  }

  /**
   * Test Shopify connection
   */
  private async testShopifyConnection(connectionId: string): Promise<ConnectionTestResult> {
    try {
      // This would be implemented with actual Shopify API calls
      // For now, return a mock successful test
      return {
        success: true,
        details: {
          platform: 'Shopify',
          apiVersion: '2023-10',
          responseTime: 180,
          features: ['orders', 'products', 'customers'],
        },
      };
    } catch (error) {
      return {
        success: false,
        error: `Shopify connection test failed: ${error.message}`,
      };
    }
  }

  /**
   * Get available platforms with their configuration status
   */
  getAvailablePlatforms(): Array<{
    platformType: PlatformType;
    configured: boolean;
    scopes: string[];
  }> {
    const allPlatforms = [
      PlatformType.YOUCAN,
      PlatformType.GOOGLE_SHEETS,
      PlatformType.SHOPIFY,
    ];

    return allPlatforms.map(platformType => {
      const config = this.configs.get(platformType);
      return {
        platformType,
        configured: !!config,
        scopes: config?.scopes || [],
      };
    });
  }

  /**
   * Validate platform configuration
   */
  validatePlatformConfig(platformType: PlatformType): boolean {
    const config = this.configs.get(platformType);
    if (!config) {
      return false;
    }

    // Validate required fields
    return !!(
      config.clientId &&
      config.clientSecret &&
      config.redirectUri &&
      config.authorizationUrl &&
      config.tokenUrl &&
      config.scopes &&
      config.scopes.length > 0
    );
  }

  /**
   * Get platform-specific authorization URL template
   */
  getAuthorizationUrlTemplate(platformType: PlatformType, shopDomain?: string): string {
    const config = this.configs.get(platformType);
    if (!config) {
      throw new BadRequestException(`Platform ${platformType} not configured`);
    }

    let authUrl = config.authorizationUrl;

    // Handle shop-specific URLs (like Shopify)
    if (shopDomain && authUrl.includes('{shop}')) {
      authUrl = authUrl.replace('{shop}', shopDomain);
    }

    return authUrl;
  }

  /**
   * Get platform-specific token URL template
   */
  getTokenUrlTemplate(platformType: PlatformType, shopDomain?: string): string {
    const config = this.configs.get(platformType);
    if (!config) {
      throw new BadRequestException(`Platform ${platformType} not configured`);
    }

    let tokenUrl = config.tokenUrl;

    // Handle shop-specific URLs (like Shopify)
    if (shopDomain && tokenUrl.includes('{shop}')) {
      tokenUrl = tokenUrl.replace('{shop}', shopDomain);
    }

    return tokenUrl;
  }
}