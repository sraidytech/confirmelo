import {
  registerDecorator,
  ValidationOptions,
  ValidatorConstraint,
  ValidatorConstraintInterface,
  ValidationArguments,
} from 'class-validator';
import { Injectable } from '@nestjs/common';

// Strong Password Validator
@ValidatorConstraint({ name: 'isStrongPassword', async: false })
@Injectable()
export class IsStrongPasswordConstraint implements ValidatorConstraintInterface {
  validate(password: string, args: ValidationArguments) {
    if (!password || typeof password !== 'string') {
      return false;
    }

    const requirements = {
      minLength: password.length >= 12,
      hasUppercase: /[A-Z]/.test(password),
      hasLowercase: /[a-z]/.test(password),
      hasNumber: /\d/.test(password),
      hasSpecialChar: /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password),
      notCommon: !this.isCommonPassword(password),
    };

    return Object.values(requirements).every(req => req);
  }

  defaultMessage(args: ValidationArguments) {
    return 'Password must be at least 12 characters long and contain uppercase, lowercase, number, special character, and not be a common password';
  }

  private isCommonPassword(password: string): boolean {
    const commonPasswords = [
      'password', '123456', '123456789', 'qwerty', 'abc123', 'password123',
      'admin', 'letmein', 'welcome', 'monkey', 'dragon', 'master', 'shadow',
      'superman', 'michael', 'football', 'baseball', 'liverpool', 'jordan',
      'princess', 'sunshine', 'iloveyou', 'lovely', 'ashley', 'computer',
      'trustno1', 'freedom', 'charlie', 'internet', 'service', 'dallas',
      'anthony', 'london', 'access', 'washington', 'phoenix', 'system',
      'gateway', 'username', 'changeme', 'foobar', 'test', 'guest', 'info',
    ];

    const lowerPassword = password.toLowerCase();
    return commonPasswords.some(common => 
      lowerPassword.includes(common) || common.includes(lowerPassword)
    );
  }
}

export function IsStrongPassword(validationOptions?: ValidationOptions) {
  return function (object: Object, propertyName: string) {
    registerDecorator({
      target: object.constructor,
      propertyName: propertyName,
      options: validationOptions,
      constraints: [],
      validator: IsStrongPasswordConstraint,
    });
  };
}

// Valid Username Validator
@ValidatorConstraint({ name: 'isValidUsername', async: false })
@Injectable()
export class IsValidUsernameConstraint implements ValidatorConstraintInterface {
  validate(username: string, args: ValidationArguments) {
    if (!username || typeof username !== 'string') {
      return false;
    }

    // Length check
    if (username.length < 3 || username.length > 50) {
      return false;
    }

    // Format check
    if (!/^[a-zA-Z0-9_-]+$/.test(username)) {
      return false;
    }

    // Cannot start or end with special characters
    if (/^[_-]/.test(username) || /[_-]$/.test(username)) {
      return false;
    }

    // Cannot have consecutive special characters
    if (/[_-]{2,}/.test(username)) {
      return false;
    }

    // Check for reserved usernames
    const reservedUsernames = [
      'admin', 'administrator', 'root', 'system', 'api', 'www', 'mail',
      'ftp', 'test', 'guest', 'user', 'support', 'help', 'info', 'contact',
      'service', 'null', 'undefined', 'true', 'false', 'public', 'private',
    ];

    if (reservedUsernames.includes(username.toLowerCase())) {
      return false;
    }

    return true;
  }

  defaultMessage(args: ValidationArguments) {
    return 'Username must be 3-50 characters, contain only letters, numbers, underscores, and hyphens, and not be reserved';
  }
}

export function IsValidUsername(validationOptions?: ValidationOptions) {
  return function (object: Object, propertyName: string) {
    registerDecorator({
      target: object.constructor,
      propertyName: propertyName,
      options: validationOptions,
      constraints: [],
      validator: IsValidUsernameConstraint,
    });
  };
}

// Safe Organization Name Validator
@ValidatorConstraint({ name: 'isSafeOrganizationName', async: false })
@Injectable()
export class IsSafeOrganizationNameConstraint implements ValidatorConstraintInterface {
  validate(name: string, args: ValidationArguments) {
    if (!name || typeof name !== 'string') {
      return false;
    }

    // Length check
    if (name.trim().length < 2 || name.length > 100) {
      return false;
    }

    // Check for suspicious patterns
    if (/<script|javascript:|data:|vbscript:/i.test(name)) {
      return false;
    }

    // Check for excessive special characters
    const specialCharCount = (name.match(/[^a-zA-Z0-9\s\.,\-&]/g) || []).length;
    if (specialCharCount > name.length * 0.2) {
      return false;
    }

    return true;
  }

  defaultMessage(args: ValidationArguments) {
    return 'Organization name must be 2-100 characters and contain safe content';
  }
}

export function IsSafeOrganizationName(validationOptions?: ValidationOptions) {
  return function (object: Object, propertyName: string) {
    registerDecorator({
      target: object.constructor,
      propertyName: propertyName,
      options: validationOptions,
      constraints: [],
      validator: IsSafeOrganizationNameConstraint,
    });
  };
}

