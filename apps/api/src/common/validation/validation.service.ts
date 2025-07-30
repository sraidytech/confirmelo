import { Injectable } from '@nestjs/common';
import { LoggingService } from '../services/logging.service';

@Injectable()
export class ValidationService {
  constructor(private readonly loggingService: LoggingService) {}

  /**
   * Validate password strength according to business rules
   */
  validatePasswordStrength(password: string): {
    isValid: boolean;
    score: number;
    feedback: string[];
    requirements: {
      minLength: boolean;
      hasUppercase: boolean;
      hasLowercase: boolean;
      hasNumber: boolean;
      hasSpecialChar: boolean;
      notCommon: boolean;
    };
  } {
    const feedback: string[] = [];
    const requirements = {
      minLength: password.length >= 12,
      hasUppercase: /[A-Z]/.test(password),
      hasLowercase: /[a-z]/.test(password),
      hasNumber: /\d/.test(password),
      hasSpecialChar: /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password),
      notCommon: !this.isCommonPassword(password),
    };

    let score = 0;

    if (!requirements.minLength) {
      feedback.push('Password must be at least 12 characters long');
    } else {
      score += 20;
    }

    if (!requirements.hasUppercase) {
      feedback.push('Password must contain at least one uppercase letter');
    } else {
      score += 15;
    }

    if (!requirements.hasLowercase) {
      feedback.push('Password must contain at least one lowercase letter');
    } else {
      score += 15;
    }

    if (!requirements.hasNumber) {
      feedback.push('Password must contain at least one number');
    } else {
      score += 15;
    }

    if (!requirements.hasSpecialChar) {
      feedback.push('Password must contain at least one special character');
    } else {
      score += 15;
    }

    if (!requirements.notCommon) {
      feedback.push('Password is too common, please choose a more unique password');
    } else {
      score += 20;
    }

    // Additional scoring for length
    if (password.length >= 16) score += 10;
    if (password.length >= 20) score += 10;

    const isValid = Object.values(requirements).every(req => req);

