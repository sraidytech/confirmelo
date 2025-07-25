import { Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import {
  OrganizationCodeGenerationException,
  OrganizationNameTooShortException,
  OrganizationCodeInvalidFormatException,
  OrganizationCodeAlreadyExistsException,
} from '../exceptions/organization.exceptions';

@Injectable()
export class OrganizationUtil {
  constructor(private prisma: PrismaService) {}

  /**
   * Generate a unique organization code based on the organization name
   */
  async generateUniqueCode(organizationName: string): Promise<string> {
    // Validate organization name length
    if (!organizationName || organizationName.trim().length < 2) {
      throw new OrganizationNameTooShortException(organizationName);
    }

    // Create base code from organization name
    let baseCode = this.createBaseCode(organizationName);
    
    // Validate base code format
    if (!this.validateCodeFormat(baseCode)) {
      // If base code is invalid, try to create a fallback
      baseCode = this.createFallbackCode(organizationName);
      if (!this.validateCodeFormat(baseCode)) {
        throw new OrganizationCodeGenerationException(organizationName);
      }
    }

    // Check if base code is available
    const existingOrg = await this.prisma.organization.findUnique({
      where: { code: baseCode },
    });

    if (!existingOrg) {
      return baseCode;
    }

    // If base code exists, try with incremental suffixes
    let counter = 1;
    let uniqueCode = `${baseCode}_${counter}`;

    while (await this.codeExists(uniqueCode)) {
      counter++;
      uniqueCode = `${baseCode}_${counter}`;
      
      // Safety check to prevent infinite loop
      if (counter > 999) {
        // Fallback to timestamp-based code
        const timestamp = Date.now().toString().slice(-6); // Last 6 digits
        uniqueCode = `${baseCode.substring(0, 13)}_${timestamp}`;
        
        // Final check - if this still exists, throw error
        if (await this.codeExists(uniqueCode)) {
          throw new OrganizationCodeGenerationException(organizationName);
        }
        break;
      }
    }

    return uniqueCode;
  }

  /**
   * Validate and reserve an organization code
   */
  async validateAndReserveCode(code: string): Promise<boolean> {
    // Validate format
    if (!this.validateCodeFormat(code)) {
      throw new OrganizationCodeInvalidFormatException(code);
    }

    // Check if code already exists
    if (await this.codeExists(code)) {
      throw new OrganizationCodeAlreadyExistsException(code);
    }

    return true;
  }

  /**
   * Create a base code from organization name
   */
  private createBaseCode(name: string): string {
    return name
      .toUpperCase()
      .replace(/[^A-Z0-9\s]/g, '') // Remove special characters
      .replace(/\s+/g, '_') // Replace spaces with underscores
      .replace(/^_+|_+$/g, '') // Remove leading and trailing underscores
      .replace(/_+/g, '_') // Replace multiple underscores with single
      .substring(0, 20); // Limit length
  }

  /**
   * Create a fallback code when base code generation fails
   */
  private createFallbackCode(name: string): string {
    // Extract first letters of each word
    const words = name.trim().split(/\s+/);
    let fallback = words
      .map(word => word.charAt(0).toUpperCase())
      .join('')
      .replace(/[^A-Z0-9]/g, '');

    // If too short, add more characters
    if (fallback.length < 3) {
      const cleanName = name.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
      fallback = cleanName.substring(0, 8);
    }

    // If still too short, add ORG suffix
    if (fallback.length < 3) {
      fallback = 'ORG';
    }

    return fallback;
  }

  /**
   * Check if organization code already exists
   */
  private async codeExists(code: string): Promise<boolean> {
    const existing = await this.prisma.organization.findUnique({
      where: { code },
    });
    return !!existing;
  }

  /**
   * Validate organization code format
   */
  validateCodeFormat(code: string): boolean {
    // Code should be 3-20 characters, uppercase letters, numbers, and underscores only
    // Cannot start or end with underscores
    const codeRegex = /^[A-Z0-9][A-Z0-9_]{1,18}[A-Z0-9]$/;
    
    // Special case for 3-character codes
    if (code.length === 3) {
      return /^[A-Z0-9]{3}$/.test(code);
    }
    
    return codeRegex.test(code) && !code.includes('__'); // No double underscores
  }

  /**
   * Get code generation statistics for monitoring
   */
  async getCodeGenerationStats(): Promise<{
    totalCodes: number;
    codesByLength: Record<number, number>;
    mostCommonPrefixes: Array<{ prefix: string; count: number }>;
  }> {
    const organizations = await this.prisma.organization.findMany({
      select: { code: true },
    });

    const stats = {
      totalCodes: organizations.length,
      codesByLength: {} as Record<number, number>,
      mostCommonPrefixes: [] as Array<{ prefix: string; count: number }>,
    };

    // Calculate length distribution
    organizations.forEach(org => {
      const length = org.code.length;
      stats.codesByLength[length] = (stats.codesByLength[length] || 0) + 1;
    });

    // Calculate common prefixes (first 3 characters)
    const prefixCounts = new Map<string, number>();
    organizations.forEach(org => {
      const prefix = org.code.substring(0, 3);
      prefixCounts.set(prefix, (prefixCounts.get(prefix) || 0) + 1);
    });

    stats.mostCommonPrefixes = Array.from(prefixCounts.entries())
      .map(([prefix, count]) => ({ prefix, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    return stats;
  }

  /**
   * Check if email domain is already used by another organization
   */
  async isEmailDomainAvailable(email: string, excludeOrgId?: string): Promise<boolean> {
    const domain = email.split('@')[1];
    
    const existingOrg = await this.prisma.organization.findFirst({
      where: {
        email: {
          endsWith: `@${domain}`,
        },
        ...(excludeOrgId && { id: { not: excludeOrgId } }),
      },
    });

    return !existingOrg;
  }

  /**
   * Generate organization display name suggestions
   */
  generateNameSuggestions(baseName: string): string[] {
    const suggestions = [
      baseName,
      `${baseName} Store`,
      `${baseName} Shop`,
      `${baseName} E-commerce`,
      `${baseName} Business`,
    ];

    return suggestions.slice(0, 3); // Return top 3 suggestions
  }
}