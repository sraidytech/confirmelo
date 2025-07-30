import { validate } from 'class-validator';
import { plainToClass } from 'class-transformer';
import {
  IsStrongPassword,
  IsValidUsername,
  IsSafeOrganizationName,
  IsSafeUrl,
  IsValidPhoneNumber,
  NoSqlInjection,
  NoXss,
} from '../decorators/validation.decorators';

class TestPasswordDto {
  @IsStrongPassword()
  password: string;
}

class TestUsernameDto {
  @IsValidUsername()
  username: string;
}

class TestOrganizationDto {
  @IsSafeOrganizationName()
  name: string;
}

class TestUrlDto {
  @IsSafeUrl()
  url: string;
}

class TestPhoneDto {
  @IsValidPhoneNumber()
  phone: string;
}

class TestSqlInjectionDto {
  @NoSqlInjection()
  input: string;
}

class TestXssDto {
  @NoXss()
  input: string;
}

describe('Validation Decorators', () => {
  describe('@IsStrongPassword', () => {
    it('should accept strong passwords', async () => {
      const dto = plainToClass(TestPasswordDto, { password: 'MySecureP@ssw0rd123' });
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('should reject weak passwords', async () => {
      const weakPasswords = [
        'password123',
        'short',
        'NoNumbers!',
        'nospecialchars123',
        'NOLOWERCASE123!',
      ];

      for (const password of weakPasswords) {
        const dto = plainToClass(TestPasswordDto, { password });
        const errors = await validate(dto);
        expect(errors.length).toBeGreaterThan(0);
      }
    });
  });

  describe('@IsValidUsername', () => {
    it('should accept valid usernames', async () => {
      const validUsernames = ['user123', 'test_user', 'valid-username'];

      for (const username of validUsernames) {
        const dto = plainToClass(TestUsernameDto, { username });
        const errors = await validate(dto);
        expect(errors).toHaveLength(0);
      }
    });

    it('should reject invalid usernames', async () => {
      const invalidUsernames = [
        'ab', // too short
        'a'.repeat(60), // too long
        'user@name', // invalid character
        '_username', // starts with underscore
        'admin', // reserved
      ];

      for (const username of invalidUsernames) {
        const dto = plainToClass(TestUsernameDto, { username });
        const errors = await validate(dto);
        expect(errors.length).toBeGreaterThan(0);
      }
    });
  });

  describe('@IsSafeOrganizationName', () => {
    it('should accept safe organization names', async () => {
      const safeNames = ['Acme Corp', 'Test Company Ltd.', 'My Business & Co.'];

      for (const name of safeNames) {
        const dto = plainToClass(TestOrganizationDto, { name });
        const errors = await validate(dto);
        expect(errors).toHaveLength(0);
      }
    });

    it('should reject unsafe organization names', async () => {
      const unsafeNames = [
        '<script>alert("xss")</script>',
        'javascript:alert("xss")',
        'A', // too short
        'A'.repeat(150), // too long
      ];

      for (const name of unsafeNames) {
        const dto = plainToClass(TestOrganizationDto, { name });
        const errors = await validate(dto);
        expect(errors.length).toBeGreaterThan(0);
      }
    });
  });

  describe('@IsSafeUrl', () => {
    it('should accept safe URLs', async () => {
      const safeUrls = [
        'https://example.com',
        'http://test.org/path',
        '', // empty is allowed
      ];

      for (const url of safeUrls) {
        const dto = plainToClass(TestUrlDto, { url });
        const errors = await validate(dto);
        expect(errors).toHaveLength(0);
      }
    });

    it('should reject unsafe URLs', async () => {
      const unsafeUrls = [
        'javascript:alert("xss")',
        'data:text/html,<script>alert("xss")</script>',
        'ftp://example.com',
        'not-a-url',
      ];

      for (const url of unsafeUrls) {
        const dto = plainToClass(TestUrlDto, { url });
        const errors = await validate(dto);
        expect(errors.length).toBeGreaterThan(0);
      }
    });
  });

  describe('@IsValidPhoneNumber', () => {
    it('should accept valid phone numbers', async () => {
      const validPhones = [
        '+1234567890',
        '+212600000000',
        '1234567890',
        '', // empty is allowed
      ];

      for (const phone of validPhones) {
        const dto = plainToClass(TestPhoneDto, { phone });
        const errors = await validate(dto);
        expect(errors).toHaveLength(0);
      }
    });

    it('should reject invalid phone numbers', async () => {
      const invalidPhones = [
        '123', // too short
        '+1234567890123456789', // too long
        '+0123456789', // starts with 0 after +
      ];

      for (const phone of invalidPhones) {
        const dto = plainToClass(TestPhoneDto, { phone });
        const errors = await validate(dto);
        expect(errors.length).toBeGreaterThan(0);
      }
    });
  });

  describe('@NoSqlInjection', () => {
    it('should accept safe input', async () => {
      const safeInputs = [
        'normal text',
        'user@example.com',
        'valid input 123',
      ];

      for (const input of safeInputs) {
        const dto = plainToClass(TestSqlInjectionDto, { input });
        const errors = await validate(dto);
        expect(errors).toHaveLength(0);
      }
    });

    it('should reject SQL injection attempts', async () => {
      const maliciousInputs = [
        "'; DROP TABLE users; --",
        'SELECT * FROM users',
        'UNION SELECT password FROM users',
        "' OR '1'='1",
      ];

      for (const input of maliciousInputs) {
        const dto = plainToClass(TestSqlInjectionDto, { input });
        const errors = await validate(dto);
        expect(errors.length).toBeGreaterThan(0);
      }
    });
  });

  describe('@NoXss', () => {
    it('should accept safe input', async () => {
      const safeInputs = [
        'normal text',
        'user@example.com',
        'valid input with <em>emphasis</em>',
      ];

      for (const input of safeInputs) {
        const dto = plainToClass(TestXssDto, { input });
        const errors = await validate(dto);
        expect(errors).toHaveLength(0);
      }
    });

    it('should reject XSS attempts', async () => {
      const maliciousInputs = [
        '<script>alert("xss")</script>',
        '<iframe src="javascript:alert(\'xss\')"></iframe>',
        'javascript:alert("xss")',
        '<img onerror="alert(\'xss\')" src="x">',
      ];

      for (const input of maliciousInputs) {
        const dto = plainToClass(TestXssDto, { input });
        const errors = await validate(dto);
        expect(errors.length).toBeGreaterThan(0);
      }
    });
  });
});