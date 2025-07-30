import { Injectable } from '@nestjs/common';
import { LoggingService } from '../services/logging.service';

@Injectable()
export class SanitizationService {
  constructor(private readonly loggingService: LoggingService) {}

  /**
   * Sanitize string input to prevent injection attacks
   */
  sanitizeString(input: string): string {
    if (!input || typeof input !== 'string') {
      return '';
    }

    return input
      .trim()
      // Remove null bytes
      .replace(/\0/g, '')
      // Remove control characters except newlines and tabs
      .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
      // Normalize unicode
      .normalize('NFC')
      // Limit length to prevent DoS
      .substring(0, 10000);
  }

  /**
   * Sanitize email input
   */
  sanitizeEmail(email: string): string {
    if (!email || typeof email !== 'string') {
      return '';
    }

    return email
      .toLowerCase()
      .trim()
      .replace(/\s+/g, '') // Remove all whitespace
      .substring(0, 254); // RFC 5321 limit
  }

  /**
   * Sanitize phone number input
   */
  sanitizePhoneNumber(phone: string): string {
    if (!phone || typeof phone !== 'string') {
      return '';
    }

    return phone
      .trim()
      // Keep only digits, +, -, (, ), and spaces
      .replace(/[^\d\+\-\(\)\s]/g, '')
      .substring(0, 20);
  }

  /**
   * Sanitize URL input
   */
  sanitizeUrl(url: string): string {
    if (!url || typeof url !== 'string') {
      return '';
    }

    const sanitized = url.trim().substring(0, 2048);
    
    // Basic URL validation
    try {
      const urlObj = new URL(sanitized);
      // Only allow http and https protocols
      if (!['http:', 'https:'].includes(urlObj.protocol)) {
        this.loggingService.logSecurity({
          event: 'INVALID_URL_PROTOCOL',
          userId: undefined,
          ipAddress: 'system',
          success: false,
          riskLevel: 'MEDIUM',
          details: {
            url: sanitized,
            protocol: urlObj.protocol,
          },
        });
        return '';
      }
      return urlObj.toString();
    } catch (error) {
      this.loggingService.logSecurity({
        event: 'INVALID_URL_FORMAT',
        userId: undefined,
        ipAddress: 'system',
        success: false,
        riskLevel: 'MEDIUM',
        details: {
          url: sanitized,
          error: error.message,
        },
      });
      return '';
    }
  }

  /**
   * Sanitize username input
   */
  sanitizeUsername(username: string): string {
    if (!username || typeof username !== 'string') {
      return '';
    }

    return username
      .trim()
      .toLowerCase()
      // Keep only alphanumeric, underscore, and hyphen
      .replace(/[^a-z0-9_-]/g, '')
      .substring(0, 50);
  }

  /**
   * Sanitize organization name
   */
  sanitizeOrganizationName(name: string): string {
    if (!name || typeof name !== 'string') {
      return '';
    }

    return name
      .trim()
      // Remove excessive whitespace
      .replace(/\s+/g, ' ')
      // Remove special characters that could be problematic
      .replace(/[<>\"'&]/g, '')
      .substring(0, 100);
  }

  /**
   * Sanitize address input
   */
  sanitizeAddress(address: string): string {
    if (!address || typeof address !== 'string') {
      return '';
    }

    return address
      .trim()
      .replace(/\s+/g, ' ')
      // Allow common address characters
      .replace(/[^a-zA-Z0-9\s\.,\-#\/]/g, '')
      .substring(0, 255);
  }

  /**
   * Sanitize tax ID input
   */
  sanitizeTaxId(taxId: string): string {
    if (!taxId || typeof taxId !== 'string') {
      return '';
    }

    return taxId
      .trim()
      .toUpperCase()
      // Keep only alphanumeric and common separators
      .replace(/[^A-Z0-9\-]/g, '')
      .substring(0, 50);
  }

  /**
   * Sanitize session ID
   */
  sanitizeSessionId(sessionId: string): string {
    if (!sessionId || typeof sessionId !== 'string') {
      return '';
    }

    return sessionId
      .trim()
      // Keep only alphanumeric, underscore, and hyphen (typical session ID format)
      .replace(/[^a-zA-Z0-9_-]/g, '')
      .substring(0, 128);
  }

  /**
   * Sanitize correlation ID
   */
  sanitizeCorrelationId(correlationId: string): string {
    if (!correlationId || typeof correlationId !== 'string') {
      return '';
    }

    return correlationId
      .trim()
      // Keep only alphanumeric and hyphen (UUID format)
      .replace(/[^a-zA-Z0-9-]/g, '')
      .substring(0, 36);
  }

  /**
   * Sanitize object recursively
   */
  sanitizeObject(obj: any): any {
    if (obj === null || obj === undefined) {
      return obj;
    }

    if (typeof obj === 'string') {
      return this.sanitizeString(obj);
    }

    if (typeof obj === 'number' || typeof obj === 'boolean') {
      return obj;
    }

    if (Array.isArray(obj)) {
      return obj.map(item => this.sanitizeObject(item));
    }

    if (typeof obj === 'object') {
      const sanitized: any = {};
      for (const [key, value] of Object.entries(obj)) {
        const sanitizedKey = this.sanitizeString(key);
        sanitized[sanitizedKey] = this.sanitizeObject(value);
      }
      return sanitized;
    }

    return obj;
  }

  /**
   * Remove sensitive information from logs
   */
  sanitizeForLogging(obj: any): any {
    if (obj === null || obj === undefined) {
      return obj;
    }

    if (typeof obj === 'string') {
      return obj;
    }

    if (typeof obj === 'number' || typeof obj === 'boolean') {
      return obj;
    }

    if (Array.isArray(obj)) {
      return obj.map(item => this.sanitizeForLogging(item));
    }

    if (typeof obj === 'object') {
      const sanitized: any = {};
      const sensitiveFields = [
        'password',
        'token',
        'accessToken',
        'refreshToken',
        'sessionToken',
        'secret',
        'key',
        'authorization',
        'cookie',
        'x-api-key',
      ];

      for (const [key, value] of Object.entries(obj)) {
        const lowerKey = key.toLowerCase();
        if (sensitiveFields.some(field => lowerKey.includes(field))) {
          sanitized[key] = '[REDACTED]';
        } else if (lowerKey === 'email') {
          // Mask email for privacy
          const email = value as string;
          if (email && typeof email === 'string' && email.includes('@')) {
            const [local, domain] = email.split('@');
            sanitized[key] = `${local.substring(0, 2)}***@${domain}`;
          } else {
            sanitized[key] = value;
          }
        } else {
          sanitized[key] = this.sanitizeForLogging(value);
        }
      }
      return sanitized;
    }

    return obj;
  }
}