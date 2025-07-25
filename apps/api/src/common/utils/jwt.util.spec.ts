import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { JwtUtil, JwtPayload } from './jwt.util';

describe('JwtUtil', () => {
  let util: JwtUtil;
  let jwtService: jest.Mocked<JwtService>;
  let configService: jest.Mocked<ConfigService>;

  const mockPayload: Omit<JwtPayload, 'iat' | 'exp'> = {
    sub: 'user-123',
    email: 'test@example.com',
    role: 'ADMIN',
    organizationId: 'org-123',
    sessionId: 'session-123',
  };

  beforeEach(async () => {
    const mockJwtService = {
      sign: jest.fn(),
      verify: jest.fn(),
      decode: jest.fn(),
    };

    const mockConfigService = {
      get: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        JwtUtil,
        { provide: JwtService, useValue: mockJwtService },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    util = module.get<JwtUtil>(JwtUtil);
    jwtService = module.get(JwtService);
    configService = module.get(ConfigService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(util).toBeDefined();
  });

  describe('generateTokenPair', () => {
    it('should generate access and refresh tokens', () => {
      const mockAccessToken = 'mock-access-token';
      const mockRefreshToken = 'mock-refresh-token';

      configService.get
        .mockReturnValueOnce('15m') // JWT_EXPIRES_IN
        .mockReturnValueOnce('7d')  // JWT_REFRESH_EXPIRES_IN
        .mockReturnValueOnce('access-secret') // JWT_SECRET
        .mockReturnValueOnce('refresh-secret'); // JWT_REFRESH_SECRET

      jwtService.sign
        .mockReturnValueOnce(mockAccessToken)
        .mockReturnValueOnce(mockRefreshToken);

      const result = util.generateTokenPair(mockPayload);

      expect(result).toEqual({
        accessToken: mockAccessToken,
        refreshToken: mockRefreshToken,
        expiresIn: 900, // 15 minutes in seconds
      });

      expect(jwtService.sign).toHaveBeenCalledTimes(2);
      expect(jwtService.sign).toHaveBeenNthCalledWith(1, mockPayload, {
        secret: 'access-secret',
        expiresIn: '15m',
      });
      expect(jwtService.sign).toHaveBeenNthCalledWith(2, {
        sub: mockPayload.sub,
        sessionId: mockPayload.sessionId,
      }, {
        secret: 'refresh-secret',
        expiresIn: '7d',
      });
    });

    it('should use extended expiry for remember me', () => {
      const mockAccessToken = 'mock-access-token';
      const mockRefreshToken = 'mock-refresh-token';

      configService.get
        .mockReturnValueOnce('15m') // JWT_EXPIRES_IN
        .mockReturnValueOnce('access-secret') // JWT_SECRET
        .mockReturnValueOnce('refresh-secret'); // JWT_REFRESH_SECRET

      jwtService.sign
        .mockReturnValueOnce(mockAccessToken)
        .mockReturnValueOnce(mockRefreshToken);

      const result = util.generateTokenPair(mockPayload, true);

      expect(result.refreshToken).toBe(mockRefreshToken);
      expect(jwtService.sign).toHaveBeenNthCalledWith(2, {
        sub: mockPayload.sub,
        sessionId: mockPayload.sessionId,
      }, {
        secret: 'refresh-secret',
        expiresIn: '30d', // Extended expiry for remember me
      });
    });
  });

  describe('verifyAccessToken', () => {
    it('should verify and return access token payload', () => {
      const token = 'valid-access-token';
      const expectedPayload: JwtPayload = {
        ...mockPayload,
        iat: 1234567890,
        exp: 1234568790,
      };

      configService.get.mockReturnValue('access-secret');
      jwtService.verify.mockReturnValue(expectedPayload);

      const result = util.verifyAccessToken(token);

      expect(result).toEqual(expectedPayload);
      expect(jwtService.verify).toHaveBeenCalledWith(token, {
        secret: 'access-secret',
      });
    });

    it('should throw error for invalid access token', () => {
      const token = 'invalid-access-token';

      configService.get.mockReturnValue('access-secret');
      jwtService.verify.mockImplementation(() => {
        throw new Error('Invalid token');
      });

      expect(() => util.verifyAccessToken(token)).toThrow('Invalid token');
    });
  });

  describe('verifyRefreshToken', () => {
    it('should verify and return refresh token payload', () => {
      const token = 'valid-refresh-token';
      const expectedPayload = {
        sub: 'user-123',
        sessionId: 'session-123',
        iat: 1234567890,
        exp: 1234568790,
      };

      configService.get.mockReturnValue('refresh-secret');
      jwtService.verify.mockReturnValue(expectedPayload);

      const result = util.verifyRefreshToken(token);

      expect(result).toEqual(expectedPayload);
      expect(jwtService.verify).toHaveBeenCalledWith(token, {
        secret: 'refresh-secret',
      });
    });

    it('should throw error for invalid refresh token', () => {
      const token = 'invalid-refresh-token';

      configService.get.mockReturnValue('refresh-secret');
      jwtService.verify.mockImplementation(() => {
        throw new Error('Invalid token');
      });

      expect(() => util.verifyRefreshToken(token)).toThrow('Invalid token');
    });
  });

  describe('refreshAccessToken', () => {
    it('should generate new token pair using refresh token', () => {
      const refreshToken = 'valid-refresh-token';
      const refreshPayload = {
        sub: 'user-123',
        sessionId: 'session-123',
      };
      const userPayload = {
        sub: 'user-123',
        email: 'test@example.com',
        role: 'ADMIN',
        organizationId: 'org-123',
      };

      const mockAccessToken = 'new-access-token';
      const mockRefreshToken = 'new-refresh-token';

      configService.get
        .mockReturnValueOnce('refresh-secret') // For verifyRefreshToken
        .mockReturnValueOnce('15m') // JWT_EXPIRES_IN
        .mockReturnValueOnce('7d')  // JWT_REFRESH_EXPIRES_IN
        .mockReturnValueOnce('access-secret') // JWT_SECRET
        .mockReturnValueOnce('refresh-secret'); // JWT_REFRESH_SECRET

      jwtService.verify.mockReturnValue(refreshPayload);
      jwtService.sign
        .mockReturnValueOnce(mockAccessToken)
        .mockReturnValueOnce(mockRefreshToken);

      const result = util.refreshAccessToken(refreshToken, userPayload);

      expect(result).toEqual({
        accessToken: mockAccessToken,
        refreshToken: mockRefreshToken,
        expiresIn: 900,
      });

      expect(jwtService.verify).toHaveBeenCalledWith(refreshToken, {
        secret: 'refresh-secret',
      });
    });
  });

  describe('generateSessionId', () => {
    it('should generate a unique session ID', () => {
      const sessionId1 = util.generateSessionId();
      const sessionId2 = util.generateSessionId();

      expect(sessionId1).toBeDefined();
      expect(sessionId2).toBeDefined();
      expect(typeof sessionId1).toBe('string');
      expect(typeof sessionId2).toBe('string');
      expect(sessionId1).not.toBe(sessionId2);
      expect(sessionId1.length).toBe(64); // 32 bytes * 2 (hex)
    });
  });

  describe('decodeToken', () => {
    it('should decode token without verification', () => {
      const token = 'some-token';
      const decodedPayload = { sub: 'user-123', exp: 1234567890 };

      jwtService.decode.mockReturnValue(decodedPayload);

      const result = util.decodeToken(token);

      expect(result).toEqual(decodedPayload);
      expect(jwtService.decode).toHaveBeenCalledWith(token);
    });
  });

  describe('isTokenExpired', () => {
    it('should return false for valid token', () => {
      const token = 'valid-token';
      const futureExp = Math.floor(Date.now() / 1000) + 3600; // 1 hour from now

      jwtService.decode.mockReturnValue({ exp: futureExp });

      const result = util.isTokenExpired(token);

      expect(result).toBe(false);
    });

    it('should return true for expired token', () => {
      const token = 'expired-token';
      const pastExp = Math.floor(Date.now() / 1000) - 3600; // 1 hour ago

      jwtService.decode.mockReturnValue({ exp: pastExp });

      const result = util.isTokenExpired(token);

      expect(result).toBe(true);
    });

    it('should return true for token without exp claim', () => {
      const token = 'invalid-token';

      jwtService.decode.mockReturnValue({ sub: 'user-123' });

      const result = util.isTokenExpired(token);

      expect(result).toBe(true);
    });

    it('should return true for invalid token', () => {
      const token = 'invalid-token';

      jwtService.decode.mockImplementation(() => {
        throw new Error('Invalid token');
      });

      const result = util.isTokenExpired(token);

      expect(result).toBe(true);
    });
  });

  describe('getTokenExpiration', () => {
    it('should return expiration date for valid token', () => {
      const token = 'valid-token';
      const exp = 1234567890;
      const expectedDate = new Date(exp * 1000);

      jwtService.decode.mockReturnValue({ exp });

      const result = util.getTokenExpiration(token);

      expect(result).toEqual(expectedDate);
    });

    it('should return null for token without exp claim', () => {
      const token = 'invalid-token';

      jwtService.decode.mockReturnValue({ sub: 'user-123' });

      const result = util.getTokenExpiration(token);

      expect(result).toBeNull();
    });

    it('should return null for invalid token', () => {
      const token = 'invalid-token';

      jwtService.decode.mockImplementation(() => {
        throw new Error('Invalid token');
      });

      const result = util.getTokenExpiration(token);

      expect(result).toBeNull();
    });
  });

  describe('getExpiryInSeconds', () => {
    it('should convert different time units to seconds', () => {
      // Test seconds
      expect(util['getExpiryInSeconds']('30s')).toBe(30);
      
      // Test minutes
      expect(util['getExpiryInSeconds']('15m')).toBe(900);
      
      // Test hours
      expect(util['getExpiryInSeconds']('2h')).toBe(7200);
      
      // Test days
      expect(util['getExpiryInSeconds']('7d')).toBe(604800);
      
      // Test default case (invalid format)
      expect(util['getExpiryInSeconds']('invalid')).toBe(900);
    });
  });
});