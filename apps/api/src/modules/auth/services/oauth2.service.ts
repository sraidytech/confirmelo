import { Injectable, Logger, BadRequestException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../common/database/prisma.service';
import { RedisService } from '../../../common/redis/redis.service';
import axios, { AxiosInstance } from 'axios';
import * as crypto from 'crypto';
import * as CryptoJS from 'crypto-js';
import { PlatformType, ConnectionStatus } from '@prisma/client';

export interface OAuth2Config {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  authorizationUrl: string;
  tokenUrl: string;
  scopes: string[];
  usePKCE?: boolean;
}

export interface OAuth2TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  token_type?: string;
  scope?: string;
}

export interface OAuth2AuthorizationRequest {
  authorizationUrl: string;
  state: string;
  codeVerifier?: string;
  codeChallenge?: string;
}

@Injectable()
export class OAuth2Service {
  private readonly logger = new Logger(OAuth2Service.name);
  private readonly httpClient: AxiosInstance;
  private readonly encryptionKey: string;
  private readonly refreshQueue: Map<string, Promise<boolean>> = new Map();

  constructor(
    private readonly configService: ConfigService,
    private readonly prismaService: PrismaService,
    private readonly redisService: RedisService,
  ) {
    this.httpClient = axios.create({
      timeout: 30000,
      headers: {
        'User-Agent': 'Confirmelo-OAuth2-Client/1.0',
        'Accept': 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    });

    // Get encryption key from environment
    this.encryptionKey = this.configService.get<string>('OAUTH2_ENCRYPTION_KEY') || 
      this.configService.get<string>('JWT_SECRET') || 
      'default-oauth2-encryption-key';

    this.setupHttpInterceptors();
  }

  /**
   * Generate authorization URL with PKCE support
   */
  async generateAuthorizationUrl(
    platformType: PlatformType,
    config: OAuth2Config,
    userId: string,
    organizationId: string,
  ): Promise<OAuth2AuthorizationRequest> {
    try {
      // Generate state parameter for CSRF protection
      const state = this.generateSecureRandomString(32);
      
      // Store state in Redis with user context (expires in 10 minutes)
      const stateData = {
        userId,
        organizationId,
        platformType,
        timestamp: Date.now(),
      };
      
      await this.redisService.set(
        `oauth2:state:${state}`,
        stateData,
        600, // 10 minutes
      );

      const authParams = new URLSearchParams({
        response_type: 'code',
        client_id: config.clientId,
        redirect_uri: config.redirectUri,
        scope: config.scopes.join(' '),
        state,
        // Force consent screen to show even if user previously granted permissions
        prompt: 'consent',
        // Ensure fresh authentication
        access_type: 'offline',
      });

      let codeVerifier: string | undefined;
      let codeChallenge: string | undefined;

      // Add PKCE parameters if enabled
      if (config.usePKCE) {
        codeVerifier = this.generateCodeVerifier();
        codeChallenge = this.generateCodeChallenge(codeVerifier);
        
        authParams.append('code_challenge', codeChallenge);
        authParams.append('code_challenge_method', 'S256');

        // Store code verifier in Redis (expires in 10 minutes)
        await this.redisService.set(
          `oauth2:pkce:${state}`,
          codeVerifier,
          600,
        );
      }

      const authorizationUrl = `${config.authorizationUrl}?${authParams.toString()}`;

      this.logger.log(`Generated OAuth2 authorization URL for ${platformType}`, {
        userId,
        organizationId,
        state,
        usePKCE: config.usePKCE,
      });

      return {
        authorizationUrl,
        state,
        codeVerifier,
        codeChallenge,
      };
    } catch (error) {
      this.logger.error('Failed to generate OAuth2 authorization URL', {
        error: error.message,
        platformType,
        userId,
        organizationId,
      });
      throw new BadRequestException('Failed to generate authorization URL');
    }
  }

  /**
   * Exchange authorization code for access token
   */
  async exchangeCodeForToken(
    code: string,
    state: string,
    config: OAuth2Config | null,
  ): Promise<{
    tokenResponse: OAuth2TokenResponse;
    stateData: any;
  }> {
    try {
      // Validate and retrieve state data
      const stateData = await this.validateState(state);
      
      // If no config provided, we can't proceed with token exchange
      if (!config) {
        return { tokenResponse: null as any, stateData };
      }
      
      const tokenParams = new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: config.clientId,
        client_secret: config.clientSecret,
        code,
        redirect_uri: config.redirectUri,
      });

      // Add PKCE code verifier if used
      if (config.usePKCE) {
        const codeVerifier = await this.redisService.get(`oauth2:pkce:${state}`);
        if (!codeVerifier) {
          throw new UnauthorizedException('Invalid or expired PKCE code verifier');
        }
        tokenParams.append('code_verifier', codeVerifier);
        
        // Clean up PKCE data
        await this.redisService.del(`oauth2:pkce:${state}`);
      }

      this.logger.log('Exchanging authorization code for token', {
        platformType: stateData.platformType,
        userId: stateData.userId,
      });

      const response = await this.httpClient.post(config.tokenUrl, tokenParams);
      
      if (response.status !== 200) {
        throw new Error(`Token exchange failed with status ${response.status}`);
      }

      const tokenResponse: OAuth2TokenResponse = response.data;

      // Validate token response
      if (!tokenResponse.access_token) {
        throw new Error('No access token received');
      }

      // Clean up state data
      await this.redisService.del(`oauth2:state:${state}`);

      this.logger.log('Successfully exchanged code for token', {
        platformType: stateData.platformType,
        userId: stateData.userId,
        hasRefreshToken: !!tokenResponse.refresh_token,
        expiresIn: tokenResponse.expires_in,
      });

      return { tokenResponse, stateData };
    } catch (error) {
      this.logger.error('Failed to exchange code for token', {
        error: error.message,
        state,
      });
      
      // Clean up state data on error
      await this.redisService.del(`oauth2:state:${state}`);
      await this.redisService.del(`oauth2:pkce:${state}`);
      
      throw new UnauthorizedException('Failed to exchange authorization code');
    }
  }

  /**
   * Refresh access token using refresh token with retry logic
   */
  async refreshAccessToken(
    connectionId: string,
    config: OAuth2Config,
    retryCount: number = 0,
  ): Promise<OAuth2TokenResponse> {
    const maxRetries = 3;
    const baseDelay = 1000; // 1 second

    try {
      const connection = await this.prismaService.platformConnection.findUnique({
        where: { id: connectionId },
      });

      if (!connection || !connection.refreshToken) {
        throw new Error('Connection not found or no refresh token available');
      }

      const decryptedRefreshToken = this.decryptToken(connection.refreshToken);

      const tokenParams = new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: config.clientId,
        client_secret: config.clientSecret,
        refresh_token: decryptedRefreshToken,
      });

      this.logger.log('Refreshing access token', {
        connectionId,
        platformType: connection.platformType,
        attempt: retryCount + 1,
        maxRetries: maxRetries + 1,
      });

      const response = await this.httpClient.post(config.tokenUrl, tokenParams);
      
      if (response.status !== 200) {
        throw new Error(`Token refresh failed with status ${response.status}: ${response.data?.error_description || response.statusText}`);
      }

      const tokenResponse: OAuth2TokenResponse = response.data;

      if (!tokenResponse.access_token) {
        throw new Error('No access token received in refresh response');
      }

      // Update connection with new tokens
      await this.updateConnectionTokens(connectionId, tokenResponse);

      // Update platform data with last refresh time
      await this.prismaService.platformConnection.update({
        where: { id: connectionId },
        data: {
          platformData: {
            ...(connection.platformData as any || {}),
            last_token_refresh: new Date().toISOString(),
          },
        },
      });

      this.logger.log('Successfully refreshed access token', {
        connectionId,
        platformType: connection.platformType,
        hasNewRefreshToken: !!tokenResponse.refresh_token,
        attempt: retryCount + 1,
      });

      return tokenResponse;
    } catch (error) {
      this.logger.error('Failed to refresh access token', {
        error: error.message,
        connectionId,
        attempt: retryCount + 1,
        maxRetries: maxRetries + 1,
      });

      // Check if we should retry
      const isRetryableError = this.isRetryableTokenError(error);
      if (isRetryableError && retryCount < maxRetries) {
        const delay = baseDelay * Math.pow(2, retryCount); // Exponential backoff
        this.logger.log('Retrying token refresh after delay', {
          connectionId,
          delay,
          nextAttempt: retryCount + 2,
        });

        await new Promise(resolve => setTimeout(resolve, delay));
        return this.refreshAccessToken(connectionId, config, retryCount + 1);
      }

      // Mark connection as expired if refresh fails permanently
      await this.markConnectionAsExpired(connectionId, error.message);
      
      throw new UnauthorizedException(`Failed to refresh access token after ${retryCount + 1} attempts: ${error.message}`);
    }
  }

  /**
   * Check if a token error is retryable
   */
  private isRetryableTokenError(error: any): boolean {
    const retryableErrors = [
      'network error',
      'timeout',
      'rate_limited',
      'temporarily_unavailable',
      'server_error',
    ];

    const errorMessage = error.message?.toLowerCase() || '';
    const errorCode = error.response?.data?.error?.toLowerCase() || '';

    return retryableErrors.some(retryableError => 
      errorMessage.includes(retryableError) || errorCode.includes(retryableError)
    ) || (error.response?.status >= 500 && error.response?.status < 600);
  }

  /**
   * Store OAuth2 connection in database
   */
  async storeConnection(
    userId: string,
    organizationId: string,
    platformType: PlatformType,
    platformName: string,
    tokenResponse: OAuth2TokenResponse,
    scopes: string[],
    platformData?: any,
  ): Promise<string> {
    try {
      const expiresAt = tokenResponse.expires_in 
        ? new Date(Date.now() + tokenResponse.expires_in * 1000)
        : null;

      const connection = await this.prismaService.platformConnection.create({
        data: {
          platformType,
          platformName,
          status: ConnectionStatus.ACTIVE,
          accessToken: this.encryptToken(tokenResponse.access_token),
          refreshToken: tokenResponse.refresh_token 
            ? this.encryptToken(tokenResponse.refresh_token)
            : null,
          tokenExpiresAt: expiresAt,
          scopes,
          userId,
          organizationId,
          platformData,
          lastSyncAt: new Date(),
          syncCount: 0,
        },
      });

      this.logger.log('Stored OAuth2 connection', {
        connectionId: connection.id,
        userId,
        organizationId,
        platformType,
        platformName,
        scopes,
      });

      return connection.id;
    } catch (error) {
      this.logger.error('Failed to store OAuth2 connection', {
        error: error.message,
        userId,
        organizationId,
        platformType,
      });
      throw new BadRequestException('Failed to store connection');
    }
  }

  /**
   * Get decrypted access token for a connection with automatic refresh
   */
  async getAccessToken(connectionId: string): Promise<string> {
    try {
      const connection = await this.prismaService.platformConnection.findUnique({
        where: { id: connectionId },
      });

      if (!connection || connection.status !== ConnectionStatus.ACTIVE) {
        throw new Error('Connection not found or not active');
      }

      // Check if token needs refresh (expired or expires within 10 minutes)
      const now = new Date();
      const tenMinutesFromNow = new Date(now.getTime() + 10 * 60 * 1000);
      
      if (connection.tokenExpiresAt && connection.tokenExpiresAt <= tenMinutesFromNow) {
        this.logger.log('Token expired or expiring soon, attempting refresh', {
          connectionId,
          expiresAt: connection.tokenExpiresAt,
          now: now.toISOString(),
        });

        // Attempt to refresh the token
        const refreshed = await this.validateAndRefreshToken(connectionId);
        if (!refreshed) {
          throw new Error('Failed to refresh expired token');
        }

        // Get the updated connection after refresh
        const updatedConnection = await this.prismaService.platformConnection.findUnique({
          where: { id: connectionId },
        });

        if (!updatedConnection || updatedConnection.status !== ConnectionStatus.ACTIVE) {
          throw new Error('Connection not active after token refresh');
        }

        return this.decryptToken(updatedConnection.accessToken);
      }

      return this.decryptToken(connection.accessToken);
    } catch (error) {
      this.logger.error('Failed to get access token', {
        error: error.message,
        connectionId,
      });
      throw new UnauthorizedException('Failed to get access token');
    }
  }

  /**
   * Validate and refresh token if needed with queue management
   */
  async validateAndRefreshToken(connectionId: string): Promise<boolean> {
    // Check if there's already a refresh in progress for this connection
    const existingRefresh = this.refreshQueue.get(connectionId);
    if (existingRefresh) {
      this.logger.log('Token refresh already in progress, waiting for completion', {
        connectionId,
      });
      return existingRefresh;
    }

    // Create a new refresh promise and add it to the queue
    const refreshPromise = this.performTokenRefresh(connectionId);
    this.refreshQueue.set(connectionId, refreshPromise);

    try {
      const result = await refreshPromise;
      return result;
    } finally {
      // Remove from queue when done
      this.refreshQueue.delete(connectionId);
    }
  }

  /**
   * Perform the actual token refresh
   */
  private async performTokenRefresh(connectionId: string): Promise<boolean> {
    try {
      const connection = await this.prismaService.platformConnection.findUnique({
        where: { id: connectionId },
      });

      if (!connection || !connection.refreshToken) {
        this.logger.warn('Cannot refresh token: connection not found or no refresh token', {
          connectionId,
          hasRefreshToken: !!connection?.refreshToken,
        });
        return false;
      }

      // Get the OAuth2 config for this platform
      const { OAuth2ConfigService } = await import('./oauth2-config.service');
      const configService = new OAuth2ConfigService(this.configService);
      const config = await configService.getConfig(connection.platformType);

      if (!config) {
        this.logger.error('No OAuth2 config found for platform', {
          connectionId,
          platformType: connection.platformType,
        });
        return false;
      }

      // Attempt to refresh the token
      try {
        const tokenResponse = await this.refreshAccessToken(connectionId, config);
        this.logger.log('Successfully refreshed access token', {
          connectionId,
          newExpiresAt: tokenResponse.expires_in 
            ? new Date(Date.now() + tokenResponse.expires_in * 1000).toISOString()
            : 'no expiration',
        });
        return true;
      } catch (refreshError) {
        this.logger.error('Token refresh failed', {
          connectionId,
          error: refreshError.message,
        });

        // Mark connection as expired if refresh fails
        await this.markConnectionAsExpired(connectionId, refreshError.message);
        return false;
      }
    } catch (error) {
      this.logger.error('Error during token validation and refresh', {
        connectionId,
        error: error.message,
      });
      return false;
    }
  }

  /**
   * Revoke OAuth2 connection and mark as revoked
   */
  async revokeConnection(connectionId: string): Promise<void> {
    try {
      this.logger.log('Revoking OAuth2 connection', { connectionId });

      // Update connection status to revoked
      await this.prismaService.platformConnection.update({
        where: { id: connectionId },
        data: {
          status: ConnectionStatus.REVOKED,
          accessToken: null,
          refreshToken: null,
          tokenExpiresAt: null,
          lastErrorAt: new Date(),
          lastErrorMessage: 'Connection revoked by user',
          updatedAt: new Date(),
        },
      });

      this.logger.log('Successfully revoked OAuth2 connection', { connectionId });
    } catch (error) {
      this.logger.error('Failed to revoke OAuth2 connection', {
        error: error.message,
        connectionId,
      });
      throw new Error(`Failed to revoke connection: ${error.message}`);
    }
  }

  /**
   * Validate OAuth2 state parameter
   */
  private async validateState(state: string): Promise<any> {
    const stateData = await this.redisService.get(`oauth2:state:${state}`);
    
    if (!stateData) {
      throw new UnauthorizedException('Invalid or expired state parameter');
    }

    // Check if state is not too old (10 minutes max)
    const maxAge = 10 * 60 * 1000; // 10 minutes
    if (Date.now() - stateData.timestamp > maxAge) {
      await this.redisService.del(`oauth2:state:${state}`);
      throw new UnauthorizedException('State parameter expired');
    }

    return stateData;
  }

  /**
   * Update connection tokens after refresh
   */
  private async updateConnectionTokens(
    connectionId: string,
    tokenResponse: OAuth2TokenResponse,
  ): Promise<void> {
    const expiresAt = tokenResponse.expires_in 
      ? new Date(Date.now() + tokenResponse.expires_in * 1000)
      : null;

    await this.prismaService.platformConnection.update({
      where: { id: connectionId },
      data: {
        accessToken: this.encryptToken(tokenResponse.access_token),
        refreshToken: tokenResponse.refresh_token 
          ? this.encryptToken(tokenResponse.refresh_token)
          : undefined,
        tokenExpiresAt: expiresAt,
        status: ConnectionStatus.ACTIVE,
        lastErrorAt: null,
        lastErrorMessage: null,
        updatedAt: new Date(),
      },
    });
  }

  /**
   * Mark connection as expired
   */
  private async markConnectionAsExpired(connectionId: string, errorMessage: string): Promise<void> {
    await this.prismaService.platformConnection.update({
      where: { id: connectionId },
      data: {
        status: ConnectionStatus.EXPIRED,
        lastErrorAt: new Date(),
        lastErrorMessage: errorMessage,
      },
    });
  }

  /**
   * Generate secure random string
   */
  private generateSecureRandomString(length: number): string {
    return crypto.randomBytes(length).toString('base64url');
  }

  /**
   * Generate PKCE code verifier
   */
  private generateCodeVerifier(): string {
    return crypto.randomBytes(32).toString('base64url');
  }

  /**
   * Generate PKCE code challenge
   */
  private generateCodeChallenge(codeVerifier: string): string {
    return crypto
      .createHash('sha256')
      .update(codeVerifier)
      .digest('base64url');
  }

  /**
   * Encrypt token for storage
   */
  private encryptToken(token: string): string {
    return CryptoJS.AES.encrypt(token, this.encryptionKey).toString();
  }

  /**
   * Decrypt token from storage
   */
  private decryptToken(encryptedToken: string): string {
    const bytes = CryptoJS.AES.decrypt(encryptedToken, this.encryptionKey);
    return bytes.toString(CryptoJS.enc.Utf8);
  }

  /**
   * Setup HTTP client interceptors for logging and error handling
   */
  private setupHttpInterceptors(): void {
    // Request interceptor
    this.httpClient.interceptors.request.use(
      (config) => {
        this.logger.debug('OAuth2 HTTP Request', {
          method: config.method?.toUpperCase(),
          url: config.url,
          headers: this.sanitizeHeaders(config.headers),
        });
        return config;
      },
      (error) => {
        this.logger.error('OAuth2 HTTP Request Error', { error: error.message });
        return Promise.reject(error);
      },
    );

    // Response interceptor
    this.httpClient.interceptors.response.use(
      (response) => {
        this.logger.debug('OAuth2 HTTP Response', {
          status: response.status,
          url: response.config.url,
          dataKeys: Object.keys(response.data || {}),
        });
        return response;
      },
      (error) => {
        this.logger.error('OAuth2 HTTP Response Error', {
          status: error.response?.status,
          url: error.config?.url,
          error: error.message,
          responseData: error.response?.data,
        });
        return Promise.reject(error);
      },
    );
  }

  /**
   * Sanitize headers for logging (remove sensitive data)
   */
  private sanitizeHeaders(headers: any): any {
    const sanitized = { ...headers };
    const sensitiveKeys = ['authorization', 'client-secret', 'x-api-key'];
    
    sensitiveKeys.forEach(key => {
      if (sanitized[key]) {
        sanitized[key] = '[REDACTED]';
      }
    });
    
    return sanitized;
  }
}