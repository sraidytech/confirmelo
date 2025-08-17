import { Injectable, Logger } from '@nestjs/common';
import {
  ValidationResult,
  ValidationError,
  ValidationWarning,
  SyncError,
} from '../../../common/interfaces/google-sheets-order-sync.interface';

@Injectable()
export class ValidationFeedbackService {
  private readonly logger = new Logger(ValidationFeedbackService.name);

  /**
   * Format validation results for sheet error messages
   */
  formatValidationForSheet(
    validationResult: ValidationResult,
    rowNumber: number,
    locale: string = 'en',
  ): {
    errorMessage: string;
    status: string;
    hasErrors: boolean;
    hasWarnings: boolean;
  } {
    const { errors, warnings } = validationResult;
    const hasErrors = errors.length > 0;
    const hasWarnings = warnings.length > 0;

    let errorMessage = '';
    let status = 'VALID';

    if (hasErrors) {
      status = 'ERROR';
      const errorMessages = errors.map(error => 
        this.formatErrorMessage(error, locale)
      );
      errorMessage = errorMessages.join('; ');
    } else if (hasWarnings) {
      status = 'WARNING';
      const warningMessages = warnings.map(warning => 
        this.formatWarningMessage(warning, locale)
      );
      errorMessage = warningMessages.join('; ');
    }

    // Truncate message if too long for sheet cell
    if (errorMessage.length > 500) {
      errorMessage = errorMessage.substring(0, 497) + '...';
    }

    this.logger.debug('Formatted validation for sheet', {
      rowNumber,
      hasErrors,
      hasWarnings,
      status,
      messageLength: errorMessage.length,
    });

    return {
      errorMessage,
      status,
      hasErrors,
      hasWarnings,
    };
  }

  /**
   * Format error message with localization
   */
  formatErrorMessage(error: ValidationError, locale: string = 'en'): string {
    const messages = this.getErrorMessages(locale);
    const template = messages[error.code] || messages.DEFAULT_ERROR;
    
    return this.interpolateMessage(template, {
      field: this.getFieldName(error.field, locale),
      value: error.value,
      message: error.message,
      suggestedFix: error.suggestedFix,
    });
  }

  /**
   * Format warning message with localization
   */
  formatWarningMessage(warning: ValidationWarning, locale: string = 'en'): string {
    const messages = this.getWarningMessages(locale);
    const template = messages[warning.code] || messages.DEFAULT_WARNING;
    
    return this.interpolateMessage(template, {
      field: this.getFieldName(warning.field, locale),
      value: warning.value,
      message: warning.message,
      suggestion: warning.suggestion,
    });
  }

  /**
   * Create comprehensive validation summary
   */
  createValidationSummary(
    validationResults: Array<{
      rowNumber: number;
      result: ValidationResult;
    }>,
    locale: string = 'en',
  ): {
    totalRows: number;
    validRows: number;
    errorRows: number;
    warningRows: number;
    summary: string;
    details: Array<{
      rowNumber: number;
      status: 'VALID' | 'ERROR' | 'WARNING';
      message: string;
    }>;
  } {
    const totalRows = validationResults.length;
    let validRows = 0;
    let errorRows = 0;
    let warningRows = 0;

    const details = validationResults.map(({ rowNumber, result }) => {
      const formatted = this.formatValidationForSheet(result, rowNumber, locale);
      
      if (formatted.hasErrors) {
        errorRows++;
      } else if (formatted.hasWarnings) {
        warningRows++;
      } else {
        validRows++;
      }

      return {
        rowNumber,
        status: formatted.status as 'VALID' | 'ERROR' | 'WARNING',
        message: formatted.errorMessage,
      };
    });

    const summaryMessages = this.getSummaryMessages(locale);
    const summary = this.interpolateMessage(summaryMessages.VALIDATION_SUMMARY, {
      totalRows,
      validRows,
      errorRows,
      warningRows,
    });

    return {
      totalRows,
      validRows,
      errorRows,
      warningRows,
      summary,
      details,
    };
  }

  /**
   * Convert validation errors to sync errors
   */
  convertToSyncErrors(
    validationResult: ValidationResult,
    rowNumber: number,
    orderData: any,
  ): SyncError[] {
    const syncErrors: SyncError[] = [];

    // Convert validation errors - handle case where errors might be undefined
    if (validationResult.errors && Array.isArray(validationResult.errors)) {
      validationResult.errors.forEach(error => {
        syncErrors.push({
          rowNumber,
          errorType: this.mapErrorTypeToSyncErrorType(error.code),
          errorMessage: error.message,
          orderData,
          field: error.field,
          suggestedFix: error.suggestedFix,
        });
      });
    }

    return syncErrors;
  }

