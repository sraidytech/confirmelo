import { Test, TestingModule } from '@nestjs/testing';
import { OrderValidationService } from '../order-validation.service';
import { PrismaService } from '../../../../common/database/prisma.service';
import { ValidationService } from '../../../../common/validation/validation.service';
import { SanitizationService } from '../../../../common/validation/sanitization.service';
import { SheetOrder } from '../../../../common/interfaces/google-sheets-order-sync.interface';
import { Currency } from '@prisma/client';

// Mock services
jest.mock('../../../../common/database/prisma.service');
jest.mock('../../../../common/validation/validation.service');
jest.mock('../../../../common/validation/sanitization.service');

describe('OrderValidationService', () => {
  let service: OrderValidationService;
  let prismaService: any;
  let validationService: any;
  let sanitizationService: any;

  const mockOrganizationId = 'org-123';

  const createMockSheetOrder = (overrides: Partial<SheetOrder> = {}): SheetOrder => ({
    rowNumber: 1,
    date: '2024-01-15',
    customerName: 'John Doe',
    phone: '+212612345678',
    address: '123 Main Street',
    city: 'Casablanca',
    productName: 'Test Product',
    productQuantity: 1,
    price: 100,
    ...overrides,
  });

  beforeEach(async () => {
    // Create mock implementations
    const mockPrismaService = {
      product: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
      },
    };

    const mockValidationService = {
      validateEmail: jest.fn(),
    };

    const mockSanitizationService = {
      sanitizePhoneNumber: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrderValidationService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
        {
          provide: ValidationService,
          useValue: mockValidationService,
        },
        {
          provide: SanitizationService,
          useValue: mockSanitizationService,
        },
      ],
    }).compile();

    service = module.get<OrderValidationService>(OrderValidationService);
    prismaService = module.get(PrismaService);
    validationService = module.get(ValidationService);
    sanitizationService = module.get(SanitizationService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('validateRequiredFields', () => {
    it('should validate a complete valid order', async () => {
      const sheetOrder = createMockSheetOrder();
      
      sanitizationService.sanitizePhoneNumber.mockReturnValue('+212612345678');
      prismaService.product.findFirst.mockResolvedValue({
        id: 'product-1',
        name: 'Test Product',
        sku: 'TEST-001',
        price: 100,
        currency: Currency.MAD,
      });

      const result = await service.validateRequiredFields(sheetOrder, mockOrganizationId);

      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should return errors for missing required fields', async () => {
      const sheetOrder = createMockSheetOrder({
        customerName: '',
        phone: '',
        address: '',
        city: '',
      });

      const result = await service.validateRequiredFields(sheetOrder, mockOrganizationId);

      expect(result.isValid).toBe(false);
      expect(result.errors).toHaveLength(4);
      expect(result.errors.map(e => e.field)).toContain('customerName');
      expect(result.errors.map(e => e.field)).toContain('phone');
      expect(result.errors.map(e => e.field)).toContain('address');
      expect(result.errors.map(e => e.field)).toContain('city');
    });

    it('should validate customer name length', async () => {
      const shortName = createMockSheetOrder({ customerName: 'A' });
      const longName = createMockSheetOrder({ customerName: 'A'.repeat(101) });

      const shortResult = await service.validateRequiredFields(shortName, mockOrganizationId);
      const longResult = await service.validateRequiredFields(longName, mockOrganizationId);

      expect(shortResult.isValid).toBe(false);
      expect(shortResult.errors.find(e => e.field === 'customerName')).toBeDefined();

      expect(longResult.isValid).toBe(false);
      expect(longResult.errors.find(e => e.field === 'customerName')).toBeDefined();
    });

    it('should validate email format when provided', async () => {
      const sheetOrder = createMockSheetOrder({ 
        email: 'invalid-email',
        date: '2025-01-15', // Use current year to avoid date warnings
      });
      
      validationService.validateEmail.mockReturnValue({
        isValid: false,
        errors: ['Invalid email format'],
      });

      // Mock product to avoid product warnings
      prismaService.product.findFirst.mockResolvedValue({
        id: 'product-1',
        name: 'Test Product',
        sku: 'TEST-001',
        price: 100,
        currency: Currency.MAD,
      });

      const result = await service.validateRequiredFields(sheetOrder, mockOrganizationId);

      expect(result.warnings.find(w => w.field === 'email')).toBeDefined();
    });
  });

  describe('validatePhoneNumber', () => {
    beforeEach(() => {
      sanitizationService.sanitizePhoneNumber.mockImplementation((phone) => phone);
    });

    it('should validate Morocco phone numbers', async () => {
      const validMoroccoNumbers = [
        '+212612345678',
        '0612345678',
        '+212712345678',
      ];

      for (const phone of validMoroccoNumbers) {
        const result = await service.validatePhoneNumber(phone, 'morocco');
        expect(result.isValid).toBe(true);
      }
    });

    it('should reject invalid Morocco phone numbers', async () => {
      const invalidMoroccoNumbers = [
        '+212412345678', // Invalid prefix (4 is not valid)
        '0412345678',    // Invalid prefix (4 is not valid)
        '+21261234567',  // Too short
        '+2126123456789', // Too long
      ];

      for (const phone of invalidMoroccoNumbers) {
        const result = await service.validatePhoneNumber(phone, 'morocco');
        expect(result.isValid).toBe(false);
      }
    });

    it('should validate international phone numbers', async () => {
      const validInternationalNumbers = [
        '+1234567890',
        '+33123456789',
        '+44123456789',
      ];

      for (const phone of validInternationalNumbers) {
        const result = await service.validatePhoneNumber(phone, 'international');
        expect(result.isValid).toBe(true);
      }
    });

    it('should detect suspicious phone patterns', async () => {
      const suspiciousNumbers = [
        '+212611111111', // Repeated digits
        '+212612345678', // Sequential (this should pass basic validation but trigger warning)
      ];

      const result = await service.validatePhoneNumber(suspiciousNumbers[0], 'morocco');
      expect(result.warnings.length).toBeGreaterThan(0);
    });

    it('should handle empty phone numbers', async () => {
      const result = await service.validatePhoneNumber('', 'morocco');
      expect(result.isValid).toBe(false);
      expect(result.errors[0].code).toBe('REQUIRED_FIELD_MISSING');
    });
  });

  describe('validateProduct', () => {
    it('should find existing product by SKU', async () => {
      const sheetOrder = createMockSheetOrder({
        productSku: 'TEST-001',
        productName: 'Test Product',
      });

      const mockProduct = {
        id: 'product-1',
        name: 'Test Product',
        sku: 'TEST-001',
        price: 100,
        currency: Currency.MAD,
      };

      prismaService.product.findFirst.mockResolvedValue(mockProduct);

      const result = await service.validateProduct(sheetOrder, mockOrganizationId);

      expect(result.isValid).toBe(true);
      expect(result.product).toEqual({
        id: 'product-1',
        name: 'Test Product',
        sku: 'TEST-001',
        price: 100,
        currency: Currency.MAD,
      });
    });

    it('should find existing product by name when SKU not found', async () => {
      const sheetOrder = createMockSheetOrder({
        productSku: 'UNKNOWN-SKU',
        productName: 'Test Product',
      });

      const mockProduct = {
        id: 'product-1',
        name: 'Test Product',
        sku: 'TEST-001',
        price: 100,
        currency: Currency.MAD,
      };

      prismaService.product.findFirst
        .mockResolvedValueOnce(null) // First call for SKU
        .mockResolvedValueOnce(mockProduct); // Second call for name

      const result = await service.validateProduct(sheetOrder, mockOrganizationId);

      expect(result.isValid).toBe(true);
      expect(result.product).toBeDefined();
    });

    it('should suggest similar products when exact match not found', async () => {
      const sheetOrder = createMockSheetOrder({
        productName: 'Test Prodct', // Typo
      });

      prismaService.product.findFirst.mockResolvedValue(null);
      prismaService.product.findMany.mockResolvedValue([
        { id: 'product-1', name: 'Test Product', sku: 'TEST-001' },
        { id: 'product-2', name: 'Test Product 2', sku: 'TEST-002' },
      ]);

      const result = await service.validateProduct(sheetOrder, mockOrganizationId);

      expect(result.suggestions.length).toBeGreaterThan(0);
      expect(result.warnings.length).toBeGreaterThan(0);
    });

    it('should validate product quantity', async () => {
      const invalidQuantities = [0, -1, 1001];

      for (const quantity of invalidQuantities) {
        const sheetOrder = createMockSheetOrder({ productQuantity: quantity });
        const result = await service.validateProduct(sheetOrder, mockOrganizationId);

        if (quantity <= 0) {
          expect(result.isValid).toBe(false);
          expect(result.errors.find(e => e.field === 'productQuantity')).toBeDefined();
        } else if (quantity > 1000) {
          expect(result.warnings.find(w => w.field === 'productQuantity')).toBeDefined();
        }
      }
    });

    it('should warn about price mismatches', async () => {
      const sheetOrder = createMockSheetOrder({
        productName: 'Test Product',
        price: 150, // Different from catalog price
      });

      const mockProduct = {
        id: 'product-1',
        name: 'Test Product',
        sku: 'TEST-001',
        price: 100, // Catalog price
        currency: Currency.MAD,
      };

      prismaService.product.findFirst.mockResolvedValue(mockProduct);

      const result = await service.validateProduct(sheetOrder, mockOrganizationId);

      expect(result.warnings.find(w => w.field === 'price')).toBeDefined();
    });
  });

  describe('validatePrice', () => {
    it('should validate positive prices', () => {
      const result = service.validatePrice(100, 1, Currency.MAD);
      expect(result.isValid).toBe(true);
    });

    it('should reject negative prices', () => {
      const result = service.validatePrice(-10, 1, Currency.MAD);
      expect(result.isValid).toBe(false);
      expect(result.errors[0].code).toBe('INVALID_VALUE');
    });

    it('should warn about zero prices', () => {
      const result = service.validatePrice(0, 1, Currency.MAD);
      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings[0].code).toBe('SUSPICIOUS_VALUE');
    });

    it('should reject non-numeric prices', () => {
      const result = service.validatePrice(NaN, 1, Currency.MAD);
      expect(result.isValid).toBe(false);
      expect(result.errors[0].code).toBe('INVALID_TYPE');
    });

    it('should warn about very high prices', () => {
      const result = service.validatePrice(200000, 1, Currency.MAD);
      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings[0].code).toBe('SUSPICIOUS_VALUE');
    });

    it('should warn about excessive decimal places', () => {
      const result = service.validatePrice(99.999, 1, Currency.MAD);
      expect(result.warnings.find(w => w.code === 'PRECISION_WARNING')).toBeDefined();
    });

    it('should warn about very high total order values', () => {
      const result = service.validatePrice(10000, 200, Currency.MAD); // Total: 2,000,000
      expect(result.warnings.find(w => w.code === 'SUSPICIOUS_VALUE')).toBeDefined();
    });

    it('should handle different currencies appropriately', () => {
      const madResult = service.validatePrice(50000, 1, Currency.MAD);
      const usdResult = service.validatePrice(50000, 1, Currency.USD);

      // USD should trigger warning for high price, MAD might not
      expect(usdResult.warnings.length).toBeGreaterThan(madResult.warnings.length);
    });
  });

  describe('edge cases and error handling', () => {
    it('should handle database errors gracefully', async () => {
      const sheetOrder = createMockSheetOrder();
      
      prismaService.product.findFirst.mockRejectedValue(new Error('Database error'));

      const result = await service.validateProduct(sheetOrder, mockOrganizationId);

      expect(result.isValid).toBe(false);
      expect(result.errors.find(e => e.code === 'VALIDATION_ERROR')).toBeDefined();
    });

    it('should handle null/undefined values', async () => {
      const sheetOrder = createMockSheetOrder({
        customerName: null as any,
        phone: undefined as any,
        price: null as any,
      });

      const result = await service.validateRequiredFields(sheetOrder, mockOrganizationId);

      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should validate date formats', async () => {
      const validDates = ['2024-01-15', '2024-12-31'];
      const invalidDates = ['invalid-date', '2024-13-01', ''];

      for (const date of validDates) {
        const sheetOrder = createMockSheetOrder({ date });
        const result = await service.validateRequiredFields(sheetOrder, mockOrganizationId);
        expect(result.errors.find(e => e.field === 'date')).toBeUndefined();
      }

      for (const date of invalidDates) {
        const sheetOrder = createMockSheetOrder({ date });
        const result = await service.validateRequiredFields(sheetOrder, mockOrganizationId);
        if (date === '') {
          expect(result.errors.find(e => e.field === 'date')).toBeDefined();
        } else {
          expect(result.errors.find(e => e.field === 'date')).toBeDefined();
        }
      }
    });
  });

  describe('validation rules configuration', () => {
    it('should respect optional phone validation', async () => {
      const sheetOrder = createMockSheetOrder({ phone: '' });

      const result = await service.validateRequiredFields(sheetOrder, mockOrganizationId, {
        requirePhone: false,
        requireProduct: true,
        requirePrice: true,
        phoneFormat: 'morocco',
        priceValidation: true,
      });

      expect(result.errors.find(e => e.field === 'phone')).toBeUndefined();
    });

    it('should respect optional product validation', async () => {
      const sheetOrder = createMockSheetOrder({ productName: '' });

      const result = await service.validateRequiredFields(sheetOrder, mockOrganizationId, {
        requirePhone: true,
        requireProduct: false,
        requirePrice: true,
        phoneFormat: 'morocco',
        priceValidation: true,
      });

      expect(result.errors.find(e => e.field === 'productName')).toBeUndefined();
    });

    it('should respect different phone formats', async () => {
      const sheetOrder = createMockSheetOrder({ phone: '+1234567890' });
      
      sanitizationService.sanitizePhoneNumber.mockReturnValue('+1234567890');

      const moroccoResult = await service.validateRequiredFields(sheetOrder, mockOrganizationId, {
        requirePhone: true,
        requireProduct: true,
        requirePrice: true,
        phoneFormat: 'morocco',
        priceValidation: true,
      });

      const internationalResult = await service.validateRequiredFields(sheetOrder, mockOrganizationId, {
        requirePhone: true,
        requireProduct: true,
        requirePrice: true,
        phoneFormat: 'international',
        priceValidation: true,
      });

      // Should fail Morocco validation but pass international
      expect(moroccoResult.errors.find(e => e.field === 'phone')).toBeDefined();
      expect(internationalResult.errors.find(e => e.field === 'phone')).toBeUndefined();
    });
  });
});