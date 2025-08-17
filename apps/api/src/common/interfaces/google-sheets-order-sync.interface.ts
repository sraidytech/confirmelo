import { Currency, OrderStatus } from '@prisma/client';

/**
 * Represents an order row from a Google Sheet
 */
export interface SheetOrder {
  rowNumber: number;
  orderId?: string;
  date: string;
  customerName: string;
  phone: string;
  alternatePhone?: string;
  email?: string;
  address: string;
  city: string;
  postalCode?: string;
  productName: string;
  productSku?: string;
  productQuantity: number;
  productVariant?: string;
  price: number;
  pageUrl?: string;
  notes?: string;
  status?: string;
  errorMessage?: string;
}

/**
 * Information about an order sheet
 */
export interface OrderSheetInfo {
  spreadsheetId: string;
  spreadsheetName: string;
  webViewLink: string;
  connectionId: string;
  isOrderSyncEnabled: boolean;
  webhookSubscriptionId?: string;
  lastSyncAt?: Date;
  lastSyncRow: number;
  totalOrders: number;
  orderSyncConfig?: OrderSyncConfig;
}

/**
 * Configuration for order sync
 */
export interface OrderSyncConfig {
  columnMapping: {
    orderId: string;
    date: string;
    customerName: string;
    phone: string;
    alternatePhone?: string;
    email?: string;
    address: string;
    city: string;
    postalCode?: string;
    productName: string;
    productSku?: string;
    productQuantity: string;
    productVariant?: string;
    price: string;
    pageUrl?: string;
    notes?: string;
    status?: string;
    errorMessage?: string;
  };
  headerRow: number;
  dataStartRow: number;
  sheetName: string;
  autoSync: boolean;
  duplicateHandling: 'skip' | 'flag' | 'create';
  validationRules: {
    requirePhone: boolean;
    requireProduct: boolean;
    requirePrice: boolean;
    phoneFormat: 'morocco' | 'international' | 'any';
    priceValidation: boolean;
  };
}

/**
 * Result of a sync operation
 */
export interface SyncResult {
  success: boolean;
  operationId: string;
  ordersProcessed: number;
  ordersCreated: number;
  ordersSkipped: number;
  errors: SyncError[];
  duration: number;
  startedAt: Date;
  completedAt?: Date;
}

/**
 * Sync error details
 */
export interface SyncError {
  rowNumber: number;
  errorType: 'validation' | 'duplicate' | 'system' | 'product_not_found' | 'customer_creation';
  errorMessage: string;
  orderData: Partial<SheetOrder>;
  field?: string;
  suggestedFix?: string;
}

/**
 * Webhook subscription details
 */
export interface WebhookSubscription {
  id: string;
  connectionId: string;
  spreadsheetId: string;
  subscriptionId: string;
  resourceId: string;
  expiration?: Date;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Sync operation tracking
 */
export interface SyncOperation {
  id: string;
  connectionId: string;
  spreadsheetId: string;
  operationType: 'webhook' | 'manual' | 'polling';
  status: 'pending' | 'processing' | 'completed' | 'failed';
  ordersProcessed: number;
  ordersCreated: number;
  ordersSkipped: number;
  errorCount: number;
  errorDetails?: SyncError[];
  startedAt: Date;
  completedAt?: Date;
}

/**
 * Order update for writing back to sheet
 */
export interface OrderUpdate {
  rowNumber: number;
  orderId: string;
  status: OrderStatus;
  importTimestamp: Date;
  errorMessage?: string;
}

/**
 * Validation result
 */
export interface ValidationResult {
  isValid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
}

/**
 * Validation error
 */
export interface ValidationError {
  field: string;
  message: string;
  code: string;
  value?: any;
  suggestedFix?: string;
}

/**
 * Validation warning
 */
export interface ValidationWarning {
  field: string;
  message: string;
  code: string;
  value?: any;
  suggestion?: string;
}

/**
 * Product validation result
 */
export interface ProductValidationResult extends ValidationResult {
  product?: {
    id: string;
    name: string;
    sku?: string;
    price: number;
    currency: Currency;
  };
  suggestions?: Array<{
    id: string;
    name: string;
    sku?: string;
    similarity: number;
  }>;
}

/**
 * Duplicate detection result
 */
export interface DuplicateDetectionResult {
  isDuplicate: boolean;
  duplicateType: 'exact' | 'similar' | 'none';
  existingOrder?: {
    id: string;
    orderNumber: string;
    customerName: string;
    phone: string;
    orderDate: Date;
    total: number;
    status: OrderStatus;
  };
  similarity?: number;
  conflictingFields?: string[];
}

/**
 * Duplicate resolution action
 */
export interface DuplicateResolution {
  action: 'skip' | 'create' | 'flag' | 'merge';
  reason: string;
  orderId?: string;
  flagged: boolean;
  notes?: string;
}

/**
 * Sync status information
 */
export interface SyncStatus {
  connectionId: string;
  spreadsheetId: string;
  isEnabled: boolean;
  lastSyncAt?: Date;
  lastSyncResult?: 'success' | 'partial' | 'failed';
  nextSyncAt?: Date;
  totalSyncs: number;
  totalOrdersCreated: number;
  totalOrdersSkipped: number;
  totalErrors: number;
  recentErrors: SyncError[];
  webhookStatus: 'active' | 'expired' | 'failed' | 'none';
  webhookExpiration?: Date;
}

/**
 * Sync history entry
 */
export interface SyncHistory {
  operationId: string;
  operationType: 'webhook' | 'manual' | 'polling';
  startedAt: Date;
  completedAt?: Date;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  ordersProcessed: number;
  ordersCreated: number;
  ordersSkipped: number;
  errorCount: number;
  duration?: number;
  triggeredBy?: string;
}

/**
 * Google Sheets webhook notification payload
 */
export interface GoogleSheetsWebhookNotification {
  kind: string;
  id: string;
  resourceId: string;
  resourceUri: string;
  resourceState: 'sync' | 'exists' | 'not_exists' | 'update';
  eventType: string;
  eventTime: string;
  token?: string;
  expiration?: string;
  changed?: string;
}

/**
 * Sheet order address information
 */
export interface SheetOrderAddress {
  address: string;
  city: string;
  postalCode?: string;
  country?: string;
}

/**
 * Order creation context
 */
export interface OrderCreationContext {
  organizationId: string;
  storeId: string;
  source: 'GOOGLE_SHEETS';
  importedAt: Date;
  sheetSpreadsheetId: string;
  sheetRowNumber: number;
  connectionId: string;
  syncOperationId: string;
}

/**
 * Batch processing options
 */
export interface BatchProcessingOptions {
  batchSize: number;
  maxConcurrency: number;
  retryAttempts: number;
  retryDelay: number;
  stopOnError: boolean;
  validateBeforeProcessing: boolean;
}

/**
 * Error recovery options
 */
export interface ErrorRecoveryOptions {
  maxRetries: number;
  retryDelay: number;
  exponentialBackoff: boolean;
  retryableErrors: string[];
  escalationThreshold: number;
}