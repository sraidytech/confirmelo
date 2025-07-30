import { Test, TestingModule } from '@nestjs/testing';
import { ValidationService } from '../validation.service';
import { LoggingService } from '../../services/logging.service';

describe('ValidationService', () => {
  let service: ValidationService;
  let loggingService: jest.Mocked<LoggingService>;

  beforeEach(async () => {
    const mockLoggingService = {
      logSecurity: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ValidationService,
        { provide: LoggingService, useValue: mockLoggingService },
      ],
    }).compile();

    service = module.get<ValidationService>(ValidationService);
    loggingService = module.get(LoggingService);
  });

  describe('validatePasswordStrength', () => {
    it('should validate a strong password', () => {
      const password = 'MySecureP@ssw0rd123';
      const result = service.validatePasswordStrength(password);
      
      expect(result.isValid).toBe(true);
      expect(result.score).toBeGreaterThan(80);
      expect(result.feedback).toHaveLength(0);
      expect(result.requirements.minLength).toBe(true);
      expect(result.requirements.hasUppercase).toBe(true);
      expect(result.requirements.hasLowercase).toBe(true);
      expect(result.requirements.hasNumber).toBe(true);
      expect(result.requirements.hasSpecialChar).toBe(true);
      expect(result.requirements.notCommon).toBe(true);
    });

    it('should reject a weak password', () => {
      const password = 'password123';
      const result = service.validatePasswordStrength(password);
      
      expect(result.isValid).toBe(false);
      expect(result.score).toBeLessThan(80);
      expect(result.feedback.length).toBeGreaterThan(0);
      expect(result.requirements.notCommon).toBe(false);
    });

    it('should require minimum length', () => {
      const password = 'Short1!';
      const result = service.validatePasswordStrength(password);
      
      expect(result.isValid).toBe(false);
      expect(result.requirements.minLength).toBe(false);
      expect(result.feedback).toContain('Password must be at least 12 characters long');
    });

    it('should require uppercase letters', () => {
      const password = 'mysecurep@ssw0rd123';
      const result = service.validatePasswordStrength(password);
      
      expect(result.isValid).toBe(false);
      expect(result.requirements.hasUppercase).toBe(false);
      expect(result.feedback).toContain('Password must contain at least one uppercase letter');
    });

    it('should require lowercase letters', () => {
      const password = 'MYSECUREP@SSW0RD123';
      const result = service.validatePasswordStrength(password);
      
      expect(result.isValid).toBe(false);
      expect(result.requirements.hasLowercase).toBe(false);
      expect(result.feedback).toContain('Password must contain at least one lowercase letter');
    });

    it('should require numbers', () => {
      const password = 'MySecureP@ssword';
      const result = service.validatePasswordStrength(password);
      
      expect(result.isValid).toBe(false);
      expect(result.requirements.hasNumber).toBe(false);
      expect(result.feedback).toContain('Password must contain at least one number');
    });

    it('should require special characters', () => {
      const password = 'MySecurePassword123';
      const result = service.validatePasswordStrength(password);
      
      expect(result.isValid).toBe(false);
      expect(result.requirements.hasSpecialChar).toBe(false);
      expect(result.feedback).toContain('Password must contain at least one special character');
    });

    it('should reject common passwords', () => {
      const password = 'Password123!';
      const result = service.validatePasswordStrength(password);
      
      expect(result.isValid).toBe(false);
      expect(result.requirements.notCommon).toBe(false);
      expect(result.feedback).toContain('Password is too common, please choose a more unique password');
    });
  });

  describe('validateEmail', () => {
    it('should validate correct email addresses', () => {
      const validEmails = [
        'test@example.com',
        'user.name@domain.co.uk',
        'user+tag@example.org',
        'user123@test-domain.com',
      ];

      validEmails.forEach(email => {
        const result = service.validateEmail(email);
        expect(result.isValid).toBe(true);
        expect(result.errors).toHaveLength(0);
      });
    });

    it('should reject invalid email addresses', () => {
      const invalidEmails = [
        'invalid-email',
        '@example.com',
        'user@',
        'user..name@example.com',
        '.user@example.com',
        'user@example.com.',
      ];

      invalidEmails.forEach(email => {
        const result = service.validateEmail(email);
        expect(result.isValid).toBe(false);
        expect(result.errors.length).toBeGreaterThan(0);
      });
    });

    it('should reject emails that are too long', () => {
      const longEmail = 'a'.repeat(250) + '@example.com';
      const result = service.validateEmail(longEmail);
      
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Email is too long (maximum 254 characters)');
    });

    it('should reject emails with long local part', () => {
      const longLocalEmail = 'a'.repeat(70) + '@example.com';
      const result = service.validateEmail(longLocalEmail);
      
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Email local part is too long (maximum 64 characters)');
    });
  });

  describe('validateUsername', () => {
    it('should validate correct usernames', () => {
      const validUsernames = [
        'user123',
        'test_user',
        'user-name',
        'validuser',
      ];

      validUsernames.forEach(username => {
        const result = service.validateUsername(username);
        expect(result.isValid).toBe(true);
        expect(result.errors).toHaveLength(0);
      });
    });

    it('should reject invalid usernames', () => {
      const invalidUsernames = [
        'ab', // too short
        'a'.repeat(60), // too long
        'user@name', // invalid character
        'user name', // space
        '_username', // starts with underscore
        'username_', // ends with underscore
        'user__name', // consecutive underscores
        'admin', // reserved
      ];

      invalidUsernames.forEach(username => {
        const result = service.validateUsername(username);
        expect(result.isValid).toBe(false);
        expect(result.errors.length).toBeGreaterThan(0);
      });
    });
  });

  describe('validatePhoneNumber', () => {
    it('should validate correct phone numbers', () => {
      const validPhones = [
        '+1234567890',
        '+212600000000',
        '1234567890',
        '0600000000',
      ];

      validPhones.forEach(phone => {
        const result = service.validatePhoneNumber(phone);
        expect(result.isValid).toBe(true);
        expect(result.errors).toHaveLength(0);
      });
    });

    it('should accept empty phone numbers', () => {
      const result = service.validatePhoneNumber('');
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject invalid phone numbers', () => {
      const invalidPhones = [
        '123', // too short
        '+1234567890123456789', // too long
        '+0123456789', // starts with 0 after +
      ];

      invalidPhones.forEach(phone => {
        const result = service.validatePhoneNumber(phone);
        expect(result.isValid).toBe(false);
        expect(result.errors.length).toBeGreaterThan(0);
      });
    });
  });

  describe('validateOrganizationName', () => {
    it('should validate correct organization names', () => {
      const validNames = [
        'Acme Corporation',
        'Test Company Ltd.',
        'My Business & Co.',
      ];

      validNames.forEach(name => {
        const result = service.validateOrganizationName(name);
        expect(result.isValid).toBe(true);
        expect(result.errors).toHaveLength(0);
      });
    });

    it('should reject suspicious organization names', () => {
      const suspiciousName = '<script>alert("xss")</script>';
      const result = service.validateOrganizationName(suspiciousName);
      
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Organization name contains invalid content');
      expect(loggingService.logSecurity).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'SUSPICIOUS_ORG_NAME',
        })
      );
    });

    it('should reject names that are too short or too long', () => {
      const shortName = 'A';
      const longName = 'A'.repeat(150);

      expect(service.validateOrganizationName(shortName).isValid).toBe(false);
      expect(service.validateOrganizationName(longName).isValid).toBe(false);
    });
  });

  describe('validateUrl', () => {
    it('should validate correct URLs', () => {
      const validUrls = [
        'https://example.com',
        'http://test.org/path',
        'https://subdomain.example.com:8080/path?query=value',
      ];

      validUrls.forEach(url => {
        const result = service.validateUrl(url);
        expect(result.isValid).toBe(true);
        expect(result.errors).toHaveLength(0);
      });
    });

    it('should accept empty URLs', () => {
      const result = service.validateUrl('');
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject invalid protocols', () => {
      const invalidUrls = [
        'javascript:alert("xss")',
        'data:text/html,<script>alert("xss")</script>',
        'ftp://example.com',
      ];

      invalidUrls.forEach(url => {
        const result = service.validateUrl(url);
        expect(result.isValid).toBe(false);
        expect(result.errors.length).toBeGreaterThan(0);
      });
    });

    it('should reject malformed URLs', () => {
      const malformedUrls = [
        'not-a-url',
        'http://',
      ];

      malformedUrls.forEach(url => {
        const result = service.validateUrl(url);
        expect(result.isValid).toBe(false);
        expect(result.errors).toContain('Invalid URL format');
      });
    });
  });

  describe('validateRequestSize', () => {
    it('should accept requests within size limit', () => {
      const smallData = { message: 'Hello' };
      const result = service.validateRequestSize(smallData, 100);
      
      expect(result.isValid).toBe(true);
      expect(result.sizeKB).toBeLessThan(1);
    });

    it('should reject requests exceeding size limit', () => {
      const largeData = { message: 'A'.repeat(100000) };
      const result = service.validateRequestSize(largeData, 50);
      
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('exceeds maximum allowed size');
    });
  });

  describe('validateSessionId', () => {
    it('should validate correct session IDs', () => {
      const validSessionIds = [
        'session_123456789',
        'abcd1234-5678-90ef',
        'valid-session-id',
      ];

      validSessionIds.forEach(sessionId => {
        const result = service.validateSessionId(sessionId);
        expect(result.isValid).toBe(true);
        expect(result.errors).toHaveLength(0);
      });
    });

    it('should reject invalid session IDs', () => {
      const invalidSessionIds = [
        'short', // too short
        'a'.repeat(150), // too long
        'session@id', // invalid character
        'session id', // space
      ];

      invalidSessionIds.forEach(sessionId => {
        const result = service.validateSessionId(sessionId);
        expect(result.isValid).toBe(false);
        expect(result.errors.length).toBeGreaterThan(0);
      });
    });
  });
});