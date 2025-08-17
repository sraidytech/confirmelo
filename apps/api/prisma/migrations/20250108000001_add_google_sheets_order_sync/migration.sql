-- Add order sync support to existing SpreadsheetConnection table
ALTER TABLE "SpreadsheetConnection" ADD COLUMN "isOrderSync" BOOLEAN DEFAULT false;
ALTER TABLE "SpreadsheetConnection" ADD COLUMN "orderSyncConfig" JSONB;
ALTER TABLE "SpreadsheetConnection" ADD COLUMN "lastSyncRow" INTEGER DEFAULT 1;
ALTER TABLE "SpreadsheetConnection" ADD COLUMN "webhookSubscriptionId" VARCHAR(255);

-- Create WebhookSubscription table for managing Google Sheets webhooks
CREATE TABLE "WebhookSubscription" (
  "id" TEXT PRIMARY KEY,
  "connectionId" TEXT NOT NULL,
  "spreadsheetId" TEXT NOT NULL,
  "subscriptionId" TEXT NOT NULL,
  "resourceId" TEXT NOT NULL,
  "expiration" TIMESTAMP,
  "isActive" BOOLEAN DEFAULT true,
  "createdAt" TIMESTAMP DEFAULT now(),
  "updatedAt" TIMESTAMP DEFAULT now(),
  FOREIGN KEY ("connectionId") REFERENCES "PlatformConnection"("id") ON DELETE CASCADE
);

-- Create SyncOperation table for tracking sync operations
CREATE TABLE "SyncOperation" (
  "id" TEXT PRIMARY KEY,
  "connectionId" TEXT NOT NULL,
  "spreadsheetId" TEXT NOT NULL,
  "operationType" TEXT NOT NULL, -- 'webhook', 'manual', 'polling'
  "status" TEXT NOT NULL, -- 'pending', 'processing', 'completed', 'failed'
  "ordersProcessed" INTEGER DEFAULT 0,
  "ordersCreated" INTEGER DEFAULT 0,
  "ordersSkipped" INTEGER DEFAULT 0,
  "errorCount" INTEGER DEFAULT 0,
  "errorDetails" JSONB,
  "startedAt" TIMESTAMP DEFAULT now(),
  "completedAt" TIMESTAMP,
  "createdAt" TIMESTAMP DEFAULT now(),
  FOREIGN KEY ("connectionId") REFERENCES "PlatformConnection"("id") ON DELETE CASCADE
);

-- Extend Order table to track sheet source
ALTER TABLE "Order" ADD COLUMN "sheetRowNumber" INTEGER;
ALTER TABLE "Order" ADD COLUMN "sheetSpreadsheetId" TEXT;

-- Create indexes for performance
CREATE INDEX "WebhookSubscription_connectionId_idx" ON "WebhookSubscription"("connectionId");
CREATE INDEX "WebhookSubscription_spreadsheetId_idx" ON "WebhookSubscription"("spreadsheetId");
CREATE INDEX "WebhookSubscription_subscriptionId_idx" ON "WebhookSubscription"("subscriptionId");
CREATE INDEX "WebhookSubscription_isActive_idx" ON "WebhookSubscription"("isActive");

CREATE INDEX "SyncOperation_connectionId_idx" ON "SyncOperation"("connectionId");
CREATE INDEX "SyncOperation_spreadsheetId_idx" ON "SyncOperation"("spreadsheetId");
CREATE INDEX "SyncOperation_status_idx" ON "SyncOperation"("status");
CREATE INDEX "SyncOperation_operationType_idx" ON "SyncOperation"("operationType");
CREATE INDEX "SyncOperation_startedAt_idx" ON "SyncOperation"("startedAt");

CREATE INDEX "Order_sheetSpreadsheetId_idx" ON "Order"("sheetSpreadsheetId");
CREATE INDEX "Order_sheetRowNumber_idx" ON "Order"("sheetRowNumber");

-- Create composite indexes for efficient duplicate detection
CREATE INDEX "Order_customerId_orderDate_organizationId_idx" ON "Order"("customerId", "orderDate", "organizationId");
CREATE INDEX "Order_sheetSpreadsheetId_sheetRowNumber_idx" ON "Order"("sheetSpreadsheetId", "sheetRowNumber");