import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { OAuth2Service, OAuth2Config } from '../services/oauth2.service';
import { PrismaService } from '../../../common/database/prisma.service';
import { RedisService } from '../../../common/redis/redis.service';
import { PlatformType, ConnectionStatus } from '@prisma/client';
import axios from 'axios';

// Mock axios
jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

// Mock axios.create to return an instance with interceptors
const mockAxiosInstance = {
  interceptors: {
    request: {
      use: jest.fn(),
    },
    response: {
      use: jest.fn(),
    },
  },
  post: jest.fn(),
  get: jest.fn(),
  put: jest.fn(),
  delete: jest.fn(),
  defaults: {
    headers: {},
  },
};

mockedAxios.create = jest.fn().mockReturnValue(mockAxiosInstance);

describe('OAuth2Service', () => {
  let service: OAuth2Service;
  let prismaService: any;
  let redisService: any;
  let configService: any;

  const mockConfig: OAuth2Config = {
    clientId: 'test-client-id',
    clientSecret: 'test-client-secret',
    redirectUri: 'https://app.confirmelo.com/auth/callback',
    authorizationUrl: 'https://oauth.provider.com/authorize',
    tokenUrl: 'https://oauth.provider.com/token',
    scopes: ['read_orders', 'write_orders'],
    usePKCE: true,
  };

  const mockUser = {
    id: 'user-123',
    organizationId: 'org-456',
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OAuth2Service,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockReturnValue('test-encryption-key'),
          },
        },
        {
          provide: PrismaService,
          useValue: {
            platformConnection: {
              create: jest.fn(),
              findUnique: jest.fn(),
              update: jest.fn(),
            },
          },
        },
        {
          provide: RedisService,
          useValue: {
            set: jest.fn(),
            get: jest.fn(),
            del: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<OAuth2Service>(OAuth2Service);
    prismaService = module.get(PrismaService);
    redisService = module.get(RedisService);
    configService = module.get(ConfigService);

    // Axios mock is already set up globally
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('generateAuthorizationUrl', () => {
    it('should generate authorization URL with PKCE', async () => {
      const mockState = 'mock-state-123';
      const mockCodeVerifier = 'mock-code-verifier';
      
      // Mock Redis operations
      redisService.set.mockResolvedValue();

      // Mock crypto functions
      jest.spyOn(require('crypto'), 'randomBytes')
        .mockReturnValueOnce(Buffer.from(mockState))
        .mockReturnValueOnce(Buffer.from(mockCodeVerifier));

      const result = await service.generateAuthorizationUrl(
        PlatformType.YOUCAN,
        mockConfig,
        mockUser.id,
        mockUser.organizationId,
      );

      expect(result).toHaveProperty('authorizationUrl');
      expect(result).toHaveProperty('state');
      expect(result.authorizationUrl).toContain(mockConfig.authorizationUrl);
      expect(result.authorizationUrl).toContain('code_challenge');
      expect(result.authorizationUrl).toContain('code_challenge_method=S256');

      // Verify Redis state storage
      expect(redisService.set).toHaveBeenCalledWith(
        expect.stringContaining('oauth2:state:'),
        expect.objectContaining({
          userId: mockUser.id,
          organizationId: mockUser.organizationId,
        }),
        600,
      );

      // Verify PKCE code verifier storage
      expect(redisService.set).toHaveBeenCalledWith(
        expect.stringContaining('oauth2:pkce:'),
        expect.any(String),
        600,
      );
    });

    it('should generate authorization URL without PKCE', async () => {
      const configWithoutPKCE = { ...mockConfig, usePKCE: false };
      redisService.set.mockResolvedValue();

      const result = await service.generateAuthorizationUrl(
        PlatformType.YOUCAN,
        configWithoutPKCE,
        mockUser.id,
        mockUser.organizationId,
      );

      expect(result.authorizationUrl).not.toContain('code_challenge');
      expect(redisService.set).toHaveBeenCalledTimes(1); // Only state, no PKCE
    });

    it('should handle errors gracefully', async () => {
      redisService.set.mockRejectedValue(new Error('Redis error'));

      await expect(
        service.generateAuthorizationUrl(
          PlatformType.YOUCAN,
          mockConfig,
          mockUser.id,
          mockUser.organizationId,
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('exchangeCodeForToken', () => {
    const mockCode = 'auth-code-123';
    const mockState = 'state-456';
    const mockStateData = {
      userId: mockUser.id,
      organizationId: mockUser.organizationId,
      platformType: PlatformType.YOUCAN,
      timestamp: Date.now(),
    };
    const mockTokenResponse = {
      access_token: 'access-token-123',
      refresh_token: 'refresh-token-456',
      expires_in: 3600,
      token_type: 'Bearer',
    };

    beforeEach(() => {
      // Setup mock response for token exchange
      mockAxiosInstance.post.mockResolvedValue({
        status: 200,
        data: mockTokenResponse,
      });
    });

    it('should exchange code for token successfully', async () => {
      redisService.get
        .mockResolvedValueOnce(mockStateData) // state data
        .mockResolvedValueOnce('mock-code-verifier'); // PKCE verifier
      redisService.del.mockResolvedValue();

      const result = await service.exchangeCodeForToken(mockCode, mockState, mockConfig);

      expect(result.tokenResponse).toEqual(mockTokenResponse);
      expect(result.stateData).toEqual(mockStateData);

      // Verify state cleanup
      expect(redisService.del).toHaveBeenCalledWith(`oauth2:state:${mockState}`);
      expect(redisService.del).toHaveBeenCalledWith(`oauth2:pkce:${mockState}`);
    });

    it('should handle invalid state', async () => {
      redisService.get.mockResolvedValue(null);

      await expect(
        service.exchangeCodeForToken(mockCode, mockState, mockConfig),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should handle expired state', async () => {
      const expiredStateData = {
        ...mockStateData,
        timestamp: Date.now() - (11 * 60 * 1000), // 11 minutes ago
      };
      redisService.get.mockResolvedValue(expiredStateData);

      await expect(
        service.exchangeCodeForToken(mockCode, mockState, mockConfig),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should handle token exchange failure', async () => {
      redisService.get.mockResolvedValue(mockStateData);
      
      mockAxiosInstance.post.mockRejectedValue({
        response: {
          status: 400,
          data: { error: 'invalid_grant' },
        },
      });

      await expect(
        service.exchangeCodeForToken(mockCode, mockState, mockConfig),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('refreshAccessToken', () => {
    const mockConnectionId = 'conn-123';
    const mockConnection = {
      id: mockConnectionId,
      platformType: PlatformType.YOUCAN,
      refreshToken: 'encrypted-refresh-token',
    };
    const mockTokenResponse = {
      access_token: 'new-access-token',
      refresh_token: 'new-refresh-token',
      expires_in: 3600,
    };

    beforeEach(() => {
      mockAxiosInstance.post.mockResolvedValue({
        status: 200,
        data: mockTokenResponse,
      });
    });

    it('should refresh access token successfully', async () => {
      prismaService.platformConnection.findUnique.mockResolvedValue(mockConnection as any);
      prismaService.platformConnection.update.mockResolvedValue({} as any);

      const result = await service.refreshAccessToken(mockConnectionId, mockConfig);

      expect(result).toEqual(mockTokenResponse);
      expect(prismaService.platformConnection.update).toHaveBeenCalledWith({
        where: { id: mockConnectionId },
        data: expect.objectContaining({
          status: ConnectionStatus.ACTIVE,
          lastErrorAt: null,
          lastErrorMessage: null,
        }),
      });
    });

    it('should handle connection not found', async () => {
      prismaService.platformConnection.findUnique.mockResolvedValue(null);

      await expect(
        service.refreshAccessToken(mockConnectionId, mockConfig),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should handle refresh token failure', async () => {
      prismaService.platformConnection.findUnique.mockResolvedValue(mockConnection as any);
      
      mockAxiosInstance.post.mockRejectedValue({
        response: {
          status: 400,
          data: { error: 'invalid_grant' },
        },
      });

      await expect(
        service.refreshAccessToken(mockConnectionId, mockConfig),
      ).rejects.toThrow(UnauthorizedException);

      // Verify connection marked as expired
      expect(prismaService.platformConnection.update).toHaveBeenCalledWith({
        where: { id: mockConnectionId },
        data: expect.objectContaining({
          status: ConnectionStatus.EXPIRED,
        }),
      });
    });
  });

  describe('storeConnection', () => {
    const mockTokenResponse = {
      access_token: 'access-token-123',
      refresh_token: 'refresh-token-456',
      expires_in: 3600,
    };
    const mockScopes = ['read_orders', 'write_orders'];
    const mockPlatformData = { storeId: 'store-123' };

    it('should store connection successfully', async () => {
      const mockConnection = { id: 'conn-123' };
      prismaService.platformConnection.create.mockResolvedValue(mockConnection as any);

      const result = await service.storeConnection(
        mockUser.id,
        mockUser.organizationId,
        PlatformType.YOUCAN,
        'My Youcan Store',
        mockTokenResponse,
        mockScopes,
        mockPlatformData,
      );

      expect(result).toBe(mockConnection.id);
      expect(prismaService.platformConnection.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          platformType: PlatformType.YOUCAN,
          platformName: 'My Youcan Store',
          status: ConnectionStatus.ACTIVE,
          scopes: mockScopes,
          userId: mockUser.id,
          organizationId: mockUser.organizationId,
          platformData: mockPlatformData,
        }),
      });
    });

    it('should handle database errors', async () => {
      prismaService.platformConnection.create.mockRejectedValue(new Error('Database error'));

      await expect(
        service.storeConnection(
          mockUser.id,
          mockUser.organizationId,
          PlatformType.YOUCAN,
          'My Youcan Store',
          mockTokenResponse,
          mockScopes,
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('getAccessToken', () => {
    const mockConnectionId = 'conn-123';

    it('should return decrypted access token', async () => {
      const mockConnection = {
        id: mockConnectionId,
        status: ConnectionStatus.ACTIVE,
        accessToken: 'encrypted-token',
        tokenExpiresAt: new Date(Date.now() + 3600000), // 1 hour from now
      };
      prismaService.platformConnection.findUnique.mockResolvedValue(mockConnection as any);

      // Mock decryption (simplified)
      const result = await service.getAccessToken(mockConnectionId);

      expect(typeof result).toBe('string');
      expect(prismaService.platformConnection.findUnique).toHaveBeenCalledWith({
        where: { id: mockConnectionId },
      });
    });

    it('should handle expired token', async () => {
      const mockConnection = {
        id: mockConnectionId,
        status: ConnectionStatus.ACTIVE,
        accessToken: 'encrypted-token',
        tokenExpiresAt: new Date(Date.now() - 1000), // Expired
      };
      prismaService.platformConnection.findUnique.mockResolvedValue(mockConnection as any);

      await expect(service.getAccessToken(mockConnectionId)).rejects.toThrow(UnauthorizedException);
    });

    it('should handle inactive connection', async () => {
      const mockConnection = {
        id: mockConnectionId,
        status: ConnectionStatus.EXPIRED,
        accessToken: 'encrypted-token',
      };
      prismaService.platformConnection.findUnique.mockResolvedValue(mockConnection as any);

      await expect(service.getAccessToken(mockConnectionId)).rejects.toThrow(UnauthorizedException);
    });

    it('should handle connection not found', async () => {
      prismaService.platformConnection.findUnique.mockResolvedValue(null);

      await expect(service.getAccessToken(mockConnectionId)).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('Token encryption/decryption', () => {
    it('should encrypt and decrypt tokens correctly', () => {
      const originalToken = 'test-access-token-123';
      
      // Access private methods for testing
      const encryptToken = (service as any).encryptToken.bind(service);
      const decryptToken = (service as any).decryptToken.bind(service);

      const encrypted = encryptToken(originalToken);
      expect(encrypted).not.toBe(originalToken);
      expect(encrypted.length).toBeGreaterThan(0);

      const decrypted = decryptToken(encrypted);
      expect(decrypted).toBe(originalToken);
    });
  });

  describe('PKCE methods', () => {
    it('should generate valid code verifier', () => {
      const generateCodeVerifier = (service as any).generateCodeVerifier.bind(service);
      const codeVerifier = generateCodeVerifier();

      expect(typeof codeVerifier).toBe('string');
      expect(codeVerifier.length).toBeGreaterThan(0);
      // Should be base64url encoded
      expect(codeVerifier).toMatch(/^[A-Za-z0-9_-]+$/);
    });

    it('should generate valid code challenge', () => {
      const generateCodeChallenge = (service as any).generateCodeChallenge.bind(service);
      const codeVerifier = 'test-code-verifier';
      const codeChallenge = generateCodeChallenge(codeVerifier);

      expect(typeof codeChallenge).toBe('string');
      expect(codeChallenge.length).toBeGreaterThan(0);
      // Should be base64url encoded
      expect(codeChallenge).toMatch(/^[A-Za-z0-9_-]+$/);
    });
  });
});