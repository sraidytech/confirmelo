import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { BadRequestException } from '@nestjs/common';
import { OAuth2ConfigService } from '../services/oauth2-config.service';
import { PlatformType } from '@prisma/client';

describe('OAuth2ConfigService', () => {
  let service: OAuth2ConfigService;
  let configService: jest.Mocked<ConfigService>;

  const mockEnvironmentVariables = {
    YOUCAN_CLIENT_ID: 'youcan-client-id',
    YOUCAN_CLIENT_SECRET: 'youcan-client-secret',
    YOUCAN_REDIRECT_URI: 'https://app.confirmelo.com/auth/youcan/callback',
    GOOGLE_CLIENT_ID: 'google-client-id',
    GOOGLE_CLIENT_SECRET: 'google-client-secret',
    GOOGLE_REDIRECT_URI: 'https://app.confirmelo.com/auth/google/callback',
    SHOPIFY_CLIENT_ID: 'shopify-client-id',
    SHOPIFY_CLIENT_SECRET: 'shopify-client-secret',
    SHOPIFY_REDIRECT_URI: 'https://app.confirmelo.com/auth/shopify/callback',
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OAuth2ConfigService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => mockEnvironmentVariables[key as keyof typeof mockEnvironmentVariables]),
          },
        },
      ],
    }).compile();

    service = module.get<OAuth2ConfigService>(OAuth2ConfigService);
    configService = module.get(ConfigService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getConfig', () => {
    it('should return Youcan configuration', async () => {
      const config = await service.getConfig(PlatformType.YOUCAN);

      expect(config).toBeDefined();
      expect(config?.clientId).toBe('youcan-client-id');
      expect(config?.clientSecret).toBe('youcan-client-secret');
      expect(config?.redirectUri).toBe('https://app.confirmelo.com/auth/youcan/callback');
      expect(config?.authorizationUrl).toBe('https://youcan.shop/oauth/authorize');
      expect(config?.tokenUrl).toBe('https://youcan.shop/oauth/token');
      expect(config?.usePKCE).toBe(true);
      expect(config?.scopes).toContain('read_orders');
      expect(config?.scopes).toContain('write_orders');
    });

    it('should return Google Sheets configuration', async () => {
      const config = await service.getConfig(PlatformType.GOOGLE_SHEETS);

      expect(config).toBeDefined();
      expect(config?.clientId).toBe('google-client-id');
      expect(config?.clientSecret).toBe('google-client-secret');
      expect(config?.redirectUri).toBe('https://app.confirmelo.com/auth/google/callback');
      expect(config?.authorizationUrl).toBe('https://accounts.google.com/o/oauth2/v2/auth');
      expect(config?.tokenUrl).toBe('https://oauth2.googleapis.com/token');
      expect(config?.usePKCE).toBe(true);
      expect(config?.scopes).toContain('https://www.googleapis.com/auth/spreadsheets');
    });

    it('should return Shopify configuration', async () => {
      const config = await service.getConfig(PlatformType.SHOPIFY);

      expect(config).toBeDefined();
      expect(config?.clientId).toBe('shopify-client-id');
      expect(config?.clientSecret).toBe('shopify-client-secret');
      expect(config?.redirectUri).toBe('https://app.confirmelo.com/auth/shopify/callback');
      expect(config?.authorizationUrl).toContain('{shop}');
      expect(config?.tokenUrl).toContain('{shop}');
      expect(config?.usePKCE).toBe(false);
      expect(config?.scopes).toContain('read_orders');
    });

    it('should return null for unconfigured platform', async () => {
      // Mock missing environment variables
      configService.get.mockReturnValue(undefined);
      
      // Create new service instance with missing config
      const moduleWithMissingConfig = await Test.createTestingModule({
        providers: [
          OAuth2ConfigService,
          {
            provide: ConfigService,
            useValue: configService,
          },
        ],
      }).compile();

      const serviceWithMissingConfig = moduleWithMissingConfig.get<OAuth2ConfigService>(OAuth2ConfigService);
      const config = await serviceWithMissingConfig.getConfig(PlatformType.YOUCAN);

      expect(config).toBeNull();
    });

    it('should return null for manual platform type', async () => {
      const config = await service.getConfig(PlatformType.MANUAL);
      expect(config).toBeNull();
    });
  });

  describe('testConnection', () => {
    const mockConnectionId = 'conn-123';

    it('should test Youcan connection successfully', async () => {
      const result = await service.testConnection(mockConnectionId, PlatformType.YOUCAN);

      expect(result.success).toBe(true);
      expect(result.details).toBeDefined();
      expect(result.details.platform).toBe('Youcan Shop');
      expect(result.details.features).toContain('orders');
    });

    it('should test Google Sheets connection successfully', async () => {
      const result = await service.testConnection(mockConnectionId, PlatformType.GOOGLE_SHEETS);

      expect(result.success).toBe(true);
      expect(result.details).toBeDefined();
      expect(result.details.platform).toBe('Google Sheets');
      expect(result.details.features).toContain('read_sheets');
    });

    it('should test Shopify connection successfully', async () => {
      const result = await service.testConnection(mockConnectionId, PlatformType.SHOPIFY);

      expect(result.success).toBe(true);
      expect(result.details).toBeDefined();
      expect(result.details.platform).toBe('Shopify');
      expect(result.details.features).toContain('orders');
    });

    it('should handle unsupported platform', async () => {
      const result = await service.testConnection(mockConnectionId, PlatformType.MANUAL);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Testing not implemented');
    });

    it('should handle connection test errors', async () => {
      // Mock an error in the test method
      jest.spyOn(service as any, 'testYoucanConnection').mockRejectedValue(new Error('API Error'));

      const result = await service.testConnection(mockConnectionId, PlatformType.YOUCAN);

      expect(result.success).toBe(false);
      expect(result.error).toContain('API Error');
    });
  });

  describe('getAvailablePlatforms', () => {
    it('should return all platforms with configuration status', () => {
      const platforms = service.getAvailablePlatforms();

      expect(platforms).toHaveLength(3);
      
      const youcanPlatform = platforms.find(p => p.platformType === PlatformType.YOUCAN);
      expect(youcanPlatform?.configured).toBe(true);
      expect(youcanPlatform?.scopes).toContain('read_orders');

      const googlePlatform = platforms.find(p => p.platformType === PlatformType.GOOGLE_SHEETS);
      expect(googlePlatform?.configured).toBe(true);
      expect(googlePlatform?.scopes).toContain('https://www.googleapis.com/auth/spreadsheets');

      const shopifyPlatform = platforms.find(p => p.platformType === PlatformType.SHOPIFY);
      expect(shopifyPlatform?.configured).toBe(true);
      expect(shopifyPlatform?.scopes).toContain('read_orders');
    });

    it('should show unconfigured platforms when environment variables are missing', async () => {
      // Create service with missing config
      const moduleWithMissingConfig = await Test.createTestingModule({
        providers: [
          OAuth2ConfigService,
          {
            provide: ConfigService,
            useValue: {
              get: jest.fn().mockReturnValue(undefined),
            },
          },
        ],
      }).compile();

      const serviceWithMissingConfig = moduleWithMissingConfig.get<OAuth2ConfigService>(OAuth2ConfigService);
      const platforms = serviceWithMissingConfig.getAvailablePlatforms();

      expect(platforms).toHaveLength(3);
      platforms.forEach(platform => {
        expect(platform.configured).toBe(false);
        expect(platform.scopes).toEqual([]);
      });
    });
  });

  describe('validatePlatformConfig', () => {
    it('should validate configured platforms as true', () => {
      expect(service.validatePlatformConfig(PlatformType.YOUCAN)).toBe(true);
      expect(service.validatePlatformConfig(PlatformType.GOOGLE_SHEETS)).toBe(true);
      expect(service.validatePlatformConfig(PlatformType.SHOPIFY)).toBe(true);
    });

    it('should validate unconfigured platforms as false', () => {
      expect(service.validatePlatformConfig(PlatformType.MANUAL)).toBe(false);
    });

    it('should validate incomplete configurations as false', async () => {
      // Create service with incomplete config
      const moduleWithIncompleteConfig = await Test.createTestingModule({
        providers: [
          OAuth2ConfigService,
          {
            provide: ConfigService,
            useValue: {
              get: jest.fn((key: string) => {
                // Only provide client ID, missing other required fields
                if (key === 'YOUCAN_CLIENT_ID') return 'client-id';
                return undefined;
              }),
            },
          },
        ],
      }).compile();

      const serviceWithIncompleteConfig = moduleWithIncompleteConfig.get<OAuth2ConfigService>(OAuth2ConfigService);
      expect(serviceWithIncompleteConfig.validatePlatformConfig(PlatformType.YOUCAN)).toBe(false);
    });
  });

  describe('getAuthorizationUrlTemplate', () => {
    it('should return authorization URL for regular platforms', () => {
      const url = service.getAuthorizationUrlTemplate(PlatformType.YOUCAN);
      expect(url).toBe('https://youcan.shop/oauth/authorize');
    });

    it('should handle shop-specific URLs for Shopify', () => {
      const url = service.getAuthorizationUrlTemplate(PlatformType.SHOPIFY, 'mystore');
      expect(url).toBe('https://mystore.myshopify.com/admin/oauth/authorize');
    });

    it('should throw error for unconfigured platform', () => {
      expect(() => {
        service.getAuthorizationUrlTemplate(PlatformType.MANUAL);
      }).toThrow(BadRequestException);
    });
  });

  describe('getTokenUrlTemplate', () => {
    it('should return token URL for regular platforms', () => {
      const url = service.getTokenUrlTemplate(PlatformType.YOUCAN);
      expect(url).toBe('https://youcan.shop/oauth/token');
    });

    it('should handle shop-specific URLs for Shopify', () => {
      const url = service.getTokenUrlTemplate(PlatformType.SHOPIFY, 'mystore');
      expect(url).toBe('https://mystore.myshopify.com/admin/oauth/access_token');
    });

    it('should throw error for unconfigured platform', () => {
      expect(() => {
        service.getTokenUrlTemplate(PlatformType.MANUAL);
      }).toThrow(BadRequestException);
    });
  });

  describe('Configuration initialization', () => {
    it('should initialize without throwing errors', () => {
      // Create new service instance to trigger initialization
      const newService = new OAuth2ConfigService(configService);
      
      // Should not throw and should be defined
      expect(newService).toBeDefined();
    });

    it('should handle missing environment variables gracefully', async () => {
      // Create service with missing environment variables
      const moduleWithMissingEnv = await Test.createTestingModule({
        providers: [
          OAuth2ConfigService,
          {
            provide: ConfigService,
            useValue: {
              get: jest.fn().mockReturnValue(undefined),
            },
          },
        ],
      }).compile();

      const serviceWithMissingEnv = moduleWithMissingEnv.get<OAuth2ConfigService>(OAuth2ConfigService);
      
      // Should not throw, but should handle missing configurations
      expect(serviceWithMissingEnv).toBeDefined();
    });
  });
});