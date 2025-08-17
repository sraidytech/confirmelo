import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../common/database/prisma.service';
import { ValidationService } from '../../../common/validation/validation.service';
import { SanitizationService } from '../../../common/validation/sanitization.service';
import {
  SheetOrder,
  ValidationResult,
  ValidationError,
  ValidationWarning,
  ProductValidationResult,
} from '../../../common/interfaces/google-sheets-order-sync.interface';
import { Currency } from '@prisma/client';

@Injectable()
export class OrderValidationService {
  private readonly logger = new Logger(OrderValidationService.name);

  constructor(
    private readonly prismaService: PrismaService,
    private readonly validationService: ValidationService,
    private readonly sanitizationService: SanitizationService,
  ) {}

  /**
   * Validate all required fields for an order
   */
  async validateRequiredFields(
    sheetOrder: SheetOrder,
    organizationId: string,
    validationRules?: {
      requirePhone: boolean;
      requireProduct: boolean;
      requirePrice: boolean;
      phoneFormat: 'morocco' | 'international' | 'any';
      priceValidation: boolean;
    },
  ): Promise<ValidationResult> {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    this.logger.debug('Validating required fields for order', {
      rowNumber: sheetOrder.rowNumber,
      customerName: sheetOrder.customerName,
      phone: sheetOrder.phone,
      organizationId,
    });

    // Set default validation rules
    const rules = {
      requirePhone: true,
      requireProduct: true,
      requirePrice: true,
      phoneFormat: 'morocco' as const,
      priceValidation: true,
      ...validationRules,
    };

    // Validate customer name (always required)
    if (!sheetOrder.customerName || !sheetOrder.customerName.trim()) {
      errors.push({
        field: 'customerName',
        message: 'Customer name is required',
        code: 'REQUIRED_FIELD_MISSING',
        value: sheetOrder.customerName,
        suggestedFix: 'Enter a valid customer name',
      });
    } else if (sheetOrder.customerName.trim().length < 2) {
      errors.push({
        field: 'customerName',
        message: 'Customer name must be at least 2 characters long',
        code: 'INVALID_LENGTH',
        value: sheetOrder.customerName,
        suggestedFix: 'Enter a full customer name',
      });
    } else if (sheetOrder.customerName.length > 100) {
      errors.push({
        field: 'customerName',
        message: 'Customer name is too long (maximum 100 characters)',
        code: 'INVALID_LENGTH',
        value: sheetOrder.customerName,
        suggestedFix: 'Shorten the customer name',
      });
    }

    // Validate phone number
    if (rules.requirePhone) {
      const phoneValidation = await this.validatePhoneNumber(
        sheetOrder.phone,
        rules.phoneFormat,
      );
      if (!phoneValidation.isValid) {
        errors.push(...phoneValidation.errors);
      }
      warnings.push(...phoneValidation.warnings);
    }

    // Validate address (always required)
    if (!sheetOrder.address || !sheetOrder.address.trim()) {
      errors.push({
        field: 'address',
        message: 'Customer address is required',
        code: 'REQUIRED_FIELD_MISSING',
        value: sheetOrder.address,
        suggestedFix: 'Enter a valid customer address',
      });
    } else if (sheetOrder.address.trim().length < 5) {
      warnings.push({
        field: 'address',
        message: 'Address seems too short, please verify',
        code: 'SUSPICIOUS_VALUE',
        value: sheetOrder.address,
        suggestion: 'Ensure the address is complete',
      });
    }

    // Validate city (always required)
    if (!sheetOrder.city || !sheetOrder.city.trim()) {
      errors.push({
        field: 'city',
        message: 'Customer city is required',
        code: 'REQUIRED_FIELD_MISSING',
        value: sheetOrder.city,
        suggestedFix: 'Enter a valid city name',
      });
    }

    // Validate product
    if (rules.requireProduct) {
      const productValidation = await this.validateProduct(
        sheetOrder,
        organizationId,
      );
      if (!productValidation.isValid) {
        errors.push(...productValidation.errors);
      }
      warnings.push(...productValidation.warnings);
    }

    // Validate price
    if (rules.requirePrice && rules.priceValidation) {
      const priceValidation = this.validatePrice(
        sheetOrder.price,
        sheetOrder.productQuantity,
      );
      if (!priceValidation.isValid) {
        errors.push(...priceValidation.errors);
      }
      warnings.push(...priceValidation.warnings);
    }

    // Validate date
    const dateValidation = this.validateOrderDate(sheetOrder.date);
    if (!dateValidation.isValid) {
      errors.push(...dateValidation.errors);
    }
    warnings.push(...dateValidation.warnings);

    // Validate email if provided
    if (sheetOrder.email) {
      const emailValidation = this.validationService.validateEmail(sheetOrder.email);
      if (!emailValidation.isValid) {
        warnings.push({
          field: 'email',
          message: 'Invalid email format',
          code: 'INVALID_FORMAT',
          value: sheetOrder.email,
          suggestion: 'Correct the email format or leave empty',
        });
      }
    }

    const result: ValidationResult = {
      isValid: errors.length === 0,
      errors,
      warnings,
    };

    this.logger.debug('Validation completed', {
      rowNumber: sheetOrder.rowNumber,
      isValid: result.isValid,
      errorCount: errors.length,
      warningCount: warnings.length,
    });

    return result;
  }

