import { Test, TestingModule } from '@nestjs/testing';
import { SanitizationService } from '../sanitization.service';
import { LoggingService } from '../../services/logging.service';

describe('SanitizationService', () => {
  let service: SanitizationService;
  let loggingService: jest.Mocked<LoggingService>;

  beforeEach(async () => {
    const mockLoggingService = {
      logSecurity: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SanitizationService,
        { provide: LoggingService, useValue: mockLoggingService },
      ],
    }).compile();

    service = module.get<SanitizationService>(SanitizationService);
    loggingService = module.get(LoggingService);
  });

  describe('sanitizeString', () => {
    it('should remove null bytes and control characters', () => {
      const input = 'test\x00string\x01with\x1fcontrol\x7fchars';
      const result = service.sanitizeString(input);
      expect(result).toBe('teststringwithcontrolchars');
    });

    it('should trim whitespace', () => {
      const input = '  test string  ';
      const result = service.sanitizeString(input);
      expect(result).toBe('test string');
    });

    it('should limit length to prevent DoS', () => {
      const input = 'a'.repeat(20000);
      const result = service.sanitizeString(input);
      expect(result.length).toBe(10000);
    });

    it('should handle non-string input', () => {
      expect(service.sanitizeString(null as any)).toBe('');
      expect(service.sanitizeString(undefined as any)).toBe('');
      expect(service.sanitizeString(123 as any)).toBe('');
    });
  });

  describe('sanitizeEmail', () => {
    it('should convert to lowercase and trim', () => {
      const input = '  TEST@EXAMPLE.COM  ';
      const result = service.sanitizeEmail(input);
      expect(result).toBe('test@example.com');
    });

    it('should remove all whitespace', () => {
      const input = 'test @exam ple.com';
      const result = service.sanitizeEmail(input);
      expect(result).toBe('test@example.com');
    });

    it('should limit length to RFC 5321 limit', () => {
      const input = 'a'.repeat(300) + '@example.com';
      const result = service.sanitizeEmail(input);
      expect(result.length).toBe(254);
    });
  });

  describe('sanitizePhoneNumber', () => {
    it('should keep only valid phone characters', () => {
      const input = '+1 (555) 123-4567 ext. 890';
      const result = service.sanitizePhoneNumber(input);
      expect(result).toBe('+1 (555) 123-4567  8');
    });

    it('should limit length', () => {
      const input = '+1234567890123456789012345';
      const result = service.sanitizePhoneNumber(input);
      expect(result.length).toBe(20);
    });
  });

  describe('sanitizeUrl', () => {
    it('should accept valid HTTP URLs', () => {
      const input = 'https://example.com/path';
      const result = service.sanitizeUrl(input);
      expect(result).toBe('https://example.com/path');
    });

    it('should reject invalid protocols', () => {
      const input = 'javascript:alert("xss")';
      const result = service.sanitizeUrl(input);
      expect(result).toBe('');
      expect(loggingService.logSecurity).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'INVALID_URL_PROTOCOL',
        })
      );
    });

    it('should reject malformed URLs', () => {
      const input = 'not-a-url';
      const result = service.sanitizeUrl(input);
      expect(result).toBe('');
      expect(loggingService.logSecurity).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'INVALID_URL_FORMAT',
        })
      );
    });
  });

  describe('sanitizeUsername', () => {
    it('should convert to lowercase and keep only valid characters', () => {
      const input = 'TestUser_123';
      const result = service.sanitizeUsername(input);
      expect(result).toBe('testuser_123');
    });

    it('should remove invalid characters', () => {
      const input = 'test@user#123!';
      const result = service.sanitizeUsername(input);
      expect(result).toBe('testuser123');
    });

    it('should limit length', () => {
      const input = 'a'.repeat(100);
      const result = service.sanitizeUsername(input);
      expect(result.length).toBe(50);
    });
  });

  describe('sanitizeObject', () => {
    it('should sanitize nested objects', () => {
      const input = {
        name: '  Test Name  ',
        email: '  TEST@EXAMPLE.COM  ',
        nested: {
          value: 'test\x00value',
        },
        array: ['  item1  ', 'item2\x01'],
      };

      const result = service.sanitizeObject(input);
      expect(result).toEqual({
        name: 'Test Name',
        email: 'TEST@EXAMPLE.COM',
        nested: {
          value: 'testvalue',
        },
        array: ['item1', 'item2'],
      });
    });

    it('should handle primitive values', () => {
      expect(service.sanitizeObject('test')).toBe('test');
      expect(service.sanitizeObject(123)).toBe(123);
      expect(service.sanitizeObject(true)).toBe(true);
      expect(service.sanitizeObject(null)).toBe(null);
      expect(service.sanitizeObject(undefined)).toBe(undefined);
    });
  });

  describe('sanitizeForLogging', () => {
    it('should redact sensitive fields', () => {
      const input = {
        email: 'test@example.com',
        password: 'secret123',
        token: 'jwt-token',
        accessToken: 'access-token',
        publicData: 'visible',
      };

      const result = service.sanitizeForLogging(input);
      expect(result).toEqual({
        email: 'te***@example.com',
        password: '[REDACTED]',
        token: '[REDACTED]',
        accessToken: '[REDACTED]',
        publicData: 'visible',
      });
    });

    it('should mask email addresses', () => {
      const input = { email: 'john.doe@example.com' };
      const result = service.sanitizeForLogging(input);
      expect(result.email).toBe('jo***@example.com');
    });

    it('should handle nested objects', () => {
      const input = {
        user: {
          email: 'test@example.com',
          password: 'secret',
        },
        auth: {
          token: 'jwt-token',
        },
      };

      const result = service.sanitizeForLogging(input);
      expect(result.user.password).toBe('[REDACTED]');
      expect(result.auth.token).toBe('[REDACTED]');
      expect(result.user.email).toBe('te***@example.com');
    });
  });
});