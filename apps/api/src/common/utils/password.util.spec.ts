import { Test, TestingModule } from '@nestjs/testing';
import { PasswordUtil } from './password.util';
import * as bcrypt from 'bcrypt';

// Mock bcrypt
jest.mock('bcrypt');
const mockedBcrypt = bcrypt as jest.Mocked<typeof bcrypt>;

describe('PasswordUtil', () => {
  let util: PasswordUtil;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [PasswordUtil],
    }).compile();

    util = module.get<PasswordUtil>(PasswordUtil);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(util).toBeDefined();
  });

  describe('hashPassword', () => {
    it('should hash password with bcrypt', async () => {
      const password = 'testPassword123!';
      const hashedPassword = 'hashedPassword123';

      mockedBcrypt.hash.mockResolvedValue(hashedPassword as never);

      const result = await util.hashPassword(password);

      expect(result).toBe(hashedPassword);
      expect(mockedBcrypt.hash).toHaveBeenCalledWith(password, 12);
    });
  });

  describe('validatePassword', () => {
    it('should validate correct password', async () => {
      const password = 'testPassword123!';
      const hash = 'hashedPassword123';

      mockedBcrypt.compare.mockResolvedValue(true as never);

      const result = await util.validatePassword(password, hash);

      expect(result).toBe(true);
      expect(mockedBcrypt.compare).toHaveBeenCalledWith(password, hash);
    });

    it('should reject incorrect password', async () => {
      const password = 'wrongPassword';
      const hash = 'hashedPassword123';

      mockedBcrypt.compare.mockResolvedValue(false as never);

      const result = await util.validatePassword(password, hash);

      expect(result).toBe(false);
      expect(mockedBcrypt.compare).toHaveBeenCalledWith(password, hash);
    });
  });

  describe('validatePasswordStrength', () => {
    it('should validate strong password', () => {
      const strongPassword = 'StrongPassword123!';

      const result = util.validatePasswordStrength(strongPassword);

      expect(result.isValid).toBe(true);
      expect(result.score).toBe(4);
      expect(result.feedback).toHaveLength(0);
    });

    it('should reject password that is too short', () => {
      const shortPassword = 'Short1!';

      const result = util.validatePasswordStrength(shortPassword);

      expect(result.isValid).toBe(false);
      expect(result.feedback).toContain('Password must be at least 8 characters long');
    });

    it('should reject password without uppercase letter', () => {
      const password = 'lowercase123!';

      const result = util.validatePasswordStrength(password);

      expect(result.isValid).toBe(false);
      expect(result.feedback).toContain('Password must contain at least one uppercase letter');
    });

    it('should reject password without lowercase letter', () => {
      const password = 'UPPERCASE123!';

      const result = util.validatePasswordStrength(password);

      expect(result.isValid).toBe(false);
      expect(result.feedback).toContain('Password must contain at least one lowercase letter');
    });

    it('should reject password without number', () => {
      const password = 'NoNumbersHere!';

      const result = util.validatePasswordStrength(password);

      expect(result.isValid).toBe(false);
      expect(result.feedback).toContain('Password must contain at least one number');
    });

    it('should reject password without special character', () => {
      const password = 'NoSpecialChars123';

      const result = util.validatePasswordStrength(password);

      expect(result.isValid).toBe(false);
      expect(result.feedback).toContain('Password must contain at least one special character');
    });

    it('should reject common passwords', () => {
      const commonPassword = 'password123';

      const result = util.validatePasswordStrength(commonPassword);

      expect(result.isValid).toBe(false);
      expect(result.feedback).toContain('Password is too common, please choose a more unique password');
      expect(result.score).toBeLessThan(4);
    });

    it('should provide multiple feedback messages for weak password', () => {
      const weakPassword = 'weak';

      const result = util.validatePasswordStrength(weakPassword);

      expect(result.isValid).toBe(false);
      expect(result.score).toBe(1); // Gets 1 point for lowercase
      expect(result.feedback.length).toBeGreaterThan(1);
      expect(result.feedback).toContain('Password must be at least 8 characters long');
      expect(result.feedback).toContain('Password must contain at least one uppercase letter');
      expect(result.feedback).toContain('Password must contain at least one number');
      expect(result.feedback).toContain('Password must contain at least one special character');
    });

    it('should calculate correct score for partially strong password', () => {
      const partialPassword = 'PartialPassword'; // Missing number and special char

      const result = util.validatePasswordStrength(partialPassword);

      expect(result.isValid).toBe(false);
      expect(result.score).toBe(3); // Length + uppercase + lowercase
      expect(result.feedback).toContain('Password must contain at least one number');
      expect(result.feedback).toContain('Password must contain at least one special character');
    });
  });

  describe('generateResetToken', () => {
    it('should generate a reset token', () => {
      const token = util.generateResetToken();

      expect(token).toBeDefined();
      expect(typeof token).toBe('string');
      expect(token.length).toBeGreaterThan(10);
    });

    it('should generate unique tokens', () => {
      const token1 = util.generateResetToken();
      const token2 = util.generateResetToken();

      expect(token1).not.toBe(token2);
    });

    it('should generate tokens with only alphanumeric characters', () => {
      const token = util.generateResetToken();

      expect(token).toMatch(/^[a-z0-9]+$/);
    });
  });
});