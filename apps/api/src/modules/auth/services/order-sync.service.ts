import { Injectable, Logger, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../common/database/prisma.service';
import { GoogleSheetsOAuth2Service } from './google-sheets-oauth2.service';
import { OrderValidationService } from './order-validation.service';
import { ValidationFeedbackService } from './validation-feedback.service';
import {
  SheetOrder,
  SyncResult,
  SyncError,
  OrderCreationContext,
  BatchProcessingOptions,
  DuplicateDetectionResult,
  DuplicateResolution,
  ValidationResult,
} from '../../../common/interfaces/google-sheets-order-sync.interface';
import { OrderStatus, Currency, PaymentMethod } from '@prisma/client';

@Injectable()
export class OrderSyncService {
  private readonly logger = new Logger(OrderSyncService.name);

  constructor(
    private readonly prismaService: PrismaService,
    private readonly googleSheetsService: GoogleSheetsOAuth2Service,
    private readonly orderValidationService: OrderValidationService,
    private readonly validationFeedbackService: ValidationFeedbackService,
  ) { }

  /**
   * Core method to synchronize orders from a Google Sheet
   */
  async syncOrdersFromSheet(
    connectionId: string,
    spreadsheetId: string,
    syncOperationId: string,
    options?: {
      startRow?: number;
      endRow?: number;
      forceResync?: boolean;
      batchOptions?: BatchProcessingOptions;
    },
  ): Promise<SyncResult> {
    const startTime = Date.now();
    const startedAt = new Date();

    this.logger.log('Starting order sync from sheet', {
      connectionId,
      spreadsheetId,
      syncOperationId,
      options,
    });

    try {
      // Get orders from the sheet
      const sheetOrders = await this.getOrdersFromSheet(
        connectionId,
        spreadsheetId,
        options?.startRow,
        options?.endRow,
      );

      if (sheetOrders.length === 0) {
        this.logger.log('No orders found in sheet', {
          connectionId,
          spreadsheetId,
          syncOperationId,
        });

        return {
          success: true,
          operationId: syncOperationId,
          ordersProcessed: 0,
          ordersCreated: 0,
          ordersSkipped: 0,
          errors: [],
          duration: Date.now() - startTime,
          startedAt,
          completedAt: new Date(),
        };
      }

      // Get batch processing options
      const batchOptions: BatchProcessingOptions = {
        batchSize: 10,
        maxConcurrency: 3,
        retryAttempts: 2,
        retryDelay: 1000,
        stopOnError: false,
        validateBeforeProcessing: true,
        ...options?.batchOptions,
      };

      // Process orders in batches
      const result = await this.processBatchOrders(
        sheetOrders,
        connectionId,
        spreadsheetId,
        syncOperationId,
        batchOptions,
        options?.forceResync || false,
      );

      // Update sync operation with results
      await this.updateSyncOperation(syncOperationId, result);

      // Update sheet with order IDs for successfully created orders
      if (result.ordersCreated > 0) {
        await this.updateSheetWithOrderIds(
          connectionId,
          spreadsheetId,
          result.createdOrders || [],
        );
      }

      const completedAt = new Date();
      const finalResult: SyncResult = {
        ...result,
        duration: Date.now() - startTime,
        startedAt,
        completedAt,
      };

      this.logger.log('Completed order sync from sheet', {
        connectionId,
        spreadsheetId,
        syncOperationId,
        result: finalResult,
      });

      return finalResult;
    } catch (error) {
      this.logger.error('Failed to sync orders from sheet', {
        error: error.message,
        connectionId,
        spreadsheetId,
        syncOperationId,
      });

      // Update sync operation with error
      await this.updateSyncOperationError(syncOperationId, error.message);

      throw error;
    }
  }

  /**
   * Process orders in batches for better performance and error handling
   */
  private async processBatchOrders(
    sheetOrders: SheetOrder[],
    connectionId: string,
    spreadsheetId: string,
    syncOperationId: string,
    batchOptions: BatchProcessingOptions,
    forceResync: boolean,
  ): Promise<SyncResult & { createdOrders?: Array<{ rowNumber: number; orderId: string }> }> {
    let ordersProcessed = 0;
    let ordersCreated = 0;
    let ordersSkipped = 0;
    const errors: SyncError[] = [];
    const createdOrders: Array<{ rowNumber: number; orderId: string }> = [];

    // Process orders in batches
    for (let i = 0; i < sheetOrders.length; i += batchOptions.batchSize) {
      const batch = sheetOrders.slice(i, i + batchOptions.batchSize);

      this.logger.log('Processing batch', {
        batchNumber: Math.floor(i / batchOptions.batchSize) + 1,
        batchSize: batch.length,
        totalBatches: Math.ceil(sheetOrders.length / batchOptions.batchSize),
      });

      // Process batch with concurrency control
      const batchPromises = batch.map(async (sheetOrder) => {
        try {
          const result = await this.processSheetOrder(
            sheetOrder,
            connectionId,
            spreadsheetId,
            syncOperationId,
            forceResync,
          );

          ordersProcessed++;

          if (result.created) {
            ordersCreated++;
            createdOrders.push({
              rowNumber: sheetOrder.rowNumber,
              orderId: result.orderId!,
            });
          } else {
            ordersSkipped++;
          }

          return result;
        } catch (error) {
          ordersProcessed++;
          const syncError: SyncError = {
            rowNumber: sheetOrder.rowNumber,
            errorType: 'system',
            errorMessage: error.message,
            orderData: sheetOrder,
          };
          errors.push(syncError);

          if (batchOptions.stopOnError) {
            throw error;
          }

          return { created: false, error: syncError };
        }
      });

      // Wait for batch to complete with concurrency limit
      const batchResults = await Promise.allSettled(batchPromises);

      // Handle any rejected promises
      batchResults.forEach((result, index) => {
        if (result.status === 'rejected') {
          const sheetOrder = batch[index];
          const syncError: SyncError = {
            rowNumber: sheetOrder.rowNumber,
            errorType: 'system',
            errorMessage: result.reason?.message || 'Unknown error',
            orderData: sheetOrder,
          };
          errors.push(syncError);
        }
      });

      // Update sync operation progress
      await this.updateSyncOperationProgress(
        syncOperationId,
        ordersProcessed,
        ordersCreated,
        ordersSkipped,
        errors.length,
      );

      // Small delay between batches to avoid overwhelming the system
      if (i + batchOptions.batchSize < sheetOrders.length) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    return {
      success: errors.length === 0 || ordersCreated > 0,
      operationId: syncOperationId,
      ordersProcessed,
      ordersCreated,
      ordersSkipped,
      errors,
      duration: 0, // Will be set by caller
      startedAt: new Date(), // Will be set by caller
      createdOrders,
    };
  }

  /**
   * Process a single sheet order
   */
  async processSheetOrder(
    sheetOrder: SheetOrder,
    connectionId: string,
    spreadsheetId: string,
    syncOperationId: string,
    forceResync: boolean = false,
  ): Promise<{
    created: boolean;
    orderId?: string;
    skipped?: boolean;
    error?: SyncError;
    reason?: string;
    flagged?: boolean;
    validationResult?: ValidationResult;
  }> {
    this.logger.log('Processing sheet order', {
      rowNumber: sheetOrder.rowNumber,
      customerName: sheetOrder.customerName,
      phone: sheetOrder.phone,
    });

    try {
      // CRITICAL FIX: Don't skip orders with existing IDs - these are user reference numbers, not our system IDs
      // Only skip if the order ID looks like our system-generated ID (starts with 'cmd' or similar)
      if (sheetOrder.orderId && !forceResync && sheetOrder.orderId.startsWith('cmd')) {
        this.logger.log('Order already has system ID, skipping', {
          rowNumber: sheetOrder.rowNumber,
          orderId: sheetOrder.orderId,
        });
        return {
          created: false,
          skipped: true,
          reason: 'Order already has system ID and forceResync is false'
        };
      }

      // Log that we're processing this order (even if it has a user reference ID)
      if (sheetOrder.orderId && !sheetOrder.orderId.startsWith('cmd')) {
        this.logger.log('Processing order with user reference ID', {
          rowNumber: sheetOrder.rowNumber,
          userReferenceId: sheetOrder.orderId,
        });
      }

      // Get connection details for organization context
      const connection = await this.prismaService.platformConnection.findUnique({
        where: { id: connectionId },
        include: { user: { include: { organization: true } } },
      });

      if (!connection) {
        throw new NotFoundException('Platform connection not found');
      }

      // Validate order data
      const validationResult = await this.orderValidationService.validateRequiredFields(
        sheetOrder,
        connection.organizationId,
        {
          requirePhone: true,
          requireProduct: true,
          requirePrice: true,
          phoneFormat: 'morocco',
          priceValidation: true,
        },
      );

      // If validation fails, return error
      if (!validationResult.isValid) {
        const syncErrors = this.validationFeedbackService.convertToSyncErrors(
          validationResult,
          sheetOrder.rowNumber,
          sheetOrder,
        );

        this.logger.warn('Order validation failed', {
          rowNumber: sheetOrder.rowNumber,
          errors: validationResult.errors,
          warnings: validationResult.warnings,
        });

        return {
          created: false,
          error: syncErrors.length > 0 ? syncErrors[0] : {
            rowNumber: sheetOrder.rowNumber,
            errorType: 'validation',
            errorMessage: 'Validation failed',
            orderData: sheetOrder,
          },
          validationResult,
        };
      }

      // Log validation warnings if any
      if (validationResult.warnings && validationResult.warnings.length > 0) {
        this.logger.warn('Order validation warnings', {
          rowNumber: sheetOrder.rowNumber,
          warnings: validationResult.warnings,
        });
      }

      // Check for duplicates
      const duplicateResult = await this.detectDuplicateOrder(sheetOrder, connectionId);
      const duplicateResolution = await this.handleDuplicateOrder(duplicateResult, sheetOrder);

      if (duplicateResolution.action === 'skip') {
        this.logger.log('Skipping duplicate order', {
          rowNumber: sheetOrder.rowNumber,
          reason: duplicateResolution.reason,
        });
        return {
          created: false,
          skipped: true,
          reason: duplicateResolution.reason,
          flagged: duplicateResolution.flagged,
          validationResult,
        };
      }

      // Create order from sheet data
      const orderId = await this.createOrderFromSheetData(
        sheetOrder,
        connectionId,
        spreadsheetId,
        syncOperationId,
      );

      this.logger.log('Successfully created order from sheet', {
        rowNumber: sheetOrder.rowNumber,
        orderId,
        customerName: sheetOrder.customerName,
      });

      return {
        created: true,
        orderId,
        reason: duplicateResolution.reason,
        flagged: duplicateResolution.flagged,
        validationResult,
      };
    } catch (error) {
      this.logger.error('Failed to process sheet order', {
        error: error.message,
        rowNumber: sheetOrder.rowNumber,
        sheetOrder,
      });

      const syncError: SyncError = {
        rowNumber: sheetOrder.rowNumber,
        errorType: this.categorizeError(error),
        errorMessage: error.message,
        orderData: sheetOrder,
        suggestedFix: this.getSuggestedFix(error),
      };

      return { created: false, error: syncError };
    }
  }

  /**
   * Create an order from sheet data
   */
  async createOrderFromSheetData(
    sheetOrder: SheetOrder,
    connectionId: string,
    spreadsheetId: string,
    syncOperationId: string,
  ): Promise<string> {
    this.logger.log('Creating order from sheet data', {
      rowNumber: sheetOrder.rowNumber,
      customerName: sheetOrder.customerName,
      phone: sheetOrder.phone,
    });

    // Get connection details for organization and store context
    const connection = await this.prismaService.platformConnection.findUnique({
      where: { id: connectionId },
      include: { user: { include: { organization: true } } },
    });

    if (!connection) {
      throw new NotFoundException('Platform connection not found');
    }

    const organizationId = connection.organizationId;

    // Get or create customer
    const customer = await this.getOrCreateCustomer(sheetOrder, organizationId);

    // Find or create product
    const product = await this.findOrCreateProduct(sheetOrder, organizationId);

    // Get default store (first store for the organization)
    const store = await this.prismaService.store.findFirst({
      where: { organizationId, isActive: true },
    });

    if (!store) {
      throw new BadRequestException('No active store found for organization');
    }

    // Generate order number
    const orderNumber = await this.generateOrderNumber(organizationId);

    // Calculate totals
    const subtotal = sheetOrder.price * sheetOrder.productQuantity;
    const total = subtotal; // For now, no additional fees

    // Create the order
    const order = await this.prismaService.order.create({
      data: {
        orderNumber,
        organizationId,
        storeId: store.id,
        customerId: customer.id,
        status: OrderStatus.NEW,
        orderDate: new Date(sheetOrder.date),
        shippingAddress: sheetOrder.address,
        shippingCity: sheetOrder.city,
        shippingPhone: sheetOrder.phone,
        subtotal,
        total,
        currency: Currency.MAD,
        paymentMethod: PaymentMethod.COD,
        source: 'google_sheets',
        importedAt: new Date(),
        sheetSpreadsheetId: spreadsheetId,
        sheetRowNumber: sheetOrder.rowNumber,
        notes: sheetOrder.notes,
        items: {
          create: {
            productId: product.id,
            quantity: sheetOrder.productQuantity,
            unitPrice: sheetOrder.price,
            total: subtotal,
          },
        },
        activities: {
          create: {
            userId: connection.userId,
            action: 'order_imported',
            description: `Order imported from Google Sheets (Row ${sheetOrder.rowNumber})`,
            metadata: {
              syncOperationId,
              connectionId,
              spreadsheetId,
              rowNumber: sheetOrder.rowNumber,
            },
          },
        },
      },
    });

    this.logger.log('Successfully created order', {
      orderId: order.id,
      orderNumber: order.orderNumber,
      customerId: customer.id,
      productId: product.id,
      total: order.total,
    });

    return order.id;
  }

  /**
   * Get or create customer from sheet data
   */
  private async getOrCreateCustomer(sheetOrder: SheetOrder, organizationId: string) {
    // Try to find existing customer by phone
    let customer = await this.prismaService.customer.findFirst({
      where: {
        organizationId,
        phone: sheetOrder.phone,
      },
    });

    if (!customer) {
      // Create new customer
      customer = await this.prismaService.customer.create({
        data: {
          organizationId,
          firstName: sheetOrder.customerName.split(' ')[0] || sheetOrder.customerName,
          lastName: sheetOrder.customerName.split(' ').slice(1).join(' ') || '',
          phone: sheetOrder.phone,
          alternatePhone: sheetOrder.alternatePhone,
          email: sheetOrder.email,
          address: sheetOrder.address,
          city: sheetOrder.city,
          postalCode: sheetOrder.postalCode,
        },
      });

      this.logger.log('Created new customer', {
        customerId: customer.id,
        name: sheetOrder.customerName,
        phone: sheetOrder.phone,
      });
    } else {
      // Update customer info if needed
      const updateData: any = {};

      if (sheetOrder.email && !customer.email) {
        updateData.email = sheetOrder.email;
      }

      if (sheetOrder.alternatePhone && !customer.alternatePhone) {
        updateData.alternatePhone = sheetOrder.alternatePhone;
      }

      if (sheetOrder.address && !customer.address) {
        updateData.address = sheetOrder.address;
      }

      if (sheetOrder.city && !customer.city) {
        updateData.city = sheetOrder.city;
      }

      if (Object.keys(updateData).length > 0) {
        customer = await this.prismaService.customer.update({
          where: { id: customer.id },
          data: updateData,
        });

        this.logger.log('Updated existing customer', {
          customerId: customer.id,
          updates: Object.keys(updateData),
        });
      }
    }

    return customer;
  }

  /**
   * Find or create product from sheet data
   */
  private async findOrCreateProduct(sheetOrder: SheetOrder, organizationId: string) {
    // Try to find existing product by SKU or name
    let product = null;

    if (sheetOrder.productSku) {
      product = await this.prismaService.product.findFirst({
        where: {
          organizationId,
          sku: sheetOrder.productSku,
        },
      });
    }

    if (!product) {
      // Try to find by name (case-insensitive)
      product = await this.prismaService.product.findFirst({
        where: {
          organizationId,
          name: {
            contains: sheetOrder.productName,
            mode: 'insensitive',
          },
        },
      });
    }

    if (!product) {
      // Create new product
      product = await this.prismaService.product.create({
        data: {
          organizationId,
          name: sheetOrder.productName,
          sku: sheetOrder.productSku,
          price: sheetOrder.price,
          currency: Currency.MAD,
          stockQuantity: 100, // Default stock
          images: [],
        },
      });

      this.logger.log('Created new product', {
        productId: product.id,
        name: sheetOrder.productName,
        sku: sheetOrder.productSku,
        price: sheetOrder.price,
      });
    }

    return product;
  }

  /**
   * Detect duplicate orders with enhanced logic
   */
  private async detectDuplicateOrder(
    sheetOrder: SheetOrder,
    connectionId: string,
  ): Promise<DuplicateDetectionResult> {
    const startTime = Date.now();

    // Get connection details for organization context
    const connection = await this.prismaService.platformConnection.findUnique({
      where: { id: connectionId },
    });

    if (!connection) {
      throw new NotFoundException('Platform connection not found');
    }

    this.logger.debug('Starting duplicate detection', {
      connectionId,
      organizationId: connection.organizationId,
      phone: sheetOrder.phone,
      customerName: sheetOrder.customerName,
      orderDate: sheetOrder.date,
    });

    // Enhanced duplicate detection with multiple strategies
    const duplicateResult = await this.performDuplicateDetection(
      sheetOrder,
      connection.organizationId,
    );

    // Log duplicate detection result
    if (duplicateResult.isDuplicate) {
      this.logger.warn('Duplicate order detected', {
        connectionId,
        organizationId: connection.organizationId,
        duplicateType: duplicateResult.duplicateType,
        existingOrderId: duplicateResult.existingOrder?.id,
        existingOrderNumber: duplicateResult.existingOrder?.orderNumber,
        similarity: duplicateResult.similarity,
        conflictingFields: duplicateResult.conflictingFields,
        detectionTime: Date.now() - startTime,
      });
    } else {
      this.logger.debug('No duplicate found', {
        connectionId,
        organizationId: connection.organizationId,
        detectionTime: Date.now() - startTime,
      });
    }

    return duplicateResult;
  }

  /**
   * Perform comprehensive duplicate detection using multiple strategies
   */
  private async performDuplicateDetection(
    sheetOrder: SheetOrder,
    organizationId: string,
  ): Promise<DuplicateDetectionResult> {
    // Strategy 1: Exact match by phone and date
    const exactMatch = await this.findExactDuplicate(sheetOrder, organizationId);
    if (exactMatch) {
      return exactMatch;
    }

    // Strategy 2: Similar match by phone within date range
    const similarMatch = await this.findSimilarDuplicate(sheetOrder, organizationId);
    if (similarMatch) {
      return similarMatch;
    }

    // Strategy 3: Fuzzy match by customer details
    const fuzzyMatch = await this.findFuzzyDuplicate(sheetOrder, organizationId);
    if (fuzzyMatch) {
      return fuzzyMatch;
    }

    return {
      isDuplicate: false,
      duplicateType: 'none',
    };
  }

  /**
   * Find exact duplicate orders (same phone, date, and key details)
   */
  private async findExactDuplicate(
    sheetOrder: SheetOrder,
    organizationId: string,
  ): Promise<DuplicateDetectionResult | null> {
    const orderDate = new Date(sheetOrder.date);
    const startOfDay = new Date(orderDate);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(orderDate);
    endOfDay.setHours(23, 59, 59, 999);

    const existingOrder = await this.prismaService.order.findFirst({
      where: {
        organizationId,
        customer: {
          phone: sheetOrder.phone,
        },
        orderDate: {
          gte: startOfDay,
          lte: endOfDay,
        },
      },
      include: {
        customer: true,
        items: {
          include: {
            product: true,
          },
        },
      },
    });

    if (!existingOrder) {
      return null;
    }

    // Calculate similarity score for exact matching
    const similarity = this.calculateSimilarityScore(sheetOrder, existingOrder);
    const conflictingFields = this.identifyConflictingFields(sheetOrder, existingOrder);

    // Consider it exact if similarity is very high
    const isExactDuplicate = similarity >= 0.95;

    return {
      isDuplicate: true,
      duplicateType: isExactDuplicate ? 'exact' : 'similar',
      existingOrder: {
        id: existingOrder.id,
        orderNumber: existingOrder.orderNumber,
        customerName: `${existingOrder.customer.firstName} ${existingOrder.customer.lastName}`,
        phone: existingOrder.customer.phone,
        orderDate: existingOrder.orderDate,
        total: Number(existingOrder.total),
        status: existingOrder.status,
      },
      similarity,
      conflictingFields,
    };
  }

  /**
   * Find similar duplicate orders (same phone within extended date range)
   */
  private async findSimilarDuplicate(
    sheetOrder: SheetOrder,
    organizationId: string,
  ): Promise<DuplicateDetectionResult | null> {
    const orderDate = new Date(sheetOrder.date);
    const startDate = new Date(orderDate);
    startDate.setDate(startDate.getDate() - 7); // Look back 7 days
    const endDate = new Date(orderDate);
    endDate.setDate(endDate.getDate() + 1); // Look forward 1 day

    const existingOrders = await this.prismaService.order.findMany({
      where: {
        organizationId,
        customer: {
          phone: sheetOrder.phone,
        },
        orderDate: {
          gte: startDate,
          lte: endDate,
        },
      },
      include: {
        customer: true,
        items: {
          include: {
            product: true,
          },
        },
      },
      orderBy: {
        orderDate: 'desc',
      },
      take: 5, // Limit to most recent 5 orders
    });

    if (existingOrders.length === 0) {
      return null;
    }

    // Find the most similar order
    let bestMatch = null;
    let highestSimilarity = 0;

    for (const existingOrder of existingOrders) {
      const similarity = this.calculateSimilarityScore(sheetOrder, existingOrder);
      if (similarity > highestSimilarity && similarity >= 0.7) {
        highestSimilarity = similarity;
        bestMatch = existingOrder;
      }
    }

    if (!bestMatch) {
      return null;
    }

    const conflictingFields = this.identifyConflictingFields(sheetOrder, bestMatch);

    return {
      isDuplicate: true,
      duplicateType: highestSimilarity >= 0.9 ? 'exact' : 'similar',
      existingOrder: {
        id: bestMatch.id,
        orderNumber: bestMatch.orderNumber,
        customerName: `${bestMatch.customer.firstName} ${bestMatch.customer.lastName}`,
        phone: bestMatch.customer.phone,
        orderDate: bestMatch.orderDate,
        total: Number(bestMatch.total),
        status: bestMatch.status,
      },
      similarity: highestSimilarity,
      conflictingFields,
    };
  }

  /**
   * Find fuzzy duplicate orders (similar customer details, different phone)
   */
  private async findFuzzyDuplicate(
    sheetOrder: SheetOrder,
    organizationId: string,
  ): Promise<DuplicateDetectionResult | null> {
    const orderDate = new Date(sheetOrder.date);
    const startOfDay = new Date(orderDate);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(orderDate);
    endOfDay.setHours(23, 59, 59, 999);

    const [firstName, ...lastNameParts] = sheetOrder.customerName.trim().split(' ');
    const lastName = lastNameParts.join(' ');

    // Look for orders with similar customer name and address on the same date
    const existingOrders = await this.prismaService.order.findMany({
      where: {
        organizationId,
        orderDate: {
          gte: startOfDay,
          lte: endOfDay,
        },
        OR: [
          {
            customer: {
              firstName: {
                contains: firstName,
                mode: 'insensitive',
              },
            },
          },
          {
            shippingAddress: {
              contains: sheetOrder.address.substring(0, 20), // First 20 chars of address
              mode: 'insensitive',
            },
          },
        ],
      },
      include: {
        customer: true,
        items: {
          include: {
            product: true,
          },
        },
      },
      take: 10,
    });

    if (existingOrders.length === 0) {
      return null;
    }

    // Find the most similar order using fuzzy matching
    let bestMatch = null;
    let highestSimilarity = 0;

    for (const existingOrder of existingOrders) {
      const similarity = this.calculateFuzzySimilarityScore(sheetOrder, existingOrder);
      if (similarity > highestSimilarity && similarity >= 0.8) {
        highestSimilarity = similarity;
        bestMatch = existingOrder;
      }
    }

    if (!bestMatch) {
      return null;
    }

    const conflictingFields = this.identifyConflictingFields(sheetOrder, bestMatch);

    return {
      isDuplicate: true,
      duplicateType: 'similar',
      existingOrder: {
        id: bestMatch.id,
        orderNumber: bestMatch.orderNumber,
        customerName: `${bestMatch.customer.firstName} ${bestMatch.customer.lastName}`,
        phone: bestMatch.customer.phone,
        orderDate: bestMatch.orderDate,
        total: Number(bestMatch.total),
        status: bestMatch.status,
      },
      similarity: highestSimilarity,
      conflictingFields,
    };
  }

  /**
   * Calculate similarity score between sheet order and existing order
   */
  private calculateSimilarityScore(sheetOrder: SheetOrder, existingOrder: any): number {
    let score = 0;
    let totalChecks = 0;

    // Phone number match (high weight)
    totalChecks += 3;
    if (existingOrder.customer.phone === sheetOrder.phone) {
      score += 3;
    }

    // Customer name match
    totalChecks += 2;
    const existingName = `${existingOrder.customer.firstName} ${existingOrder.customer.lastName}`.toLowerCase();
    const sheetName = sheetOrder.customerName.toLowerCase();
    if (existingName === sheetName) {
      score += 2;
    } else if (existingName.includes(sheetName.split(' ')[0]) || sheetName.includes(existingName.split(' ')[0])) {
      score += 1;
    }

    // Address match
    totalChecks += 2;
    if (existingOrder.shippingAddress?.toLowerCase() === sheetOrder.address.toLowerCase()) {
      score += 2;
    } else if (existingOrder.shippingAddress?.toLowerCase().includes(sheetOrder.address.toLowerCase().substring(0, 10))) {
      score += 1;
    }

    // Product match
    totalChecks += 2;
    const hasMatchingProduct = existingOrder.items.some(item =>
      item.product.name.toLowerCase() === sheetOrder.productName.toLowerCase() ||
      (sheetOrder.productSku && item.product.sku === sheetOrder.productSku)
    );
    if (hasMatchingProduct) {
      score += 2;
    }

    // Price match (if available)
    if (sheetOrder.price) {
      totalChecks += 1;
      const orderTotal = Number(existingOrder.total);
      const sheetPrice = Number(sheetOrder.price);
      if (Math.abs(orderTotal - sheetPrice) < 1) {
        score += 1;
      }
    }

    return totalChecks > 0 ? score / totalChecks : 0;
  }

  /**
   * Calculate fuzzy similarity score for potential duplicates
   */
  private calculateFuzzySimilarityScore(sheetOrder: SheetOrder, existingOrder: any): number {
    let score = 0;
    let totalChecks = 0;

    // Customer name similarity (fuzzy matching)
    totalChecks += 3;
    const existingName = `${existingOrder.customer.firstName} ${existingOrder.customer.lastName}`.toLowerCase();
    const sheetName = sheetOrder.customerName.toLowerCase();
    const nameSimilarity = this.calculateStringSimilarity(existingName, sheetName);
    score += nameSimilarity * 3;

    // Address similarity
    totalChecks += 2;
    const addressSimilarity = this.calculateStringSimilarity(
      existingOrder.shippingAddress?.toLowerCase() || '',
      sheetOrder.address.toLowerCase()
    );
    score += addressSimilarity * 2;

    // Product similarity
    totalChecks += 2;
    let productSimilarity = 0;
    for (const item of existingOrder.items) {
      const itemSimilarity = this.calculateStringSimilarity(
        item.product.name.toLowerCase(),
        sheetOrder.productName.toLowerCase()
      );
      productSimilarity = Math.max(productSimilarity, itemSimilarity);
    }
    score += productSimilarity * 2;

    return totalChecks > 0 ? score / totalChecks : 0;
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
            matrix[i - 1][j] + 1
          );
        }
      }
    }

    const maxLength = Math.max(str1.length, str2.length);
    return (maxLength - matrix[str2.length][str1.length]) / maxLength;
  }

  /**
   * Identify conflicting fields between sheet order and existing order
   */
  private identifyConflictingFields(sheetOrder: SheetOrder, existingOrder: any): string[] {
    const conflicts = [];

    // Check customer name
    const existingName = `${existingOrder.customer.firstName} ${existingOrder.customer.lastName}`;
    if (existingName.toLowerCase() !== sheetOrder.customerName.toLowerCase()) {
      conflicts.push('customerName');
    }

    // Check phone
    if (existingOrder.customer.phone !== sheetOrder.phone) {
      conflicts.push('phone');
    }

    // Check address
    if (existingOrder.shippingAddress?.toLowerCase() !== sheetOrder.address.toLowerCase()) {
      conflicts.push('address');
    }

    // Check product
    const hasMatchingProduct = existingOrder.items.some(item =>
      item.product.name.toLowerCase() === sheetOrder.productName.toLowerCase() ||
      (sheetOrder.productSku && item.product.sku === sheetOrder.productSku)
    );
    if (!hasMatchingProduct) {
      conflicts.push('product');
    }

    // Check price
    if (sheetOrder.price) {
      const orderTotal = Number(existingOrder.total);
      const sheetPrice = Number(sheetOrder.price);
      if (Math.abs(orderTotal - sheetPrice) >= 1) {
        conflicts.push('price');
      }
    }

    return conflicts;
  }

  /**
   * Handle duplicate order detection with enhanced resolution strategies
   */
  private async handleDuplicateOrder(
    duplicateResult: DuplicateDetectionResult,
    sheetOrder: SheetOrder,
  ): Promise<DuplicateResolution> {
    if (!duplicateResult.isDuplicate) {
      this.logger.debug('No duplicate found, proceeding with order creation', {
        phone: sheetOrder.phone,
        customerName: sheetOrder.customerName,
        orderDate: sheetOrder.date,
      });

      return {
        action: 'create',
        reason: 'No duplicate found',
        flagged: false,
      };
    }

    const existingOrder = duplicateResult.existingOrder!;
    const similarity = duplicateResult.similarity || 0;
    const conflictingFields = duplicateResult.conflictingFields || [];

    // Log duplicate detection for tracking
    await this.logDuplicateDetection(duplicateResult, sheetOrder);

    // Handle exact duplicates
    if (duplicateResult.duplicateType === 'exact' && similarity >= 0.95) {
      this.logger.warn('Exact duplicate detected, skipping order creation', {
        existingOrderId: existingOrder.id,
        existingOrderNumber: existingOrder.orderNumber,
        similarity,
        conflictingFields,
        sheetOrderPhone: sheetOrder.phone,
        sheetOrderCustomer: sheetOrder.customerName,
      });

      return {
        action: 'skip',
        reason: `Exact duplicate found: Order ${existingOrder.orderNumber} (${Math.round(similarity * 100)}% match)`,
        orderId: existingOrder.id,
        flagged: false,
      };
    }

    // Handle high similarity duplicates with flagging
    if (similarity >= 0.85) {
      this.logger.warn('High similarity duplicate detected, creating with flag', {
        existingOrderId: existingOrder.id,
        existingOrderNumber: existingOrder.orderNumber,
        similarity,
        conflictingFields,
        sheetOrderPhone: sheetOrder.phone,
        sheetOrderCustomer: sheetOrder.customerName,
      });

      return {
        action: 'create',
        reason: `High similarity duplicate found: Order ${existingOrder.orderNumber} (${Math.round(similarity * 100)}% match)`,
        flagged: true,
        notes: this.generateDuplicateNotes(duplicateResult, sheetOrder),
      };
    }

    // Handle moderate similarity duplicates
    if (similarity >= 0.7) {
      this.logger.log('Moderate similarity duplicate detected, creating with flag', {
        existingOrderId: existingOrder.id,
        existingOrderNumber: existingOrder.orderNumber,
        similarity,
        conflictingFields,
        sheetOrderPhone: sheetOrder.phone,
        sheetOrderCustomer: sheetOrder.customerName,
      });

      return {
        action: 'create',
        reason: `Potential duplicate found: Order ${existingOrder.orderNumber} (${Math.round(similarity * 100)}% match)`,
        flagged: true,
        notes: this.generateDuplicateNotes(duplicateResult, sheetOrder),
      };
    }

    // Low similarity - proceed normally but log for analysis
    this.logger.debug('Low similarity duplicate detected, proceeding with creation', {
      existingOrderId: existingOrder.id,
      existingOrderNumber: existingOrder.orderNumber,
      similarity,
      conflictingFields,
    });

    return {
      action: 'create',
      reason: `Low similarity match found: Order ${existingOrder.orderNumber} (${Math.round(similarity * 100)}% match)`,
      flagged: false,
    };
  }

  /**
   * Log duplicate detection for tracking and analysis
   */
  private async logDuplicateDetection(
    duplicateResult: DuplicateDetectionResult,
    sheetOrder: SheetOrder,
  ): Promise<void> {
    try {
      // This could be extended to store in a dedicated duplicate tracking table
      // For now, we'll use structured logging for analysis
      this.logger.warn('Duplicate order detection logged', {
        duplicateType: duplicateResult.duplicateType,
        similarity: duplicateResult.similarity,
        conflictingFields: duplicateResult.conflictingFields,
        existingOrder: {
          id: duplicateResult.existingOrder?.id,
          orderNumber: duplicateResult.existingOrder?.orderNumber,
          customerName: duplicateResult.existingOrder?.customerName,
          phone: duplicateResult.existingOrder?.phone,
          orderDate: duplicateResult.existingOrder?.orderDate,
          status: duplicateResult.existingOrder?.status,
        },
        sheetOrder: {
          customerName: sheetOrder.customerName,
          phone: sheetOrder.phone,
          address: sheetOrder.address,
          productName: sheetOrder.productName,
          productSku: sheetOrder.productSku,
          price: sheetOrder.price,
          date: sheetOrder.date,
          rowNumber: sheetOrder.rowNumber,
        },
        timestamp: new Date().toISOString(),
      });

      // TODO: In a future enhancement, we could store this in a dedicated table:
      // await this.prismaService.duplicateDetectionLog.create({
      //   data: {
      //     duplicateType: duplicateResult.duplicateType,
      //     similarity: duplicateResult.similarity,
      //     conflictingFields: duplicateResult.conflictingFields,
      //     existingOrderId: duplicateResult.existingOrder?.id,
      //     sheetOrderData: sheetOrder,
      //     detectedAt: new Date(),
      //   },
      // });
    } catch (error) {
      this.logger.error('Failed to log duplicate detection', {
        error: error.message,
        sheetOrderPhone: sheetOrder.phone,
        existingOrderId: duplicateResult.existingOrder?.id,
      });
    }
  }

  /**
   * Generate detailed notes for duplicate orders
   */
  private generateDuplicateNotes(
    duplicateResult: DuplicateDetectionResult,
    sheetOrder: SheetOrder,
  ): string {
    const existingOrder = duplicateResult.existingOrder!;
    const similarity = Math.round((duplicateResult.similarity || 0) * 100);
    const conflictingFields = duplicateResult.conflictingFields || [];

    let notes = `Potential duplicate of Order ${existingOrder.orderNumber} (${similarity}% similarity).\n`;
    notes += `Existing order: ${existingOrder.customerName} - ${existingOrder.phone} - ${existingOrder.orderDate.toDateString()}\n`;
    notes += `Sheet order: ${sheetOrder.customerName} - ${sheetOrder.phone} - ${sheetOrder.date}\n`;

    if (conflictingFields.length > 0) {
      notes += `Conflicting fields: ${conflictingFields.join(', ')}\n`;
    }

    notes += `Detection type: ${duplicateResult.duplicateType}\n`;
    notes += `Detected at: ${new Date().toISOString()}`;

    return notes;
  }

  /**
   * Generate unique order number
   */
  private async generateOrderNumber(organizationId: string): Promise<string> {
    const today = new Date();
    const datePrefix = today.toISOString().slice(0, 10).replace(/-/g, '');

    // Get count of orders created today
    const startOfDay = new Date(today);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(today);
    endOfDay.setHours(23, 59, 59, 999);

    const todayOrderCount = await this.prismaService.order.count({
      where: {
        organizationId,
        createdAt: {
          gte: startOfDay,
          lte: endOfDay,
        },
      },
    });

    const sequence = (todayOrderCount + 1).toString().padStart(4, '0');
    return `GS${datePrefix}${sequence}`;
  }

  /**
   * Update sync operation with results
   */
  private async updateSyncOperation(syncOperationId: string, result: SyncResult) {
    await this.prismaService.syncOperation.update({
      where: { id: syncOperationId },
      data: {
        status: result.success ? 'completed' : 'failed',
        ordersProcessed: result.ordersProcessed,
        ordersCreated: result.ordersCreated,
        ordersSkipped: result.ordersSkipped,
        errorCount: result.errors ? result.errors.length : 0,
        errorDetails: result.errors as any,
        completedAt: result.completedAt,
      },
    });
  }

  /**
   * Update sync operation progress
   */
  private async updateSyncOperationProgress(
    syncOperationId: string,
    ordersProcessed: number,
    ordersCreated: number,
    ordersSkipped: number,
    errorCount: number,
  ) {
    await this.prismaService.syncOperation.update({
      where: { id: syncOperationId },
      data: {
        status: 'processing',
        ordersProcessed,
        ordersCreated,
        ordersSkipped,
        errorCount,
      },
    });
  }

  /**
   * Update sync operation with error
   */
  private async updateSyncOperationError(syncOperationId: string, errorMessage: string) {
    await this.prismaService.syncOperation.update({
      where: { id: syncOperationId },
      data: {
        status: 'failed',
        errorDetails: [{
          rowNumber: 0,
          errorType: 'system',
          errorMessage,
          orderData: {},
        }],
        completedAt: new Date(),
      },
    });
  }

  /**
   * Update sheet with order creation results
   */
  private async updateSheetWithOrderIds(
    connectionId: string,
    spreadsheetId: string,
    createdOrders: Array<{ rowNumber: number; orderId: string }>,
  ) {
    if (createdOrders.length === 0) return;

    try {
      // Get spreadsheet connection and config
      const spreadsheetConnection = await this.prismaService.spreadsheetConnection.findFirst({
        where: {
          connectionId,
          spreadsheetId,
          isOrderSync: true,
        },
      });

      if (!spreadsheetConnection) {
        throw new NotFoundException('Order sync not enabled for this spreadsheet');
      }

      const config = spreadsheetConnection.orderSyncConfig as any;
      const accessToken = await this.googleSheetsService['oauth2Service'].getAccessToken(connectionId);

      // Highlight processed rows instead of writing order IDs
      if (createdOrders.length > 0) {
        await this.highlightProcessedRows(accessToken, spreadsheetId, config.sheetName, createdOrders);

        this.logger.log('Successfully highlighted processed orders in sheet', {
          connectionId,
          spreadsheetId,
          highlightedRows: createdOrders.length,
        });
      }
    } catch (error) {
      this.logger.error('Failed to update sheet with order IDs', {
        error: error.message,
        connectionId,
        spreadsheetId,
        updatesCount: createdOrders.length,
      });
      // Don't throw error here as the orders were created successfully
    }
  }

  /**
   * Categorize error type for better handling
   */
  private categorizeError(error: any): SyncError['errorType'] {
    const message = error.message?.toLowerCase() || '';

    if (message.includes('validation') || message.includes('invalid')) {
      return 'validation';
    }
    if (message.includes('duplicate')) {
      return 'duplicate';
    }
    if (message.includes('product') && message.includes('not found')) {
      return 'product_not_found';
    }
    if (message.includes('customer')) {
      return 'customer_creation';
    }

    return 'system';
  }

  /**
   * Get suggested fix for common errors
   */
  private getSuggestedFix(error: any): string | undefined {
    const message = error.message?.toLowerCase() || '';

    if (message.includes('phone')) {
      return 'Check phone number format (should be valid Morocco number)';
    }
    if (message.includes('product')) {
      return 'Verify product name and SKU are correct';
    }
    if (message.includes('price')) {
      return 'Ensure price is a valid number';
    }
    if (message.includes('date')) {
      return 'Check date format (should be YYYY-MM-DD or similar)';
    }

    return undefined;
  }

  /**
   * Get orders from sheet within specified row range
   */
  private async getOrdersFromSheet(
    connectionId: string,
    spreadsheetId: string,
    startRow?: number,
    endRow?: number,
  ): Promise<SheetOrder[]> {
    try {
      this.logger.log('Reading orders from sheet', {
        connectionId,
        spreadsheetId,
        startRow,
        endRow,
      });

      // Get spreadsheet connection and config
      const spreadsheetConnection = await this.prismaService.spreadsheetConnection.findFirst({
        where: {
          connectionId,
          spreadsheetId,
          isOrderSync: true,
        },
      });

      if (!spreadsheetConnection) {
        throw new NotFoundException('Order sync not enabled for this spreadsheet');
      }

      const config = spreadsheetConnection.orderSyncConfig as any;
      const accessToken = await this.googleSheetsService['oauth2Service'].getAccessToken(connectionId);

      // Determine the range to read
      const actualStartRow = startRow || config.dataStartRow;
      const actualEndRow = endRow || await this.getLastRowWithData(
        accessToken,
        spreadsheetId,
        config.sheetName,
      );

      if (actualStartRow > actualEndRow) {
        this.logger.log('No data rows to process', {
          startRow: actualStartRow,
          endRow: actualEndRow,
        });
        return [];
      }

      // Build the range string
      const range = `${config.sheetName}!A${actualStartRow}:Z${actualEndRow}`;

      // Read the data from the sheet
      const values = await this.googleSheetsService.getSpreadsheetValues(
        accessToken,
        spreadsheetId,
        range,
        'FORMATTED_VALUE',
      );

      if (!values || values.length === 0) {
        this.logger.log('No data found in specified range', { range });
        return [];
      }

      // Convert sheet rows to SheetOrder objects
      const orders: SheetOrder[] = [];
      for (let i = 0; i < values.length; i++) {
        const rowNumber = actualStartRow + i;
        const row = values[i];

        try {
          const order = this.parseSheetRow(row, rowNumber, config);
          if (order) {
            orders.push(order);
          }
        } catch (parseError) {
          this.logger.warn('Failed to parse sheet row', {
            rowNumber,
            error: parseError.message,
            rowData: row,
          });
          // Continue processing other rows
        }
      }

      this.logger.log('Successfully read orders from sheet', {
        connectionId,
        spreadsheetId,
        totalRows: values.length,
        validOrders: orders.length,
        range,
      });

      return orders;
    } catch (error) {
      this.logger.error('Failed to read orders from sheet', {
        error: error.message,
        connectionId,
        spreadsheetId,
        startRow,
        endRow,
      });

      // Handle specific Google Sheets API errors
      if (error.message.includes('quota')) {
        throw new BadRequestException('Google Sheets API quota exceeded. Please try again later.');
      }
      if (error.message.includes('rate limit')) {
        throw new BadRequestException('Rate limit exceeded. Please wait before trying again.');
      }
      if (error.message.includes('403')) {
        throw new BadRequestException('Permission denied. Please check spreadsheet access.');
      }

      throw error;
    }
  }

  /**
   * Get the last row with data in the sheet
   */
  private async getLastRowWithData(
    accessToken: string,
    spreadsheetId: string,
    sheetName: string,
  ): Promise<number> {
    try {
      // Get a large range to find the last row with data
      const range = `${sheetName}!A:A`;
      const values = await this.googleSheetsService.getSpreadsheetValues(
        accessToken,
        spreadsheetId,
        range,
        'FORMATTED_VALUE',
      );

      if (!values || values.length === 0) {
        return 1; // Return 1 if no data found
      }

      // Find the last non-empty row
      for (let i = values.length - 1; i >= 0; i--) {
        if (values[i] && values[i][0] && values[i][0].toString().trim()) {
          return i + 1; // Convert to 1-based indexing
        }
      }

      return 1; // Return 1 if no data found
    } catch (error) {
      this.logger.warn('Failed to get last row with data, using default', {
        error: error.message,
        sheetName,
      });
      return 100; // Default fallback
    }
  }

  /**
   * Parse a sheet row into a SheetOrder object
   */
  private parseSheetRow(row: any[], rowNumber: number, config: any): SheetOrder | null {
    try {
      // Validate inputs
      if (!row || !Array.isArray(row)) {
        this.logger.warn('Invalid row data', { rowNumber, row });
        return null;
      }

      if (!config || !config.columnMapping) {
        this.logger.error('Missing column mapping configuration', { rowNumber, config });
        return null;
      }

      // Helper function to get cell value by column letter
      const getCellValue = (columnLetter: string): string => {
        if (!columnLetter) return '';
        try {
          const columnIndex = this.columnLetterToIndex(columnLetter);
          return row[columnIndex]?.toString()?.trim() || '';
        } catch (error) {
          this.logger.warn('Failed to get cell value', { columnLetter, error: error.message });
          return '';
        }
      };

      // Log configuration for debugging
      this.logger.debug('Parsing row with config', {
        rowNumber,
        columnMapping: config.columnMapping,
        rowData: row,
      });

      // Extract data based on column mapping
      const customerName = getCellValue(config.columnMapping.customerName);
      const phone = getCellValue(config.columnMapping.phone);
      const productName = getCellValue(config.columnMapping.productName);
      const priceStr = getCellValue(config.columnMapping.price);

      // Skip empty rows
      if (!customerName && !phone && !productName) {
        return null;
      }

      // Parse numeric values
      const price = parseFloat(priceStr.replace(/[^\d.-]/g, '')) || 0;
      const quantity = parseInt(getCellValue(config.columnMapping.productQuantity) || '1') || 1;

      const sheetOrder: SheetOrder = {
        rowNumber,
        orderId: getCellValue(config.columnMapping.orderId),
        date: getCellValue(config.columnMapping.date) || new Date().toISOString().split('T')[0],
        customerName,
        phone,
        alternatePhone: getCellValue(config.columnMapping.alternatePhone),
        email: getCellValue(config.columnMapping.email),
        address: getCellValue(config.columnMapping.address),
        city: getCellValue(config.columnMapping.city),
        postalCode: getCellValue(config.columnMapping.postalCode),
        productName,
        productSku: getCellValue(config.columnMapping.productSku),
        productQuantity: quantity,
        productVariant: getCellValue(config.columnMapping.productVariant),
        price,
        pageUrl: getCellValue(config.columnMapping.pageUrl),
        notes: getCellValue(config.columnMapping.notes),
        status: getCellValue(config.columnMapping.status),
        errorMessage: getCellValue(config.columnMapping.errorMessage),
      };

      return sheetOrder;
    } catch (error) {
      this.logger.error('Failed to parse sheet row', {
        error: error.message,
        rowNumber,
        row,
      });
      return null;
    }
  }

  /**
   * Convert column letter to index (A=0, B=1, etc.)
   */
  private columnLetterToIndex(letter: string): number {
    if (!letter || typeof letter !== 'string') {
      throw new Error(`Invalid column letter: ${letter}`);
    }
    
    let result = 0;
    const upperLetter = letter.toUpperCase();
    for (let i = 0; i < upperLetter.length; i++) {
      result = result * 26 + (upperLetter.charCodeAt(i) - 'A'.charCodeAt(0) + 1);
    }
    return result - 1;
  }



  /**
   * Highlight processed rows with a subtle background color
   */
  private async highlightProcessedRows(
    accessToken: string,
    spreadsheetId: string,
    sheetName: string,
    createdOrders: Array<{ rowNumber: number; orderId: string }>,
    retryCount = 0,
  ): Promise<void> {
    try {
      // Get sheet ID first
      const spreadsheet = await this.googleSheetsService.getSpreadsheet(accessToken, spreadsheetId);
      const sheet = spreadsheet.sheets.find(s => s.properties.title === sheetName);
      
      if (!sheet) {
        this.logger.warn('Sheet not found for highlighting', { sheetName, spreadsheetId });
        return;
      }

      const sheetId = sheet.properties.sheetId;

      // Get the actual column count from the sheet
      const columnCount = sheet.properties.gridProperties.columnCount;
      const highlightColumns = Math.min(columnCount, 15); // Don't exceed actual columns

      // Create formatting requests for each processed row
      const requests = createdOrders.map(order => ({
        updateCells: {
          range: {
            sheetId: sheetId,
            startRowIndex: order.rowNumber - 1, // Convert to 0-based index
            endRowIndex: order.rowNumber,
            startColumnIndex: 0,
            endColumnIndex: highlightColumns, // Use actual column count
          },
          rows: [{
            values: Array(highlightColumns).fill({
              userEnteredFormat: {
                backgroundColor: {
                  red: 0.9,   // Light green background
                  green: 1.0,
                  blue: 0.9,
                  alpha: 1.0,
                },
              },
            }),
          }],
          fields: 'userEnteredFormat.backgroundColor',
        },
      }));

      // Execute batch formatting update
      await this.googleSheetsService.batchUpdateSpreadsheet(
        accessToken,
        spreadsheetId,
        requests,
      );

      this.logger.log('Successfully highlighted processed rows', {
        spreadsheetId,
        sheetName,
        rowsHighlighted: createdOrders.length,
      });
    } catch (error) {
      if (retryCount < 3 && (error.message.includes('rate limit') || error.message.includes('quota'))) {
        const delay = Math.pow(2, retryCount) * 1000; // Exponential backoff
        this.logger.warn(`Row highlighting failed, retrying in ${delay}ms`, {
          error: error.message,
          retryCount,
        });
        await new Promise(resolve => setTimeout(resolve, delay));
        return this.highlightProcessedRows(accessToken, spreadsheetId, sheetName, createdOrders, retryCount + 1);
      }
      
      this.logger.error('Failed to highlight processed rows', {
        error: error.message,
        spreadsheetId,
        sheetName,
        rowsCount: createdOrders.length,
      });
      // Don't throw error as this is just visual feedback
    }
  }

  /**
   * Set up automatic webhook for a spreadsheet
   */
  async setupAutoSync(
    connectionId: string,
    spreadsheetId: string,
  ): Promise<{ success: boolean; webhookId?: string }> {
    try {
      // Check if webhook already exists
      const existingWebhook = await this.prismaService.webhookSubscription.findFirst({
        where: {
          connectionId,
          spreadsheetId,
          isActive: true,
        },
      });

      if (existingWebhook) {
        this.logger.log('Webhook already exists for spreadsheet', {
          connectionId,
          spreadsheetId,
          webhookId: existingWebhook.id,
        });
        return { success: true, webhookId: existingWebhook.id };
      }

      // Get access token
      const accessToken = await this.googleSheetsService['oauth2Service'].getAccessToken(connectionId);

      // Set up webhook with Google Drive API
      const webhookUrl = `${process.env.API_BASE_URL || 'http://localhost:3001'}/api/webhooks/google-drive`;
      
      const webhookResponse = await this.googleSheetsService.setupWebhook(
        accessToken,
        spreadsheetId,
        webhookUrl,
      );

      // Store webhook subscription in database
      const webhookSubscription = await this.prismaService.webhookSubscription.create({
        data: {
          connectionId,
          spreadsheetId,
          subscriptionId: webhookResponse.id,
          resourceId: webhookResponse.resourceId,
          expiration: webhookResponse.expiration ? new Date(parseInt(webhookResponse.expiration)) : null,
          isActive: true,
        },
      });

      this.logger.log('Successfully set up auto-sync webhook', {
        connectionId,
        spreadsheetId,
        webhookId: webhookSubscription.id,
        subscriptionId: webhookResponse.id,
        resourceId: webhookResponse.resourceId,
      });

      return { success: true, webhookId: webhookSubscription.id };
    } catch (error) {
      this.logger.error('Failed to set up auto-sync webhook', {
        error: error.message,
        connectionId,
        spreadsheetId,
      });
      return { success: false };
    }
  }

  /**
   * Remove automatic webhook for a spreadsheet
   */
  async removeAutoSync(
    connectionId: string,
    spreadsheetId: string,
  ): Promise<{ success: boolean }> {
    try {
      // Find active webhook
      const webhook = await this.prismaService.webhookSubscription.findFirst({
        where: {
          connectionId,
          spreadsheetId,
          isActive: true,
        },
      });

      if (!webhook) {
        this.logger.log('No active webhook found to remove', {
          connectionId,
          spreadsheetId,
        });
        return { success: true };
      }

      // Get access token
      const accessToken = await this.googleSheetsService['oauth2Service'].getAccessToken(connectionId);

      // Remove webhook from Google Drive
      await this.googleSheetsService.removeWebhook(
        accessToken,
        webhook.subscriptionId,
        webhook.resourceId,
      );

      // Deactivate webhook in database
      await this.prismaService.webhookSubscription.update({
        where: { id: webhook.id },
        data: { isActive: false },
      });

      this.logger.log('Successfully removed auto-sync webhook', {
        connectionId,
        spreadsheetId,
        webhookId: webhook.id,
      });

      return { success: true };
    } catch (error) {
      this.logger.error('Failed to remove auto-sync webhook', {
        error: error.message,
        connectionId,
        spreadsheetId,
      });
      return { success: false };
    }
  }
}