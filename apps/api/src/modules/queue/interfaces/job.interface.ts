export interface OrderSyncJobData {
  connectionId: string;
  sheetId?: string;
  triggeredBy: 'webhook' | 'manual' | 'polling';
  webhookNotificationId?: string;
  userId: string;
  organizationId: string;
}

export interface WebhookRenewalJobData {
  connectionId: string;
  subscriptionId: string;
  userId: string;
  organizationId: string;
}

export interface SyncRetryJobData {
  originalJobId: string;
  connectionId: string;
  sheetId?: string;
  retryCount: number;
  lastError: string;
  userId: string;
  organizationId: string;
}

export interface PollingJobData {
  connectionId: string;
  userId: string;
  organizationId: string;
}

export interface JobProgress {
  percentage: number;
  message: string;
  details?: any;
}

export interface JobResult {
  success: boolean;
  message: string;
  data?: any;
  errors?: string[];
  processedCount?: number;
  skippedCount?: number;
  errorCount?: number;
}