  /**
   * Log validation errors for tracking and analysis
   */
  async logValidationErrors(
    validationResults: Array<{
      rowNumber: number;
      result: ValidationResult;
      orderData: any;
    }>,
    connectionId: string,
    spreadsheetId: string,
  ): Promise<void> {
    const errorResults = validationResults.filter(r => r.result.errors.length > 0);
    
    if (errorResults.length === 0) {
      return;
    }

    this.logger.warn('Validation errors detected', {
      connectionId,
      spreadsheetId,
      totalRows: validationResults.length,
      errorRows: errorResults.length,
      errorBreakdown: this.analyzeErrorPatterns(errorResults),
    });

    // Log individual errors for detailed analysis
    errorResults.forEach(({ rowNumber, result, orderData }) => {
      result.errors.forEach(error => {
        this.logger.error('Validation error detail', {
          connectionId,
          spreadsheetId,
          rowNumber,
          field: error.field,
          code: error.code,
          message: error.message,
          value: error.value,
          suggestedFix: error.suggestedFix,
          customerName: orderData.customerName,
          phone: orderData.phone,
        });
      });
    });
  }

  /**
   * Clear validation errors from sheet
   */
  createErrorClearingInstructions(
    rowNumbers: number[],
    sheetName: string,
  ): {
    clearRanges: string[];
    instructions: string;
  } {
    const clearRanges = rowNumbers.map(row => `${sheetName}!Z${row}`); // Assuming error column is Z
    
    const instructions = `Clear validation errors for ${rowNumbers.length} rows. ` +
      `Ranges to clear: ${clearRanges.join(', ')}`;

    return {
      clearRanges,
      instructions,
    };
  }

  /**
   * Get localized error messages
   */
  private getErrorMessages(locale: string): Record<string, string> {
    const messages = {
      en: {
        REQUIRED_FIELD_MISSING: '{field} is required',
        INVALID_FORMAT: '{field} has invalid format',
        INVALID_LENGTH: '{field} length is invalid',
        INVALID_VALUE: '{field} has invalid value',
        INVALID_TYPE: '{field} must be a valid number',
        PRODUCT_NOT_FOUND: 'Product "{value}" not found in catalog',
        NAME_MISMATCH: '{field} does not match catalog',
        VALIDATION_ERROR: 'Error validating {field}',
        DEFAULT_ERROR: '{field}: {message}',
      },
      fr: {
        REQUIRED_FIELD_MISSING: '{field} est requis',
        INVALID_FORMAT: '{field} a un format invalide',
        INVALID_LENGTH: 'La longueur de {field} est invalide',
        INVALID_VALUE: '{field} a une valeur invalide',
        INVALID_TYPE: '{field} doit être un nombre valide',
        PRODUCT_NOT_FOUND: 'Produit "{value}" non trouvé dans le catalogue',
        NAME_MISMATCH: '{field} ne correspond pas au catalogue',
        VALIDATION_ERROR: 'Erreur de validation de {field}',
        DEFAULT_ERROR: '{field}: {message}',
      },
      ar: {
        REQUIRED_FIELD_MISSING: '{field} مطلوب',
        INVALID_FORMAT: '{field} له تنسيق غير صحيح',
        INVALID_LENGTH: 'طول {field} غير صحيح',
        INVALID_VALUE: '{field} له قيمة غير صحيحة',
        INVALID_TYPE: '{field} يجب أن يكون رقماً صحيحاً',
        PRODUCT_NOT_FOUND: 'المنتج "{value}" غير موجود في الكتالوج',
        NAME_MISMATCH: '{field} لا يطابق الكتالوج',
        VALIDATION_ERROR: 'خطأ في التحقق من {field}',
        DEFAULT_ERROR: '{field}: {message}',
      },
    };

    return messages[locale] || messages.en;
  }

