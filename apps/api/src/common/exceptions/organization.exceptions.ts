import { BadRequestException, ConflictException } from '@nestjs/common';

export class OrganizationCodeGenerationException extends BadRequestException {
  constructor(organizationName: string) {
    super({
      message: 'Failed to generate unique organization code',
      error: 'ORGANIZATION_CODE_GENERATION_FAILED',
      details: {
        organizationName,
        suggestion: 'Please try a different organization name or contact support',
      },
    });
  }
}

export class OrganizationNameTooShortException extends BadRequestException {
  constructor(name: string, minLength: number = 2) {
    super({
      message: `Organization name must be at least ${minLength} characters long`,
      error: 'ORGANIZATION_NAME_TOO_SHORT',
      details: {
        providedName: name,
        providedLength: name.length,
        minimumLength: minLength,
      },
    });
  }
}

export class OrganizationCodeInvalidFormatException extends BadRequestException {
  constructor(code: string) {
    super({
      message: 'Organization code format is invalid',
      error: 'ORGANIZATION_CODE_INVALID_FORMAT',
      details: {
        providedCode: code,
        requirements: [
          'Must be 3-20 characters long',
          'Can only contain uppercase letters, numbers, and underscores',
          'Cannot start or end with underscores',
        ],
      },
    });
  }
}

export class OrganizationCodeAlreadyExistsException extends ConflictException {
  constructor(code: string) {
    super({
      message: 'Organization code already exists',
      error: 'ORGANIZATION_CODE_EXISTS',
      details: {
        code,
        suggestion: 'Please choose a different organization name',
      },
    });
  }
}

export class OrganizationEmailDomainInUseException extends ConflictException {
  constructor(email: string, domain: string) {
    super({
      message: 'Email domain is already in use by another organization',
      error: 'ORGANIZATION_EMAIL_DOMAIN_IN_USE',
      details: {
        email,
        domain,
        suggestion: 'Please use a different email domain for your organization',
      },
    });
  }
}