# Input Validation and Sanitization System

## Overview

The Confirmelo Authentication System includes a comprehensive input validation and sanitization system designed to prevent injection attacks, ensure data integrity, and provide enterprise-grade security for all authentication endpoints.

## Features

### 🛡️ Security Features
- **SQL Injection Prevention**: Detects and blocks common SQL injection patterns
- **XSS Protection**: Prevents cross-site scripting attacks through input sanitization
- **Request Size Limits**: Configurable size limits to prevent DoS attacks
- **Rate Limiting**: Intelligent rate limiting with Redis backend
- **Suspicious Pattern Detection**: Identifies and logs potentially malicious input

### 🔧 Validation Features
- **Strong Password Validation**: Enforces complex password requirements
- **Email Format Validation**: RFC-compliant email validation with security checks
- **Username Validation**: Prevents reserved usernames and enforces format rules
- **Phone Number Validation**: International and local phone number format support
- **URL Validation**: Safe URL validation with protocol restrictions
- **Organization Name Validation**: Business-safe organization name validation

### 🧹 Sanitization Features
- **Input Sanitization**: Removes control characters and normalizes input
- **Data Transformation**: Automatic data transformation and normalization
- **Logging Sanitization**: Removes sensitive data from logs
- **Recursive Object Sanitization**: Deep sanitization of nested objects

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Validation Pipeline                       │
├─────────────────────────────────────────────────────────────┤
│  1. Request Size Check (Middleware)                         │
│  2. Rate Limiting (Guard)                                   │
│  3. Input Sanitization (Pipe)                              │
│  4. Custom Validation (Decorators)                         │
│  5. Class Validation (class-validator)                     │
│  6. Security Event Logging                                 │
└─────────────────────────────────────────────────────────────┘
```

## Components

### Services

#### ValidationService
Provides business rule validation methods:
- `validatePasswordStrength()` - Comprehensive password strength validation
- `validateEmail()` - Enhanced email format validation
- `validateUsername()` - Username format and reservation checks
- `validatePhoneNumber()` - International phone number validation
- `validateOrganizationName()` - Safe organization name validation
- `validateUrl()` - Secure URL validation
- `validateRequestSize()` - Request size validation
- `validateSessionId()` - Session ID format validation

#### SanitizationService
Provides input sanitization methods:
- `sanitizeString()` - General string sanitization
- `sanitizeEmail()` - Email-specific sanitization
- `sanitizePhoneNumber()` - Phone number sanitization
- `sanitizeUrl()` - URL sanitization
- `sanitizeUsername()` - Username sanitization
- `sanitizeOrganizationName()` - Organization name sanitization
- `sanitizeObject()` - Recursive object sanitization
- `sanitizeForLogging()` - Log-safe data sanitization

### Decorators

#### Security Decorators
- `@NoSqlInjection()` - Prevents SQL injection attacks
- `@NoXss()` - Prevents XSS attacks

#### Business Rule Decorators
- `@IsStrongPassword()` - Enforces strong password requirements
- `@IsValidUsername()` - Validates username format and restrictions
- `@IsSafeOrganizationName()` - Validates organization names
- `@IsSafeUrl()` - Validates URLs with security checks
- `@IsValidPhoneNumber()` - Validates phone number formats

#### Rate Limiting Decorators
- `@AuthRateLimit()` - General auth endpoint rate limiting (10/min)
- `@LoginRateLimit()` - Login-specific rate limiting (5/min)
- `@RegisterRateLimit()` - Registration rate limiting (3/min)
- `@PasswordResetRateLimit()` - Password reset rate limiting (2/min)

### Guards

#### RateLimitGuard
- Redis-backed rate limiting
- IP-based and user-based limits
- Configurable time windows
- Automatic threat detection and logging

### Pipes

#### EnhancedValidationPipe
- Request size validation
- Input sanitization
- Custom validation decorator support
- Structured error responses

#### AuthValidationPipe
- Enhanced security for authentication endpoints
- Suspicious pattern detection
- Template injection prevention
- Prototype pollution protection

### Middleware

#### RequestSizeMiddleware
- Configurable size limits per endpoint type
- Early request rejection
- Security event logging

## Usage Examples

### Basic DTO with Validation

```typescript
import { 
  IsEmail, 
  IsString, 
  MinLength, 
  MaxLength 
} from 'class-validator';
import { 
  IsStrongPassword, 
  IsValidUsername, 
  NoSqlInjection, 
  NoXss 
} from '../common/validation/decorators/validation.decorators';
import { Transform } from 'class-transformer';

export class CreateUserDto {
  @IsEmail({}, { message: 'Please provide a valid email address' })
  @NoSqlInjection()
  @NoXss()
  @Transform(({ value }) => value?.toLowerCase()?.trim())
  email: string;

  @IsString({ message: 'Username must be a string' })
  @MinLength(3, { message: 'Username must be at least 3 characters long' })
  @MaxLength(50, { message: 'Username must be no more than 50 characters long' })
  @IsValidUsername()
  @NoSqlInjection()
  @NoXss()
  @Transform(({ value }) => value?.toLowerCase()?.trim())
  username: string;

  @IsString({ message: 'Password must be a string' })
  @MinLength(12, { message: 'Password must be at least 12 characters long' })
  @MaxLength(128, { message: 'Password must be no more than 128 characters long' })
  @IsStrongPassword()
  @NoSqlInjection()
  @NoXss()
  password: string;
}
```

### Controller with Rate Limiting

```typescript
import { Controller, Post, Body, UseGuards, UsePipes } from '@nestjs/common';
import { RateLimitGuard } from '../common/validation/guards/rate-limit.guard';
import { AuthValidationPipe } from '../common/validation/pipes/enhanced-validation.pipe';
import { LoginRateLimit } from '../common/validation/decorators/rate-limit.decorator';