    return {
      isValid,
      score: Math.min(score, 100),
      feedback,
      requirements,
    };
  }

  /**
   * Check if password is in common password list
   */
  private isCommonPassword(password: string): boolean {
    const commonPasswords = [
      'password',
      '123456',
      '123456789',
      'qwerty',
      'abc123',
      'password123',
      'admin',
      'letmein',
      'welcome',
      'monkey',
      'dragon',
      'master',
      'shadow',
      'superman',
      'michael',
      'football',
      'baseball',
      'liverpool',
      'jordan',
      'princess',
      'sunshine',
      'iloveyou',
      'lovely',
      'ashley',
      'computer',
      'trustno1',
      'freedom',
      'charlie',
      'internet',
      'service',
      'dallas',
      'anthony',
      'london',
      'access',
      'washington',
      'phoenix',
      'system',
      'computer',
      'gateway',
      'username',
      'changeme',
      'foobar',
      'test',
      'guest',
      'info',
      'summer',
      'spring',
      'winter',
      'autumn',
    ];

    const lowerPassword = password.toLowerCase();
    return commonPasswords.some(common => 
      lowerPassword.includes(common) || 
      common.includes(lowerPassword)
    );
  }

  /**
   * Validate email format with enhanced checks
   */
  validateEmail(email: string): {
    isValid: boolean;
    errors: string[];
  } {
    const errors: string[] = [];

    if (!email) {
      errors.push('Email is required');
      return { isValid: false, errors };
    }

    if (typeof email !== 'string') {
      errors.push('Email must be a string');
      return { isValid: false, errors };
    }

    // Length check
    if (email.length > 254) {
      errors.push('Email is too long (maximum 254 characters)');
    }

    // Basic format check
    const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
    if (!emailRegex.test(email)) {
      errors.push('Invalid email format');
    }

    // Check for consecutive dots
    if (email.includes('..')) {
      errors.push('Email cannot contain consecutive dots');
    }

    // Check for leading/trailing dots
    if (email.startsWith('.') || email.endsWith('.')) {
      errors.push('Email cannot start or end with a dot');
    }

    // Check local part length (before @)
    const [localPart] = email.split('@');
    if (localPart && localPart.length > 64) {
      errors.push('Email local part is too long (maximum 64 characters)');
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }

  /**
   * Validate username format
   */
  validateUsername(username: string): {
    isValid: boolean;
    errors: string[];
  } {
    const errors: string[] = [];

    if (!username) {
      errors.push('Username is required');
      return { isValid: false, errors };
    }

    if (typeof username !== 'string') {
      errors.push('Username must be a string');
      return { isValid: false, errors };
    }

    if (username.length < 3) {
      errors.push('Username must be at least 3 characters long');
    }

    if (username.length > 50) {
      errors.push('Username must be no more than 50 characters long');
    }

    if (!/^[a-zA-Z0-9_-]+$/.test(username)) {
      errors.push('Username can only contain letters, numbers, underscores, and hyphens');
    }

    if (/^[_-]/.test(username) || /[_-]$/.test(username)) {
      errors.push('Username cannot start or end with underscore or hyphen');
    }

    if (/[_-]{2,}/.test(username)) {
      errors.push('Username cannot contain consecutive underscores or hyphens');
    }

    // Check for reserved usernames
    const reservedUsernames = [
      'admin', 'administrator', 'root', 'system', 'api', 'www', 'mail',
      'ftp', 'test', 'guest', 'user', 'support', 'help', 'info', 'contact',
      'service', 'null', 'undefined', 'true', 'false', 'public', 'private',
    ];

    if (reservedUsernames.includes(username.toLowerCase())) {
      errors.push('Username is reserved and cannot be used');
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }

  /**
   * Validate phone number format
   */
  validatePhoneNumber(phone: string): {
    isValid: boolean;
    errors: string[];
  } {
    const errors: string[] = [];

    if (!phone) {
      return { isValid: true, errors }; // Phone is optional
    }

    if (typeof phone !== 'string') {
      errors.push('Phone number must be a string');
      return { isValid: false, errors };
    }

    // Remove all non-digit characters except +
    const cleanPhone = phone.replace(/[^\d+]/g, '');

    if (cleanPhone.length < 7) {
      errors.push('Phone number is too short');
    }

    if (cleanPhone.length > 15) {
      errors.push('Phone number is too long');
    }

    // Check for valid international format
    if (cleanPhone.startsWith('+')) {
      if (!/^\+[1-9]\d{6,14}$/.test(cleanPhone)) {
        errors.push('Invalid international phone number format');
      }
    } else {
      // Local format validation (basic)
      if (!/^\d{7,15}$/.test(cleanPhone)) {
        errors.push('Invalid phone number format');
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }

  /**
   * Validate organization name
   */
  validateOrganizationName(name: string): {
    isValid: boolean;
    errors: string[];
  } {
    const errors: string[] = [];

    if (!name) {
      errors.push('Organization name is required');
      return { isValid: false, errors };
    }

    if (typeof name !== 'string') {
      errors.push('Organization name must be a string');
      return { isValid: false, errors };
    }

    if (name.trim().length < 2) {
      errors.push('Organization name must be at least 2 characters long');
    }

    if (name.length > 100) {
      errors.push('Organization name must be no more than 100 characters long');
    }

    // Check for suspicious patterns
    if (/<script|javascript:|data:|vbscript:/i.test(name)) {
      errors.push('Organization name contains invalid content');
      this.loggingService.logSecurity({
        event: 'SUSPICIOUS_ORG_NAME',
        userId: undefined,
        ipAddress: 'system',
        success: false,
        riskLevel: 'HIGH',
        details: { name },
      });
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }

  /**
   * Validate URL format
   */
  validateUrl(url: string): {
    isValid: boolean;
    errors: string[];
  } {
    const errors: string[] = [];

    if (!url) {
      return { isValid: true, errors }; // URL is optional
    }

    if (typeof url !== 'string') {
      errors.push('URL must be a string');
      return { isValid: false, errors };
    }

    if (url.length > 2048) {
      errors.push('URL is too long (maximum 2048 characters)');
    }

    try {
      const urlObj = new URL(url);
      
      if (!['http:', 'https:'].includes(urlObj.protocol)) {
        errors.push('URL must use HTTP or HTTPS protocol');
      }

      // Check for suspicious patterns
      if (/javascript:|data:|vbscript:/i.test(url)) {
        errors.push('URL contains invalid protocol');
        this.loggingService.logSecurity({
          event: 'SUSPICIOUS_URL',
          userId: undefined,
          ipAddress: 'system',
          success: false,
          riskLevel: 'HIGH',
          details: { url },
        });
      }

    } catch (error) {
      errors.push('Invalid URL format');
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }

  /**
   * Validate request size
   */
  validateRequestSize(data: any, maxSizeKB: number = 100): {
    isValid: boolean;
    sizeKB: number;
    error?: string;
  } {
    try {
      const jsonString = JSON.stringify(data);
      const sizeBytes = Buffer.byteLength(jsonString, 'utf8');
      const sizeKB = sizeBytes / 1024;

      if (sizeKB > maxSizeKB) {
        return {
          isValid: false,
          sizeKB,
          error: `Request size (${sizeKB.toFixed(2)}KB) exceeds maximum allowed size (${maxSizeKB}KB)`,
        };
      }

      return {
        isValid: true,
        sizeKB,
      };
    } catch (error) {
      return {
        isValid: false,
        sizeKB: 0,
        error: 'Unable to calculate request size',
      };
    }
  }

  /**
   * Validate session ID format
   */
  validateSessionId(sessionId: string): {
    isValid: boolean;
    errors: string[];
  } {
    const errors: string[] = [];

    if (!sessionId) {
      errors.push('Session ID is required');
      return { isValid: false, errors };
    }

    if (typeof sessionId !== 'string') {
      errors.push('Session ID must be a string');
      return { isValid: false, errors };
    }

    if (sessionId.length < 10 || sessionId.length > 128) {
      errors.push('Session ID has invalid length');
    }

    if (!/^[a-zA-Z0-9_-]+$/.test(sessionId)) {
      errors.push('Session ID contains invalid characters');
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }
}