  /**
   * Get localized warning messages
   */
  private getWarningMessages(locale: string): Record<string, string> {
    const messages = {
      en: {
        SUSPICIOUS_VALUE: '{field} value seems suspicious, please verify',
        PRICE_MISMATCH: '{field} differs from catalog price',
        PRECISION_WARNING: '{field} has unusual precision',
        DEFAULT_WARNING: '{field}: {message}',
      },
      fr: {
        SUSPICIOUS_VALUE: 'La valeur de {field} semble suspecte, veuillez vérifier',
        PRICE_MISMATCH: '{field} diffère du prix du catalogue',
        PRECISION_WARNING: '{field} a une précision inhabituelle',
        DEFAULT_WARNING: '{field}: {message}',
      },
      ar: {
        SUSPICIOUS_VALUE: 'قيمة {field} تبدو مشبوهة، يرجى التحقق',
        PRICE_MISMATCH: '{field} يختلف عن سعر الكتالوج',
        PRECISION_WARNING: '{field} له دقة غير عادية',
        DEFAULT_WARNING: '{field}: {message}',
      },
    };

    return messages[locale] || messages.en;
  }

  /**
   * Get localized field names
   */
  private getFieldName(field: string, locale: string): string {
    const fieldNames = {
      en: {
        customerName: 'Customer Name',
        phone: 'Phone Number',
        address: 'Address',
        city: 'City',
        email: 'Email',
        productName: 'Product Name',
        productSku: 'Product SKU',
        productQuantity: 'Quantity',
        price: 'Price',
        date: 'Order Date',
      },
      fr: {
        customerName: 'Nom du Client',
        phone: 'Numéro de Téléphone',
        address: 'Adresse',
        city: 'Ville',
        email: 'Email',
        productName: 'Nom du Produit',
        productSku: 'SKU du Produit',
        productQuantity: 'Quantité',
        price: 'Prix',
        date: 'Date de Commande',
      },
      ar: {
        customerName: 'اسم العميل',
        phone: 'رقم الهاتف',
        address: 'العنوان',
        city: 'المدينة',
        email: 'البريد الإلكتروني',
        productName: 'اسم المنتج',
        productSku: 'رمز المنتج',
        productQuantity: 'الكمية',
        price: 'السعر',
        date: 'تاريخ الطلب',
      },
    };

    const localeFields = fieldNames[locale] || fieldNames.en;
    return localeFields[field] || field;
  }

  /**
   * Get localized summary messages
   */
  private getSummaryMessages(locale: string): Record<string, string> {
    const messages = {
      en: {
        VALIDATION_SUMMARY: 'Validation completed: {totalRows} total, {validRows} valid, {errorRows} errors, {warningRows} warnings',
      },
      fr: {
        VALIDATION_SUMMARY: 'Validation terminée: {totalRows} total, {validRows} valides, {errorRows} erreurs, {warningRows} avertissements',
      },
      ar: {
        VALIDATION_SUMMARY: 'اكتمل التحقق: {totalRows} إجمالي، {validRows} صحيح، {errorRows} أخطاء، {warningRows} تحذيرات',
      },
    };

    return messages[locale] || messages.en;
  }

  /**
   * Interpolate message template with variables
   */
  private interpolateMessage(template: string, variables: Record<string, any>): string {
    let result = template;
    
    Object.entries(variables).forEach(([key, value]) => {
      const placeholder = `{${key}}`;
      result = result.replace(new RegExp(placeholder, 'g'), String(value || ''));
    });

    return result;
  }

  /**
   * Map validation error codes to sync error types
   */
  private mapErrorTypeToSyncErrorType(errorCode: string): SyncError['errorType'] {
    const mapping = {
      REQUIRED_FIELD_MISSING: 'validation',
      INVALID_FORMAT: 'validation',
      INVALID_LENGTH: 'validation',
      INVALID_VALUE: 'validation',
      INVALID_TYPE: 'validation',
      PRODUCT_NOT_FOUND: 'product_not_found',
      NAME_MISMATCH: 'validation',
      VALIDATION_ERROR: 'system',
    };

    return mapping[errorCode] || 'validation';
  }

  /**
   * Analyze error patterns for insights
   */
  private analyzeErrorPatterns(
    errorResults: Array<{
      rowNumber: number;
      result: ValidationResult;
      orderData: any;
    }>,
  ): Record<string, number> {
    const patterns: Record<string, number> = {};

    errorResults.forEach(({ result }) => {
      result.errors.forEach(error => {
        const key = `${error.field}_${error.code}`;
        patterns[key] = (patterns[key] || 0) + 1;
      });
    });

    return patterns;
  }
}