  /**
   * Validate phone number with Morocco/international format support
   */
  async validatePhoneNumber(
    phone: string,
    format: 'morocco' | 'international' | 'any' = 'morocco',
  ): Promise<ValidationResult> {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    if (!phone || !phone.trim()) {
      errors.push({
        field: 'phone',
        message: 'Phone number is required',
        code: 'REQUIRED_FIELD_MISSING',
        value: phone,
        suggestedFix: 'Enter a valid phone number',
      });
      return { isValid: false, errors, warnings };
    }

    // Sanitize phone number
    const cleanPhone = this.sanitizationService.sanitizePhoneNumber(phone);
    
    if (!cleanPhone) {
      errors.push({
        field: 'phone',
        message: 'Phone number contains invalid characters',
        code: 'INVALID_FORMAT',
        value: phone,
        suggestedFix: 'Use only digits, +, -, (, ), and spaces',
      });
      return { isValid: false, errors, warnings };
    }

    // Remove all non-digit characters except +
    const digitsOnly = cleanPhone.replace(/[^\d+]/g, '');

    // Length validation
    if (digitsOnly.length < 7) {
      errors.push({
        field: 'phone',
        message: 'Phone number is too short',
        code: 'INVALID_LENGTH',
        value: phone,
        suggestedFix: 'Enter a complete phone number',
      });
    }

    if (digitsOnly.length > 15) {
      errors.push({
        field: 'phone',
        message: 'Phone number is too long',
        code: 'INVALID_LENGTH',
        value: phone,
        suggestedFix: 'Remove extra digits from phone number',
      });
    }

    // Format-specific validation
    switch (format) {
      case 'morocco':
        if (!this.isValidMoroccoPhone(digitsOnly)) {
          errors.push({
            field: 'phone',
            message: 'Invalid Morocco phone number format',
            code: 'INVALID_FORMAT',
            value: phone,
            suggestedFix: 'Use format: +212XXXXXXXXX or 0XXXXXXXXX',
          });
        }
        break;

      case 'international':
        if (!digitsOnly.startsWith('+') || !/^\+[1-9]\d{6,14}$/.test(digitsOnly)) {
          errors.push({
            field: 'phone',
            message: 'Invalid international phone number format',
            code: 'INVALID_FORMAT',
            value: phone,
            suggestedFix: 'Use international format: +[country code][number]',
          });
        }
        break;

      case 'any':
        // Basic validation for any format
        if (!/^(\+?[1-9]\d{6,14}|0\d{8,9})$/.test(digitsOnly)) {
          errors.push({
            field: 'phone',
            message: 'Invalid phone number format',
            code: 'INVALID_FORMAT',
            value: phone,
            suggestedFix: 'Enter a valid phone number',
          });
        }
        break;
    }

    // Check for suspicious patterns
    if (this.isSuspiciousPhone(digitsOnly)) {
      warnings.push({
        field: 'phone',
        message: 'Phone number appears suspicious, please verify',
        code: 'SUSPICIOUS_VALUE',
        value: phone,
        suggestion: 'Double-check the phone number with customer',
      });
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Validate product with client catalog integration
   */
  async validateProduct(
    sheetOrder: SheetOrder,
    organizationId: string,
  ): Promise<ProductValidationResult> {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];
    let product = null;
    const suggestions = [];

    if (!sheetOrder.productName || !sheetOrder.productName.trim()) {
      errors.push({
        field: 'productName',
        message: 'Product name is required',
        code: 'REQUIRED_FIELD_MISSING',
        value: sheetOrder.productName,
        suggestedFix: 'Enter a valid product name',
      });
      return { isValid: false, errors, warnings, suggestions };
    }

    // Validate product quantity
    if (!sheetOrder.productQuantity || sheetOrder.productQuantity < 1) {
      errors.push({
        field: 'productQuantity',
        message: 'Product quantity must be at least 1',
        code: 'INVALID_VALUE',
        value: sheetOrder.productQuantity,
        suggestedFix: 'Enter a valid quantity (minimum 1)',
      });
    }

    if (sheetOrder.productQuantity > 1000) {
      warnings.push({
        field: 'productQuantity',
        message: 'Large quantity order, please verify',
        code: 'SUSPICIOUS_VALUE',
        value: sheetOrder.productQuantity,
        suggestion: 'Confirm the quantity with customer',
      });
    }

    try {
      // Try to find exact product match by SKU
      if (sheetOrder.productSku) {
        product = await this.prismaService.product.findFirst({
          where: {
            organizationId,
            sku: sheetOrder.productSku,
          },
        });

        if (product) {
          // Verify name matches
          if (product.name.toLowerCase() !== sheetOrder.productName.toLowerCase()) {
            warnings.push({
              field: 'productName',
              message: `Product name mismatch. Found: "${product.name}"`,
              code: 'NAME_MISMATCH',
              value: sheetOrder.productName,
              suggestion: `Consider using "${product.name}" instead`,
            });
          }
        }
      }

      // If not found by SKU, try to find by name
      if (!product) {
        product = await this.prismaService.product.findFirst({
          where: {
            organizationId,
            name: {
              equals: sheetOrder.productName,
              mode: 'insensitive',
            },
          },
        });
      }

      // If still not found, search for similar products
      if (!product) {
        const similarProducts = await this.findSimilarProducts(
          sheetOrder.productName,
          organizationId,
        );

        if (similarProducts.length > 0) {
          suggestions.push(...similarProducts);
          
          warnings.push({
            field: 'productName',
            message: `Product not found. Found ${similarProducts.length} similar products`,
            code: 'PRODUCT_NOT_FOUND',
            value: sheetOrder.productName,
            suggestion: `Consider using one of the suggested products`,
          });
        } else {
          warnings.push({
            field: 'productName',
            message: 'Product not found in catalog. Will be created automatically',
            code: 'PRODUCT_NOT_FOUND',
            value: sheetOrder.productName,
            suggestion: 'Verify product name or add to catalog manually',
          });
        }
      }

      // Validate price against catalog if product found
      if (product && sheetOrder.price) {
        const catalogPrice = Number(product.price);
        const sheetPrice = Number(sheetOrder.price);
        const priceDifference = Math.abs(catalogPrice - sheetPrice);
        const priceVariancePercent = (priceDifference / catalogPrice) * 100;

        if (priceVariancePercent > 20) {
          warnings.push({
            field: 'price',
            message: `Price differs significantly from catalog (${catalogPrice} ${product.currency})`,
            code: 'PRICE_MISMATCH',
            value: sheetOrder.price,
            suggestion: `Verify price. Catalog price: ${catalogPrice} ${product.currency}`,
          });
        }
      }

    } catch (error) {
      this.logger.error('Error validating product', {
        error: error.message,
        productName: sheetOrder.productName,
        productSku: sheetOrder.productSku,
        organizationId,
      });

      errors.push({
        field: 'productName',
        message: 'Error validating product against catalog',
        code: 'VALIDATION_ERROR',
        value: sheetOrder.productName,
        suggestedFix: 'Check product name and try again',
      });
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      product: product ? {
        id: product.id,
        name: product.name,
        sku: product.sku,
        price: Number(product.price),
        currency: product.currency,
      } : undefined,
      suggestions,
    };
  }

  /**
   * Validate price with currency and format validation
   */
  validatePrice(
    price: number,
    quantity: number = 1,
    currency: Currency = Currency.MAD,
  ): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    if (price === null || price === undefined) {
      errors.push({
        field: 'price',
        message: 'Price is required',
        code: 'REQUIRED_FIELD_MISSING',
        value: price,
        suggestedFix: 'Enter a valid price',
      });
      return { isValid: false, errors, warnings };
    }

    if (typeof price !== 'number' || isNaN(price)) {
      errors.push({
        field: 'price',
        message: 'Price must be a valid number',
        code: 'INVALID_TYPE',
        value: price,
        suggestedFix: 'Enter a numeric price value',
      });
      return { isValid: false, errors, warnings };
    }

    if (price < 0) {
      errors.push({
        field: 'price',
        message: 'Price cannot be negative',
        code: 'INVALID_VALUE',
        value: price,
        suggestedFix: 'Enter a positive price value',
      });
    }

    if (price === 0) {
      warnings.push({
        field: 'price',
        message: 'Price is zero, please verify',
        code: 'SUSPICIOUS_VALUE',
        value: price,
        suggestion: 'Confirm if this is a free product',
      });
    }

    // Currency-specific validation
    switch (currency) {
      case Currency.MAD:
        if (price > 100000) {
          warnings.push({
            field: 'price',
            message: 'Very high price for MAD currency, please verify',
            code: 'SUSPICIOUS_VALUE',
            value: price,
            suggestion: 'Confirm the price is correct',
          });
        }
        if (price < 1 && price > 0) {
          warnings.push({
            field: 'price',
            message: 'Price less than 1 MAD, please verify',
            code: 'SUSPICIOUS_VALUE',
            value: price,
            suggestion: 'Confirm the price is in MAD',
          });
        }
        break;

      case Currency.USD:
      case Currency.EUR:
        if (price > 10000) {
          warnings.push({
            field: 'price',
            message: `Very high price for ${currency} currency, please verify`,
            code: 'SUSPICIOUS_VALUE',
            value: price,
            suggestion: 'Confirm the price is correct',
          });
        }
        break;
    }

    // Validate decimal places
    const decimalPlaces = (price.toString().split('.')[1] || '').length;
    if (decimalPlaces > 2) {
      warnings.push({
        field: 'price',
        message: 'Price has more than 2 decimal places',
        code: 'PRECISION_WARNING',
        value: price,
        suggestion: 'Round to 2 decimal places',
      });
    }

    // Validate total price
    const totalPrice = price * quantity;
    if (totalPrice > 1000000) {
      warnings.push({
        field: 'price',
        message: 'Total order value is very high, please verify',
        code: 'SUSPICIOUS_VALUE',
        value: totalPrice,
        suggestion: 'Confirm the total amount with customer',
      });
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Validate order date
   */
  private validateOrderDate(dateStr: string): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    if (!dateStr || !dateStr.trim()) {
      errors.push({
        field: 'date',
        message: 'Order date is required',
        code: 'REQUIRED_FIELD_MISSING',
        value: dateStr,
        suggestedFix: 'Enter a valid date (YYYY-MM-DD format)',
      });
      return { isValid: false, errors, warnings };
    }

    try {
      const orderDate = new Date(dateStr);
      
      if (isNaN(orderDate.getTime())) {
        errors.push({
          field: 'date',
          message: 'Invalid date format',
          code: 'INVALID_FORMAT',
          value: dateStr,
          suggestedFix: 'Use YYYY-MM-DD format (e.g., 2024-01-15)',
        });
        return { isValid: false, errors, warnings };
      }

      const now = new Date();
      const oneYearAgo = new Date();
      oneYearAgo.setFullYear(now.getFullYear() - 1);
      const oneMonthFromNow = new Date();
      oneMonthFromNow.setMonth(now.getMonth() + 1);

      // Check if date is too old
      if (orderDate < oneYearAgo) {
        warnings.push({
          field: 'date',
          message: 'Order date is more than a year old',
          code: 'SUSPICIOUS_VALUE',
          value: dateStr,
          suggestion: 'Verify the order date is correct',
        });
      }

      // Check if date is in the future
      if (orderDate > oneMonthFromNow) {
        warnings.push({
          field: 'date',
          message: 'Order date is far in the future',
          code: 'SUSPICIOUS_VALUE',
          value: dateStr,
          suggestion: 'Verify the order date is correct',
        });
      }

    } catch (error) {
      errors.push({
        field: 'date',
        message: 'Unable to parse date',
        code: 'INVALID_FORMAT',
        value: dateStr,
        suggestedFix: 'Use a valid date format (YYYY-MM-DD)',
      });
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Check if Morocco phone number is valid
   */
  private isValidMoroccoPhone(phone: string): boolean {
    // Remove + and country code if present
    let cleanPhone = phone;
    if (phone.startsWith('+212')) {
      cleanPhone = phone.substring(4);
    } else if (phone.startsWith('212')) {
      cleanPhone = phone.substring(3);
    } else if (phone.startsWith('0')) {
      cleanPhone = phone.substring(1);
    }

    // Morocco mobile numbers: 6XXXXXXXX or 7XXXXXXXX (9 digits)
    // Morocco landline numbers: 5XXXXXXXX (9 digits)
    // Must be exactly 9 digits and start with 5, 6, or 7
    return /^[567]\d{8}$/.test(cleanPhone);
  }

  /**
   * Check for suspicious phone number patterns
   */
  private isSuspiciousPhone(phone: string): boolean {
    const digitsOnly = phone.replace(/[^\d]/g, '');
    
    // Check for repeated digits (7 or more consecutive same digits)
    if (/(\d)\1{6,}/.test(digitsOnly)) {
      return true;
    }

    // Check for sequential digits (6 or more consecutive sequential digits)
    if (/012345|123456|234567|345678|456789|567890/.test(digitsOnly)) {
      return true;
    }

    // Check for common test numbers
    const testNumbers = ['1111111111', '0000000000', '1234567890'];
    return testNumbers.some(test => digitsOnly.includes(test));
  }

  /**
   * Find similar products in catalog
   */
  private async findSimilarProducts(
    productName: string,
    organizationId: string,
  ): Promise<Array<{
    id: string;
    name: string;
    sku?: string;
    similarity: number;
  }>> {
    try {
      // Get all products for the organization
      const products = await this.prismaService.product.findMany({
        where: { organizationId },
        select: { id: true, name: true, sku: true },
        take: 50, // Limit for performance
      });

      // Handle case where products is null or undefined
      if (!products || !Array.isArray(products)) {
        return [];
      }

      const similarities = products.map(product => ({
        ...product,
        similarity: this.calculateStringSimilarity(
          productName.toLowerCase(),
          product.name.toLowerCase(),
        ),
      }));

      // Return products with similarity > 0.6, sorted by similarity
      return similarities
        .filter(item => item.similarity > 0.6)
        .sort((a, b) => b.similarity - a.similarity)
        .slice(0, 5); // Top 5 matches

    } catch (error) {
      this.logger.error('Error finding similar products', {
        error: error.message,
        productName,
        organizationId,
      });
      return [];
    }
  }

  /**
   * Calculate string similarity using Levenshtein distance
   */
  private calculateStringSimilarity(str1: string, str2: string): number {
    if (str1 === str2) return 1;
    if (str1.length === 0 || str2.length === 0) return 0;

    const matrix = [];
    for (let i = 0; i <= str2.length; i++) {
      matrix[i] = [i];
    }
    for (let j = 0; j <= str1.length; j++) {
      matrix[0][j] = j;
    }

    for (let i = 1; i <= str2.length; i++) {
      for (let j = 1; j <= str1.length; j++) {
        if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j] + 1,
          );
        }
      }
    }

    const maxLength = Math.max(str1.length, str2.length);
    return (maxLength - matrix[str2.length][str1.length]) / maxLength;
  }
}