import { Test, TestingModule } from '@nestjs/testing';
import { OrderValidationService } from '../order-validation.service';
import { ValidationFeedbackService } from '../validation-feedback.service';
import { OrderSyncService } from '../order-sync.service';
import { PrismaService } from '../../../../common/database/prisma.service';
import { ValidationService } from '../../../../common/validation/validation.service';
import { SanitizationService } from '../../../../common/validation/sanitization.service';
import { GoogleSheetsOAuth2Service } from '../google-sheets-oauth2.service';
import { SheetOrder } from '../../../../common/interfaces/google-sheets-order-sync.interface';
import { Currency, OrderStatus } from '@prisma/client';

// Mock external services
jest.mock('../../../../common/database/prisma.service');
jest.mock('../google-sheets-oauth2.service');
jest.mock('../../../../common/validation/validation.service');
jest.mock('../../../../common/validation/sanitization.service');

describe('Order Validation Integration', () => {
  let orderValidationService: OrderValidationService;
  let validationFeedbackService: ValidationFeedbackService;
  let orderSyncService: OrderSyncService;
  let prismaService: any;
  let validationService: any;
  let sanitizationService: any;
  let googleSheetsService: any;

  const mockOrganizationId = 'org-123';
  const mockConnectionId = 'conn-123';
  const mockSpreadsheetId = 'sheet-123';
  const mockSyncOperationId = 'sync-123';

  const createMockSheetOrder = (overrides: Partial<SheetOrder> = {}): SheetOrder => ({
    rowNumber: 1,
    date: '2025-01-15', // Use current year to avoid date warnings
    customerName: 'John Doe',
    phone: '+212687654321', // Use a phone number that won't trigger suspicious patterns
    address: '123 Main Street',
    city: 'Casablanca',
    productName: 'Test Product',
    productQuantity: 1,
    price: 100,
    ...overrides,
  });

  beforeEach(async () => {
    // Create comprehensive mocks
    const mockPrismaService = {
      platformConnection: {
        findUnique: jest.fn(),
      },
      product: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
      },
      customer: {
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      store: {
        findFirst: jest.fn(),
      },
      order: {
        create: jest.fn(),
        count: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
      },
      syncOperation: {
        update: jest.fn(),
      },
      spreadsheetConnection: {
        findFirst: jest.fn(),
      },
    };

    const mockValidationService = {
      validateEmail: jest.fn(),
    };

    const mockSanitizationService = {
      sanitizePhoneNumber: jest.fn(),
    };

    const mockGoogleSheetsService = {
      getSpreadsheetValues: jest.fn(),
      batchUpdateSpreadsheet: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrderValidationService,
        ValidationFeedbackService,
        OrderSyncService,
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
        {
          provide: GoogleSheetsOAuth2Service,
          useValue: mockGoogleSheetsService,
        },
      ],
    }).compile();

    orderValidationService = module.get<OrderValidationService>(OrderValidationService);
    validationFeedbackService = module.get<ValidationFeedbackService>(ValidationFeedbackService);
    orderSyncService = module.get<OrderSyncService>(OrderSyncService);
    prismaService = module.get(PrismaService);
    validationService = module.get(ValidationService);
    sanitizationService = module.get(SanitizationService);
    googleSheetsService = module.get(GoogleSheetsOAuth2Service);

    // Setup default mocks
    setupDefaultMocks();
  });

  function setupDefaultMocks() {
    // Platform connection mock
    prismaService.platformConnection.findUnique.mockResolvedValue({
      id: mockConnectionId,
      organizationId: mockOrganizationId,
      user: {
        organization: {
          id: mockOrganizationId,
          name: 'Test Organization',
        },
      },
    });

    // Product mock
    prismaService.product.findFirst.mockResolvedValue({
      id: 'product-1',
      name: 'Test Product',
      sku: 'TEST-001',
      price: 100,
      currency: Currency.MAD,
    });

    // Customer mock
    prismaService.customer.findFirst.mockResolvedValue(null);
    prismaService.customer.create.mockResolvedValue({
      id: 'customer-1',
      firstName: 'John',
      lastName: 'Doe',
      phone: '+212612345678',
    });

    // Store mock
    prismaService.store.findFirst.mockResolvedValue({
      id: 'store-1',
      name: 'Test Store',
      isActive: true,
    });

    // Order mock
    prismaService.order.create.mockResolvedValue({
      id: 'order-1',
      orderNumber: 'GS202401150001',
      total: 100,
    });

    prismaService.order.count.mockResolvedValue(0);

    // Validation service mocks
    validationService.validateEmail.mockReturnValue({
      isValid: true,
      errors: [],
    });

    sanitizationService.sanitizePhoneNumber.mockImplementation((phone) => phone);

    // Sync operation mock
    prismaService.syncOperation.update.mockResolvedValue({});
  }

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Complete validation workflow', () => {
    it('should validate and process a valid order successfully', async () => {
      const sheetOrder = createMockSheetOrder();

      // Mock product to avoid "product not found" warnings
      prismaService.product.findFirst.mockResolvedValue({
        id: 'product-1',
        name: 'Test Product',
        sku: 'TEST-001',
        price: 100,
        currency: Currency.MAD,
      });

      // Test validation
      const validationResult = await orderValidationService.validateRequiredFields(
        sheetOrder,
        mockOrganizationId,
      );

      expect(validationResult.isValid).toBe(true);
      expect(validationResult.errors).toHaveLength(0);

      // Test feedback formatting
      const feedback = validationFeedbackService.formatValidationForSheet(
        validationResult,
        sheetOrder.rowNumber,
      );

      expect(feedback.status).toBe('VALID');
      expect(feedback.hasErrors).toBe(false);

      // Test order processing with validation
      const processResult = await orderSyncService.processSheetOrder(
        sheetOrder,
        mockConnectionId,
        mockSpreadsheetId,
        mockSyncOperationId,
      );

      expect(processResult.created).toBe(true);
      expect(processResult.orderId).toBeDefined();
      expect(processResult.validationResult?.isValid).toBe(true);
    });

    it('should handle validation errors and prevent order creation', async () => {
      const invalidSheetOrder = createMockSheetOrder({
        customerName: '', // Missing required field
        phone: 'invalid-phone',
        price: -10, // Invalid price
      });

      // Test validation
      const validationResult = await orderValidationService.validateRequiredFields(
        invalidSheetOrder,
        mockOrganizationId,
      );

      expect(validationResult.isValid).toBe(false);
      expect(validationResult.errors.length).toBeGreaterThan(0);

      // Test feedback formatting
      const feedback = validationFeedbackService.formatValidationForSheet(
        validationResult,
        invalidSheetOrder.rowNumber,
      );

      expect(feedback.status).toBe('ERROR');
      expect(feedback.hasErrors).toBe(true);
      expect(feedback.errorMessage).toContain('Customer Name is required');

      // Test that order processing is blocked by validation
      const processResult = await orderSyncService.processSheetOrder(
        invalidSheetOrder,
        mockConnectionId,
        mockSpreadsheetId,
        mockSyncOperationId,
      );

      expect(processResult.created).toBe(false);
      expect(processResult.error).toBeDefined();
      expect(processResult.validationResult?.isValid).toBe(false);
    });

    it('should handle validation warnings and still create order', async () => {
      const warningSheetOrder = createMockSheetOrder({
        price: 50000, // High price that triggers warning
        email: 'invalid-email', // Invalid email format
      });

      validationService.validateEmail.mockReturnValue({
        isValid: false,
        errors: ['Invalid email format'],
      });

      // Mock product to avoid additional warnings
      prismaService.product.findFirst.mockResolvedValue({
        id: 'product-1',
        name: 'Test Product',
        sku: 'TEST-001',
        price: 100,
        currency: Currency.MAD,
      });

      // Test validation
      const validationResult = await orderValidationService.validateRequiredFields(
        warningSheetOrder,
        mockOrganizationId,
      );

      expect(validationResult.isValid).toBe(true); // Should still be valid despite warnings
      expect(validationResult.warnings.length).toBeGreaterThan(0);

      // Test feedback formatting
      const feedback = validationFeedbackService.formatValidationForSheet(
        validationResult,
        warningSheetOrder.rowNumber,
      );

      expect(feedback.status).toBe('WARNING');
      expect(feedback.hasWarnings).toBe(true);
      expect(feedback.errorMessage).toContain('differs from catalog');

      // Test that order is still created with warnings
      const processResult = await orderSyncService.processSheetOrder(
        warningSheetOrder,
        mockConnectionId,
        mockSpreadsheetId,
        mockSyncOperationId,
      );

      expect(processResult.created).toBe(true);
      expect(processResult.orderId).toBeDefined();
      expect(processResult.validationResult?.warnings.length).toBeGreaterThan(0);
    });
  });

  describe('Product validation integration', () => {
    it('should find existing products and validate prices', async () => {
      const sheetOrder = createMockSheetOrder({
        productSku: 'TEST-001',
        productName: 'Test Product',
        price: 150, // 50% higher than catalog price (100) to trigger warning
      });

      // Mock product with different price to trigger price mismatch warning
      prismaService.product.findFirst.mockResolvedValue({
        id: 'product-1',
        name: 'Test Product',
        sku: 'TEST-001',
        price: 100, // Catalog price different from sheet price (120)
        currency: Currency.MAD,
      });

      const validationResult = await orderValidationService.validateProduct(
        sheetOrder,
        mockOrganizationId,
      );

      expect(validationResult.isValid).toBe(true);
      expect(validationResult.product).toBeDefined();
      expect(validationResult.warnings.find(w => w.field === 'price')).toBeDefined();
    });

    it('should suggest similar products when exact match not found', async () => {
      const sheetOrder = createMockSheetOrder({
        productName: 'Test Prodct', // Typo in product name
      });

      prismaService.product.findFirst.mockResolvedValue(null); // No exact match
      prismaService.product.findMany.mockResolvedValue([
        { id: 'product-1', name: 'Test Product', sku: 'TEST-001' },
        { id: 'product-2', name: 'Test Product 2', sku: 'TEST-002' },
      ]);

      const validationResult = await orderValidationService.validateProduct(
        sheetOrder,
        mockOrganizationId,
      );

      expect(validationResult.suggestions.length).toBeGreaterThan(0);
      expect(validationResult.warnings.find(w => w.code === 'PRODUCT_NOT_FOUND')).toBeDefined();
    });
  });

  describe('Phone validation integration', () => {
    it('should validate Morocco phone numbers correctly', async () => {
      const testCases = [
        { phone: '+212687654321', shouldBeValid: true },
        { phone: '0687654321', shouldBeValid: true },
        { phone: '+212412345678', shouldBeValid: false }, // Invalid prefix (4 is not valid)
        { phone: '123456', shouldBeValid: false }, // Too short
      ];

      for (const testCase of testCases) {
        const sheetOrder = createMockSheetOrder({ phone: testCase.phone });
        
        sanitizationService.sanitizePhoneNumber.mockReturnValue(testCase.phone);

        const validationResult = await orderValidationService.validateRequiredFields(
          sheetOrder,
          mockOrganizationId,
          { requirePhone: true, requireProduct: true, requirePrice: true, phoneFormat: 'morocco', priceValidation: true },
        );

        const hasPhoneError = validationResult.errors.some(e => e.field === 'phone');
        
        if (testCase.shouldBeValid) {
          expect(hasPhoneError).toBe(false);
        } else {
          expect(hasPhoneError).toBe(true);
        }
      }
    });
  });

  describe('Localization integration', () => {
    it('should provide localized error messages', async () => {
      const invalidSheetOrder = createMockSheetOrder({
        customerName: '',
        phone: '',
      });

      const validationResult = await orderValidationService.validateRequiredFields(
        invalidSheetOrder,
        mockOrganizationId,
      );

      // Test different locales
      const englishFeedback = validationFeedbackService.formatValidationForSheet(
        validationResult,
        1,
        'en',
      );

      const frenchFeedback = validationFeedbackService.formatValidationForSheet(
        validationResult,
        1,
        'fr',
      );

      const arabicFeedback = validationFeedbackService.formatValidationForSheet(
        validationResult,
        1,
        'ar',
      );

      expect(englishFeedback.errorMessage).toContain('Customer Name is required');
      expect(frenchFeedback.errorMessage).toContain('Nom du Client est requis');
      expect(arabicFeedback.errorMessage).toContain('اسم العميل مطلوب');
    });
  });

  describe('Batch validation', () => {
    it('should create validation summary for multiple orders', async () => {
      const orders = [
        createMockSheetOrder({ rowNumber: 1 }), // Should have warnings due to product not found
        createMockSheetOrder({ rowNumber: 2, customerName: '' }), // Error
        createMockSheetOrder({ rowNumber: 3, price: 50000 }), // Warning
      ];

      const validationResults = [];

      for (const order of orders) {
        const result = await orderValidationService.validateRequiredFields(
          order,
          mockOrganizationId,
        );
        validationResults.push({ rowNumber: order.rowNumber, result });
      }

      const summary = validationFeedbackService.createValidationSummary(validationResults);

      expect(summary.totalRows).toBe(3);
      expect(summary.validRows).toBe(1); // One order is now valid
      expect(summary.errorRows).toBe(1); // One with missing customer name
      expect(summary.warningRows).toBe(1); // One with warnings
      expect(summary.details).toHaveLength(3);
    });
  });

  describe('Error recovery and logging', () => {
    it('should handle database errors gracefully', async () => {
      const sheetOrder = createMockSheetOrder();
      
      prismaService.product.findFirst.mockRejectedValue(new Error('Database connection failed'));

      const validationResult = await orderValidationService.validateProduct(
        sheetOrder,
        mockOrganizationId,
      );

      expect(validationResult.isValid).toBe(false);
      expect(validationResult.errors.find(e => e.code === 'VALIDATION_ERROR')).toBeDefined();
    });

    it('should convert validation errors to sync errors', async () => {
      const invalidSheetOrder = createMockSheetOrder({
        customerName: '',
        phone: 'invalid',
      });

      const validationResult = await orderValidationService.validateRequiredFields(
        invalidSheetOrder,
        mockOrganizationId,
      );

      const syncErrors = validationFeedbackService.convertToSyncErrors(
        validationResult,
        invalidSheetOrder.rowNumber,
        invalidSheetOrder,
      );

      expect(syncErrors.length).toBeGreaterThan(0);
      expect(syncErrors[0].rowNumber).toBe(invalidSheetOrder.rowNumber);
      expect(syncErrors[0].errorType).toBe('validation');
    });
  });

  describe('Performance considerations', () => {
    it('should handle large validation batches efficiently', async () => {
      const startTime = Date.now();
      const orders = Array.from({ length: 100 }, (_, i) => 
        createMockSheetOrder({ rowNumber: i + 1 })
      );

      const validationPromises = orders.map(order =>
        orderValidationService.validateRequiredFields(order, mockOrganizationId)
      );

      const results = await Promise.all(validationPromises);
      const endTime = Date.now();

      expect(results).toHaveLength(100);
      expect(endTime - startTime).toBeLessThan(5000); // Should complete within 5 seconds
    });
  });
});