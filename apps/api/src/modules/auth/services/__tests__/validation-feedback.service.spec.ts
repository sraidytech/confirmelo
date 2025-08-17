import { Test, TestingModule } from '@nestjs/testing';
import { ValidationFeedbackService } from '../validation-feedback.service';
import {
  ValidationResult,
  ValidationError,
  ValidationWarning,
} from '../../../../common/interfaces/google-sheets-order-sync.interface';

describe('ValidationFeedbackService', () => {
  let service: ValidationFeedbackService;

  const createMockValidationError = (overrides: Partial<ValidationError> = {}): ValidationError => ({
    field: 'customerName',
    message: 'Customer name is required',
    code: 'REQUIRED_FIELD_MISSING',
    value: '',
    suggestedFix: 'Enter a valid customer name',
    ...overrides,
  });

  const createMockValidationWarning = (overrides: Partial<ValidationWarning> = {}): ValidationWarning => ({
    field: 'price',
    message: 'Price seems high',
    code: 'SUSPICIOUS_VALUE',
    value: 10000,
    suggestion: 'Verify the price is correct',
    ...overrides,
  });

  const createMockValidationResult = (
    errors: ValidationError[] = [],
    warnings: ValidationWarning[] = [],
  ): ValidationResult => ({
    isValid: errors.length === 0,
    errors,
    warnings,
  });

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ValidationFeedbackService],
    }).compile();

    service = module.get<ValidationFeedbackService>(ValidationFeedbackService);
  });

  describe('formatValidationForSheet', () => {
    it('should format valid result correctly', () => {
      const validationResult = createMockValidationResult();
      const result = service.formatValidationForSheet(validationResult, 1);

      expect(result.status).toBe('VALID');
      expect(result.errorMessage).toBe('');
      expect(result.hasErrors).toBe(false);
      expect(result.hasWarnings).toBe(false);
    });

    it('should format error result correctly', () => {
      const error = createMockValidationError();
      const validationResult = createMockValidationResult([error]);
      const result = service.formatValidationForSheet(validationResult, 1);

      expect(result.status).toBe('ERROR');
      expect(result.errorMessage).toContain('Customer Name is required');
      expect(result.hasErrors).toBe(true);
      expect(result.hasWarnings).toBe(false);
    });

    it('should format warning result correctly', () => {
      const warning = createMockValidationWarning();
      const validationResult = createMockValidationResult([], [warning]);
      const result = service.formatValidationForSheet(validationResult, 1);

      expect(result.status).toBe('WARNING');
      expect(result.errorMessage).toContain('Price value seems suspicious');
      expect(result.hasErrors).toBe(false);
      expect(result.hasWarnings).toBe(true);
    });

    it('should prioritize errors over warnings', () => {
      const error = createMockValidationError();
      const warning = createMockValidationWarning();
      const validationResult = createMockValidationResult([error], [warning]);
      const result = service.formatValidationForSheet(validationResult, 1);

      expect(result.status).toBe('ERROR');
      expect(result.hasErrors).toBe(true);
      expect(result.hasWarnings).toBe(true);
    });

    it('should truncate long error messages', () => {
      const longMessage = 'A'.repeat(600);
      const error = createMockValidationError({ message: longMessage });
      const validationResult = createMockValidationResult([error]);
      const result = service.formatValidationForSheet(validationResult, 1);

      expect(result.errorMessage.length).toBeLessThanOrEqual(500);
      if (result.errorMessage.length === 500) {
        expect(result.errorMessage.endsWith('...')).toBe(true);
      }
    });

    it('should combine multiple errors', () => {
      const error1 = createMockValidationError({ field: 'customerName' });
      const error2 = createMockValidationError({ field: 'phone', message: 'Phone is required' });
      const validationResult = createMockValidationResult([error1, error2]);
      const result = service.formatValidationForSheet(validationResult, 1);

      expect(result.errorMessage).toContain('Customer Name is required');
      expect(result.errorMessage).toContain('Phone Number is required');
      expect(result.errorMessage).toContain(';');
    });
  });

  describe('formatErrorMessage', () => {
    it('should format error message in English', () => {
      const error = createMockValidationError();
      const result = service.formatErrorMessage(error, 'en');

      expect(result).toContain('Customer Name is required');
    });

    it('should format error message in French', () => {
      const error = createMockValidationError();
      const result = service.formatErrorMessage(error, 'fr');

      expect(result).toContain('Nom du Client est requis');
    });

    it('should format error message in Arabic', () => {
      const error = createMockValidationError();
      const result = service.formatErrorMessage(error, 'ar');

      expect(result).toContain('اسم العميل مطلوب');
    });

    it('should handle unknown error codes', () => {
      const error = createMockValidationError({ code: 'UNKNOWN_ERROR' });
      const result = service.formatErrorMessage(error, 'en');

      expect(result).toContain('Customer Name: Customer name is required');
    });

    it('should format different error types', () => {
      const errorTypes = [
        { code: 'INVALID_FORMAT', expectedText: 'has invalid format' },
        { code: 'INVALID_LENGTH', expectedText: 'length is invalid' },
        { code: 'INVALID_VALUE', expectedText: 'has invalid value' },
        { code: 'PRODUCT_NOT_FOUND', expectedText: 'not found in catalog' },
      ];

      errorTypes.forEach(({ code, expectedText }) => {
        const error = createMockValidationError({ code: code as any });
        const result = service.formatErrorMessage(error, 'en');
        expect(result).toContain(expectedText);
      });
    });
  });

  describe('formatWarningMessage', () => {
    it('should format warning message correctly', () => {
      const warning = createMockValidationWarning();
      const result = service.formatWarningMessage(warning, 'en');

      expect(result).toContain('Price value seems suspicious');
    });

    it('should handle different warning codes', () => {
      const warningTypes = [
        { code: 'SUSPICIOUS_VALUE', expectedText: 'seems suspicious' },
        { code: 'PRICE_MISMATCH', expectedText: 'differs from catalog' },
        { code: 'PRECISION_WARNING', expectedText: 'unusual precision' },
      ];

      warningTypes.forEach(({ code, expectedText }) => {
        const warning = createMockValidationWarning({ code: code as any });
        const result = service.formatWarningMessage(warning, 'en');
        expect(result).toContain(expectedText);
      });
    });
  });

  describe('createValidationSummary', () => {
    it('should create summary for mixed validation results', () => {
      const validationResults = [
        { rowNumber: 1, result: createMockValidationResult() }, // Valid
        { rowNumber: 2, result: createMockValidationResult([createMockValidationError()]) }, // Error
        { rowNumber: 3, result: createMockValidationResult([], [createMockValidationWarning()]) }, // Warning
        { rowNumber: 4, result: createMockValidationResult() }, // Valid
      ];

      const summary = service.createValidationSummary(validationResults);

      expect(summary.totalRows).toBe(4);
      expect(summary.validRows).toBe(2);
      expect(summary.errorRows).toBe(1);
      expect(summary.warningRows).toBe(1);
      expect(summary.summary).toContain('4 total');
      expect(summary.summary).toContain('2 valid');
      expect(summary.summary).toContain('1 errors');
      expect(summary.summary).toContain('1 warnings');
      expect(summary.details).toHaveLength(4);
    });

    it('should handle empty validation results', () => {
      const summary = service.createValidationSummary([]);

      expect(summary.totalRows).toBe(0);
      expect(summary.validRows).toBe(0);
      expect(summary.errorRows).toBe(0);
      expect(summary.warningRows).toBe(0);
      expect(summary.details).toHaveLength(0);
    });

    it('should create localized summaries', () => {
      const validationResults = [
        { rowNumber: 1, result: createMockValidationResult() },
      ];

      const englishSummary = service.createValidationSummary(validationResults, 'en');
      const frenchSummary = service.createValidationSummary(validationResults, 'fr');

      expect(englishSummary.summary).toContain('Validation completed');
      expect(frenchSummary.summary).toContain('Validation terminée');
    });
  });

  describe('convertToSyncErrors', () => {
    it('should convert validation errors to sync errors', () => {
      const validationErrors = [
        createMockValidationError({ field: 'customerName', code: 'REQUIRED_FIELD_MISSING' }),
        createMockValidationError({ field: 'phone', code: 'INVALID_FORMAT' }),
      ];
      const validationResult = createMockValidationResult(validationErrors);
      const orderData = { customerName: '', phone: 'invalid' };

      const syncErrors = service.convertToSyncErrors(validationResult, 1, orderData);

      expect(syncErrors).toHaveLength(2);
      expect(syncErrors[0].rowNumber).toBe(1);
      expect(syncErrors[0].errorType).toBe('validation');
      expect(syncErrors[0].field).toBe('customerName');
      expect(syncErrors[1].field).toBe('phone');
    });

    it('should map error codes to sync error types correctly', () => {
      const errorMappings = [
        { code: 'REQUIRED_FIELD_MISSING', expectedType: 'validation' },
        { code: 'INVALID_FORMAT', expectedType: 'validation' },
        { code: 'PRODUCT_NOT_FOUND', expectedType: 'product_not_found' },
        { code: 'VALIDATION_ERROR', expectedType: 'system' },
      ];

      errorMappings.forEach(({ code, expectedType }) => {
        const error = createMockValidationError({ code: code as any });
        const validationResult = createMockValidationResult([error]);
        const syncErrors = service.convertToSyncErrors(validationResult, 1, {});

        expect(syncErrors[0].errorType).toBe(expectedType);
      });
    });
  });

  describe('createErrorClearingInstructions', () => {
    it('should create clearing instructions for multiple rows', () => {
      const rowNumbers = [1, 3, 5, 7];
      const sheetName = 'Orders';

      const result = service.createErrorClearingInstructions(rowNumbers, sheetName);

      expect(result.clearRanges).toHaveLength(4);
      expect(result.clearRanges).toContain('Orders!Z1');
      expect(result.clearRanges).toContain('Orders!Z3');
      expect(result.clearRanges).toContain('Orders!Z5');
      expect(result.clearRanges).toContain('Orders!Z7');
      expect(result.instructions).toContain('Clear validation errors for 4 rows');
    });

    it('should handle single row', () => {
      const rowNumbers = [10];
      const sheetName = 'Sheet1';

      const result = service.createErrorClearingInstructions(rowNumbers, sheetName);

      expect(result.clearRanges).toHaveLength(1);
      expect(result.clearRanges[0]).toBe('Sheet1!Z10');
      expect(result.instructions).toContain('Clear validation errors for 1 rows');
    });

    it('should handle empty row numbers', () => {
      const result = service.createErrorClearingInstructions([], 'Sheet1');

      expect(result.clearRanges).toHaveLength(0);
      expect(result.instructions).toContain('Clear validation errors for 0 rows');
    });
  });

  describe('localization support', () => {
    it('should support multiple locales', () => {
      const error = createMockValidationError({ field: 'phone' });
      
      const locales = ['en', 'fr', 'ar'];
      const results = locales.map(locale => service.formatErrorMessage(error, locale));

      expect(results[0]).toContain('Phone Number is required'); // English
      expect(results[1]).toContain('Numéro de Téléphone est requis'); // French
      expect(results[2]).toContain('رقم الهاتف مطلوب'); // Arabic
    });

    it('should fallback to English for unknown locales', () => {
      const error = createMockValidationError();
      const result = service.formatErrorMessage(error, 'unknown-locale');

      expect(result).toContain('Customer Name is required');
    });

    it('should translate field names correctly', () => {
      const fields = ['customerName', 'phone', 'address', 'city', 'productName', 'price'];
      
      fields.forEach(field => {
        const error = createMockValidationError({ field });
        
        const englishResult = service.formatErrorMessage(error, 'en');
        const frenchResult = service.formatErrorMessage(error, 'fr');
        const arabicResult = service.formatErrorMessage(error, 'ar');

        expect(englishResult).not.toBe(frenchResult);
        expect(frenchResult).not.toBe(arabicResult);
        expect(englishResult).not.toBe(arabicResult);
      });
    });
  });

  describe('edge cases', () => {
    it('should handle null/undefined values gracefully', () => {
      const error = createMockValidationError({ value: null });
      const result = service.formatErrorMessage(error, 'en');

      expect(result).toBeDefined();
      expect(typeof result).toBe('string');
    });

    it('should handle very long field names', () => {
      const longFieldName = 'a'.repeat(100);
      const error = createMockValidationError({ field: longFieldName });
      const result = service.formatErrorMessage(error, 'en');

      expect(result).toBeDefined();
      expect(result).toContain(longFieldName);
    });

    it('should handle special characters in messages', () => {
      const specialMessage = 'Error with "quotes" and <tags> & symbols';
      const error = createMockValidationError({ 
        message: specialMessage,
        code: 'SPECIAL_ERROR' // Use a code that will use the default template
      });
      const result = service.formatErrorMessage(error, 'en');

      expect(result).toContain(specialMessage);
    });
  });
});