// Safe URL Validator
@ValidatorConstraint({ name: 'isSafeUrl', async: false })
@Injectable()
export class IsSafeUrlConstraint implements ValidatorConstraintInterface {
  validate(url: string, args: ValidationArguments) {
    if (!url) {
      return true; // URL is optional
    }

    if (typeof url !== 'string') {
      return false;
    }

    if (url.length > 2048) {
      return false;
    }

    try {
      const urlObj = new URL(url);
      
      // Only allow HTTP and HTTPS
      if (!['http:', 'https:'].includes(urlObj.protocol)) {
        return false;
      }

      // Check for suspicious patterns
      if (/javascript:|data:|vbscript:/i.test(url)) {
        return false;
      }

      return true;
    } catch (error) {
      return false;
    }
  }

  defaultMessage(args: ValidationArguments) {
    return 'URL must be a valid HTTP or HTTPS URL';
  }
}

export function IsSafeUrl(validationOptions?: ValidationOptions) {
  return function (object: Object, propertyName: string) {
    registerDecorator({
      target: object.constructor,
      propertyName: propertyName,
      options: validationOptions,
      constraints: [],
      validator: IsSafeUrlConstraint,
    });
  };
}

// Enhanced Phone Number Validator
@ValidatorConstraint({ name: 'isValidPhoneNumber', async: false })
@Injectable()
export class IsValidPhoneNumberConstraint implements ValidatorConstraintInterface {
  validate(phone: string, args: ValidationArguments) {
    if (!phone) {
      return true; // Phone is optional
    }

    if (typeof phone !== 'string') {
      return false;
    }

    // Remove all non-digit characters except +
    const cleanPhone = phone.replace(/[^\d+]/g, '');

    if (cleanPhone.length < 7 || cleanPhone.length > 15) {
      return false;
    }

    // Check for valid international format
    if (cleanPhone.startsWith('+')) {
      return /^\+[1-9]\d{6,14}$/.test(cleanPhone);
    } else {
      // Local format validation
      return /^\d{7,15}$/.test(cleanPhone);
    }
  }

  defaultMessage(args: ValidationArguments) {
    return 'Phone number must be a valid format with 7-15 digits';
  }
}

export function IsValidPhoneNumber(validationOptions?: ValidationOptions) {
  return function (object: Object, propertyName: string) {
    registerDecorator({
      target: object.constructor,
      propertyName: propertyName,
      options: validationOptions,
      constraints: [],
      validator: IsValidPhoneNumberConstraint,
    });
  };
}

// No SQL Injection Validator
@ValidatorConstraint({ name: 'noSqlInjection', async: false })
@Injectable()
export class NoSqlInjectionConstraint implements ValidatorConstraintInterface {
  validate(value: any, args: ValidationArguments) {
    if (!value) {
      return true;
    }

    const stringValue = typeof value === 'string' ? value : JSON.stringify(value);
    
    // Check for common SQL injection patterns
    const sqlInjectionPatterns = [
      /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|EXEC|UNION|SCRIPT)\b)/i,
      /[';\\|*%<>^[\]{}()]/,
      /((\%3C)|<)((\%2F)|\/)*[a-z0-9\%]+((\%3E)|>)/i,
      /((\%3C)|<)((\%69)|i|(\%49))((\%6D)|m|(\%4D))((\%67)|g|(\%47))[^\n]+((\%3E)|>)/i,
    ];

    return !sqlInjectionPatterns.some(pattern => pattern.test(stringValue));
  }

  defaultMessage(args: ValidationArguments) {
    return 'Input contains potentially dangerous content';
  }
}

export function NoSqlInjection(validationOptions?: ValidationOptions) {
  return function (object: Object, propertyName: string) {
    registerDecorator({
      target: object.constructor,
      propertyName: propertyName,
      options: validationOptions,
      constraints: [],
      validator: NoSqlInjectionConstraint,
    });
  };
}

// No XSS Validator
@ValidatorConstraint({ name: 'noXss', async: false })
@Injectable()
export class NoXssConstraint implements ValidatorConstraintInterface {
  validate(value: any, args: ValidationArguments) {
    if (!value) {
      return true;
    }

    const stringValue = typeof value === 'string' ? value : JSON.stringify(value);
    
    // Check for common XSS patterns
    const xssPatterns = [
      /<script[^>]*>.*?<\/script>/gi,
      /<iframe[^>]*>.*?<\/iframe>/gi,
      /<object[^>]*>.*?<\/object>/gi,
      /<embed[^>]*>.*?<\/embed>/gi,
      /<link[^>]*>/gi,
      /<meta[^>]*>/gi,
      /javascript:/gi,
      /vbscript:/gi,
      /data:text\/html/gi,
      /on\w+\s*=/gi,
    ];

    return !xssPatterns.some(pattern => pattern.test(stringValue));
  }

  defaultMessage(args: ValidationArguments) {
    return 'Input contains potentially dangerous script content';
  }
}

export function NoXss(validationOptions?: ValidationOptions) {
  return function (object: Object, propertyName: string) {
    registerDecorator({
      target: object.constructor,
      propertyName: propertyName,
      options: validationOptions,
      constraints: [],
      validator: NoXssConstraint,
    });
  };
}