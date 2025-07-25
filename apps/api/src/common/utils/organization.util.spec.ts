import { Test, TestingModule } from '@nestjs/testing';
import { OrganizationUtil } from './organization.util';
import { PrismaService } from '../database/prisma.service';

describe('OrganizationUtil', () => {
  let util: OrganizationUtil;
  let prismaService: any;

  beforeEach(async () => {
    const mockPrismaService = {
      organization: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
      },
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrganizationUtil,
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    }).compile();

    util = module.get<OrganizationUtil>(OrganizationUtil);
    prismaService = module.get(PrismaService);
  });

  it('should be defined', () => {
    expect(util).toBeDefined();
  });

  describe('generateUniqueCode', () => {
    it('should generate a unique code from organization name', async () => {
      prismaService.organization.findUnique.mockResolvedValue(null);

      const result = await util.generateUniqueCode('Test Organization');

      expect(result).toBe('TEST_ORGANIZATION');
      expect(prismaService.organization.findUnique).toHaveBeenCalledWith({
        where: { code: 'TEST_ORGANIZATION' },
      });
    });

    it('should handle special characters in organization name', async () => {
      prismaService.organization.findUnique.mockResolvedValue(null);

      const result = await util.generateUniqueCode('Test & Co. Organization!');

      expect(result).toBe('TEST_CO_ORGANIZATION');
    });

    it('should generate incremental code when base code exists', async () => {
      prismaService.organization.findUnique
        .mockResolvedValueOnce({ id: 'existing', code: 'TEST_ORG' } as any) // Base code exists
        .mockResolvedValueOnce(null); // TEST_ORG_1 is available

      const result = await util.generateUniqueCode('Test Org');

      expect(result).toBe('TEST_ORG_1');
    });

    it('should limit code length to 20 characters', async () => {
      prismaService.organization.findUnique.mockResolvedValue(null);

      const result = await util.generateUniqueCode('Very Long Organization Name That Exceeds Limits');

      expect(result.length).toBeLessThanOrEqual(20);
      expect(result).toBe('VERY_LONG_ORGANIZATI');
    });

    it('should remove trailing underscores', async () => {
      prismaService.organization.findUnique.mockResolvedValue(null);

      const result = await util.generateUniqueCode('Test Org   ');

      expect(result).toBe('TEST_ORG');
      expect(result.endsWith('_')).toBe(false);
    });

    it('should throw error for organization name that is too short', async () => {
      await expect(util.generateUniqueCode('A')).rejects.toThrow('Organization name must be at least 2 characters long');
    });

    it('should throw error for empty organization name', async () => {
      await expect(util.generateUniqueCode('')).rejects.toThrow('Organization name must be at least 2 characters long');
    });

    it('should handle organization names with only special characters', async () => {
      prismaService.organization.findUnique.mockResolvedValue(null);

      const result = await util.generateUniqueCode('!@# $%^');

      // Should create a fallback code
      expect(result).toBe('ORG');
    });

    it('should create fallback code for names that produce invalid base codes', async () => {
      prismaService.organization.findUnique.mockResolvedValue(null);

      const result = await util.generateUniqueCode('   !!!   ');

      expect(result).toBe('ORG');
    });
  });

  describe('validateCodeFormat', () => {
    it('should validate correct code format', () => {
      expect(util.validateCodeFormat('TEST_ORG')).toBe(true);
      expect(util.validateCodeFormat('ABC123')).toBe(true);
      expect(util.validateCodeFormat('TEST_ORG_123')).toBe(true);
      expect(util.validateCodeFormat('ABC')).toBe(true); // 3-character code
    });

    it('should reject invalid code formats', () => {
      expect(util.validateCodeFormat('ab')).toBe(false); // Too short
      expect(util.validateCodeFormat('test_org')).toBe(false); // Lowercase
      expect(util.validateCodeFormat('TEST-ORG')).toBe(false); // Hyphen not allowed
      expect(util.validateCodeFormat('TEST ORG')).toBe(false); // Space not allowed
      expect(util.validateCodeFormat('TEST@ORG')).toBe(false); // Special character
      expect(util.validateCodeFormat('A'.repeat(21))).toBe(false); // Too long
      expect(util.validateCodeFormat('_TEST')).toBe(false); // Starts with underscore
      expect(util.validateCodeFormat('TEST_')).toBe(false); // Ends with underscore
      expect(util.validateCodeFormat('TEST__ORG')).toBe(false); // Double underscore
    });
  });

  describe('validateAndReserveCode', () => {
    it('should validate and confirm available code', async () => {
      prismaService.organization.findUnique.mockResolvedValue(null);

      const result = await util.validateAndReserveCode('VALID_CODE');

      expect(result).toBe(true);
    });

    it('should throw error for invalid code format', async () => {
      await expect(util.validateAndReserveCode('invalid_code')).rejects.toThrow('Organization code format is invalid');
    });

    it('should throw error for existing code', async () => {
      prismaService.organization.findUnique.mockResolvedValue({
        id: 'existing',
        code: 'EXISTING_CODE',
      } as any);

      await expect(util.validateAndReserveCode('EXISTING_CODE')).rejects.toThrow('Organization code already exists');
    });
  });

  describe('isEmailDomainAvailable', () => {
    it('should return true for available domain', async () => {
      prismaService.organization.findFirst.mockResolvedValue(null);

      const result = await util.isEmailDomainAvailable('test@newdomain.com');

      expect(result).toBe(true);
      expect(prismaService.organization.findFirst).toHaveBeenCalledWith({
        where: {
          email: {
            endsWith: '@newdomain.com',
          },
        },
      });
    });

    it('should return false for domain already in use', async () => {
      prismaService.organization.findFirst.mockResolvedValue({
        id: 'existing-org',
        email: 'admin@existingdomain.com',
      } as any);

      const result = await util.isEmailDomainAvailable('test@existingdomain.com');

      expect(result).toBe(false);
    });

    it('should exclude specific organization when checking domain availability', async () => {
      prismaService.organization.findFirst.mockResolvedValue(null);

      const result = await util.isEmailDomainAvailable('test@domain.com', 'org-123');

      expect(result).toBe(true);
      expect(prismaService.organization.findFirst).toHaveBeenCalledWith({
        where: {
          email: {
            endsWith: '@domain.com',
          },
          id: { not: 'org-123' },
        },
      });
    });
  });

  describe('generateNameSuggestions', () => {
    it('should generate name suggestions', () => {
      const suggestions = util.generateNameSuggestions('Acme');

      expect(suggestions).toEqual([
        'Acme',
        'Acme Store',
        'Acme Shop',
      ]);
      expect(suggestions.length).toBe(3);
    });

    it('should handle empty base name', () => {
      const suggestions = util.generateNameSuggestions('');

      expect(suggestions).toEqual([
        '',
        ' Store',
        ' Shop',
      ]);
    });
  });
});