@Controller('auth')
export class AuthController {
  @Post('login')
  @UseGuards(RateLimitGuard)
  @LoginRateLimit()
  @UsePipes(AuthValidationPipe)
  async login(@Body() dto: LoginDto) {
    // Implementation
  }
}
```

### Manual Validation

```typescript
import { ValidationService, SanitizationService } from '../common/validation';

@Injectable()
export class UserService {
  constructor(
    private readonly validationService: ValidationService,
    private readonly sanitizationService: SanitizationService,
  ) {}

  async createUser(userData: any) {
    // Sanitize input
    const sanitizedData = this.sanitizationService.sanitizeObject(userData);
    
    // Validate password strength
    const passwordValidation = this.validationService.validatePasswordStrength(
      sanitizedData.password
    );
    
    if (!passwordValidation.isValid) {
      throw new BadRequestException({
        message: 'Password does not meet requirements',
        feedback: passwordValidation.feedback,
      });
    }
    
    // Continue with user creation
  }
}
```

## Configuration

### Rate Limiting Configuration

Rate limits can be configured per endpoint:

```typescript
// Custom rate limit
@RateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10, // 10 requests per minute
  message: 'Too many requests, please try again later',
  skipSuccessfulRequests: true,
})
```

### Request Size Configuration

Request size limits are configured in the middleware:

```typescript
// In RequestSizeMiddleware
private getMaxSizeForEndpoint(path: string): number {
  if (path.includes('/auth/register')) return 50; // 50KB
  if (path.includes('/auth/login')) return 10; // 10KB
  if (path.includes('/users/avatar')) return 5120; // 5MB
  return 100; // 100KB default
}
```

## Security Events

The system logs comprehensive security events:

### Event Types
- `REQUEST_SIZE_EXCEEDED` - Request exceeds size limits
- `RATE_LIMIT_EXCEEDED` - Rate limit violations
- `SUSPICIOUS_AUTH_INPUT` - Suspicious input patterns detected
- `VALIDATION_FAILED` - Validation failures
- `SUSPICIOUS_ORG_NAME` - Suspicious organization names
- `INVALID_URL_PROTOCOL` - Invalid URL protocols
- `INVALID_URL_FORMAT` - Malformed URLs

### Event Data
Each security event includes:
- Timestamp
- IP address
- User agent
- Request details
- Sanitized input data
- Error context

## Testing

### Unit Tests
- Validation service tests (24 test cases)
- Sanitization service tests (14 test cases)
- Validation decorator tests (comprehensive coverage)

### Integration Tests
- End-to-end validation pipeline testing
- Rate limiting behavior verification
- Security event logging validation
- Performance impact assessment

### Running Tests

```bash
# Run all validation tests
npm test -- --testPathPattern=validation

# Run specific test suites
npm test -- sanitization.service.spec.ts
npm test -- validation.service.spec.ts
npm test -- validation.decorators.spec.ts
npm test -- validation.integration.spec.ts
```

## Performance Considerations

### Optimization Features
- Efficient regex patterns for validation
- Minimal memory allocation in sanitization
- Redis-backed rate limiting for scalability
- Early request rejection for oversized requests

### Performance Metrics
- Validation processing time: < 10ms per request
- Sanitization overhead: < 5ms per request
- Rate limiting lookup: < 2ms per request
- Memory usage: < 1MB per validation instance

## Security Best Practices

### Input Handling
1. **Always sanitize before validation**
2. **Use whitelist validation over blacklist**
3. **Implement multiple layers of validation**
4. **Log all security events**
5. **Fail securely with generic error messages**

### Rate Limiting
1. **Use different limits for different endpoints**
2. **Implement progressive delays**
3. **Monitor for distributed attacks**
4. **Whitelist legitimate high-volume users**

### Error Handling
1. **Never expose internal validation logic**
2. **Provide helpful but secure error messages**
3. **Log detailed errors internally**
4. **Use correlation IDs for debugging**

## Troubleshooting

### Common Issues

#### Validation Errors
```typescript
// Check validation decorator order
@Transform(({ value }) => value?.trim()) // First: transform
@IsString() // Second: basic validation
@IsStrongPassword() // Third: custom validation
password: string;
```

#### Rate Limiting Issues
```typescript
// Ensure Redis is properly configured
// Check rate limit keys in Redis
await redisService.get('rate_limit:127.0.0.1:/auth/login');
```

#### Performance Issues
```typescript
// Monitor validation performance
const startTime = Date.now();
await validate(dto);
const endTime = Date.now();
console.log(`Validation took ${endTime - startTime}ms`);
```

## Migration Guide

### From Basic Validation
1. Replace basic `@IsString()` with enhanced decorators
2. Add sanitization transforms
3. Implement rate limiting guards
4. Add security event logging

### Configuration Updates
1. Update DTOs with new validation decorators
2. Add rate limiting to controllers
3. Configure request size limits
4. Set up security monitoring

## Contributing

### Adding New Validators
1. Create validator constraint class
2. Implement validation logic
3. Add decorator function
4. Write comprehensive tests
5. Update documentation

### Security Considerations
1. All validators must be injection-safe
2. Implement proper error handling
3. Add security event logging
4. Consider performance impact
5. Follow principle of least privilege

## Support

For issues related to the validation system:
1. Check the troubleshooting section
2. Review security event logs
3. Verify configuration settings
4. Run diagnostic tests
5. Contact the development team

---

**Note**: This validation system is designed for enterprise-grade security. Always keep security dependencies updated and monitor for new threat patterns.