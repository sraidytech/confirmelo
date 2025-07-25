import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as crypto from 'crypto';

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface JwtPayload {
  sub: string; // user id
  email: string;
  role: string;
  organizationId?: string;
  sessionId: string;
  iat?: number;
  exp?: number;
}

@Injectable()
export class JwtUtil {
  constructor(
    private jwtService: JwtService,
    private configService: ConfigService,
  ) {}

  generateTokenPair(payload: Omit<JwtPayload, 'iat' | 'exp'>, rememberMe = false): TokenPair {
    const accessTokenExpiry = this.configService.get('JWT_EXPIRES_IN', '15m');
    const refreshTokenExpiry = rememberMe ? '30d' : this.configService.get('JWT_REFRESH_EXPIRES_IN', '7d');

    const accessToken = this.jwtService.sign(payload, {
      secret: this.configService.get('JWT_SECRET'),
      expiresIn: accessTokenExpiry,
    });

    const refreshToken = this.jwtService.sign(
      { sub: payload.sub, sessionId: payload.sessionId },
      {
        secret: this.configService.get('JWT_REFRESH_SECRET'),
        expiresIn: refreshTokenExpiry,
      },
    );

    return {
      accessToken,
      refreshToken,
      expiresIn: this.getExpiryInSeconds(accessTokenExpiry),
    };
  }

  verifyAccessToken(token: string): JwtPayload {
    return this.jwtService.verify(token, {
      secret: this.configService.get('JWT_SECRET'),
    });
  }

  verifyRefreshToken(token: string): { sub: string; sessionId: string } {
    return this.jwtService.verify(token, {
      secret: this.configService.get('JWT_REFRESH_SECRET'),
    });
  }

  generateSessionId(): string {
    return crypto.randomBytes(32).toString('hex');
  }

  /**
   * Refresh access token using refresh token
   */
  refreshAccessToken(refreshToken: string, userPayload: Omit<JwtPayload, 'iat' | 'exp' | 'sessionId'>): TokenPair {
    // Verify refresh token
    const refreshPayload = this.verifyRefreshToken(refreshToken);
    
    // Generate new token pair with same session ID
    return this.generateTokenPair({
      ...userPayload,
      sessionId: refreshPayload.sessionId,
    });
  }

  /**
   * Extract payload from token without verification (for debugging)
   */
  decodeToken(token: string): any {
    return this.jwtService.decode(token);
  }

  /**
   * Check if token is expired
   */
  isTokenExpired(token: string): boolean {
    try {
      const decoded = this.jwtService.decode(token) as any;
      if (!decoded || !decoded.exp) return true;
      
      return Date.now() >= decoded.exp * 1000;
    } catch {
      return true;
    }
  }

  /**
   * Get token expiration time
   */
  getTokenExpiration(token: string): Date | null {
    try {
      const decoded = this.jwtService.decode(token) as any;
      if (!decoded || !decoded.exp) return null;
      
      return new Date(decoded.exp * 1000);
    } catch {
      return null;
    }
  }

  private getExpiryInSeconds(expiry: string): number {
    const unit = expiry.slice(-1);
    const value = parseInt(expiry.slice(0, -1));

    // Return default if parsing failed
    if (isNaN(value)) {
      return 900; // 15 minutes default
    }

    switch (unit) {
      case 's':
        return value;
      case 'm':
        return value * 60;
      case 'h':
        return value * 3600;
      case 'd':
        return value * 86400;
      default:
        return 900; // 15 minutes default
    }
  }
}