import { Injectable } from '@nestjs/common';
import { RedisService } from '../redis/redis.service';
import { JwtUtil } from './jwt.util';

@Injectable()
export class TokenBlacklistUtil {
  constructor(
    private redisService: RedisService,
    private jwtUtil: JwtUtil,
  ) {}

  /**
   * Blacklist a token (for logout)
   */
  async blacklistToken(token: string): Promise<void> {
    try {
      const decoded = this.jwtUtil.decodeToken(token);
      if (!decoded || !decoded.exp) return;

      // Calculate TTL until token expires
      const now = Math.floor(Date.now() / 1000);
      const ttl = decoded.exp - now;

      if (ttl > 0) {
        await this.redisService.set(
          `blacklist:${token}`,
          'true',
          ttl
        );
      }
    } catch (error) {
      // Token is invalid, no need to blacklist
      console.warn('Failed to blacklist token:', error.message);
    }
  }

  /**
   * Check if token is blacklisted
   */
  async isTokenBlacklisted(token: string): Promise<boolean> {
    try {
      const result = await this.redisService.exists(`blacklist:${token}`);
      return result;
    } catch (error) {
      console.error('Error checking token blacklist:', error);
      return false;
    }
  }

  /**
   * Blacklist all tokens for a user (for logout from all devices)
   */
  async blacklistAllUserTokens(userId: string): Promise<void> {
    try {
      // Set a flag that all tokens issued before this time are invalid
      const timestamp = Math.floor(Date.now() / 1000);
      await this.redisService.set(
        `user_logout:${userId}`,
        timestamp.toString(),
        86400 * 30 // 30 days TTL
      );
    } catch (error) {
      console.error('Error blacklisting user tokens:', error);
    }
  }

  /**
   * Check if user token is valid (not globally blacklisted)
   */
  async isUserTokenValid(userId: string, tokenIssuedAt: number): Promise<boolean> {
    try {
      const logoutTimestamp = await this.redisService.get(`user_logout:${userId}`);
      if (!logoutTimestamp) return true;

      const logoutTime = parseInt(logoutTimestamp);
      return tokenIssuedAt > logoutTime;
    } catch (error) {
      console.error('Error checking user token validity:', error);
      return true; // Default to valid if we can't check
    }
  }

  /**
   * Clear user logout flag (for testing or admin purposes)
   */
  async clearUserLogout(userId: string): Promise<void> {
    try {
      await this.redisService.del(`user_logout:${userId}`);
    } catch (error) {
      console.error('Error clearing user logout flag:', error);
    }
  }

  /**
   * Get blacklist statistics
   */
  async getBlacklistStats(): Promise<{
    totalBlacklistedTokens: number;
    totalUserLogouts: number;
  }> {
    try {
      const client = this.redisService.getClient();
      
      // Count blacklisted tokens
      const blacklistKeys = await client.keys('blacklist:*');
      
      // Count user logouts
      const userLogoutKeys = await client.keys('user_logout:*');

      return {
        totalBlacklistedTokens: blacklistKeys.length,
        totalUserLogouts: userLogoutKeys.length,
      };
    } catch (error) {
      console.error('Error getting blacklist stats:', error);
      return {
        totalBlacklistedTokens: 0,
        totalUserLogouts: 0,
      };
    }
  }
}