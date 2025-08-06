-- Migration: Enable multiple Google Sheets accounts per user
-- This migration removes the unique constraint that prevents multiple Google accounts
-- and adds support for multi-account connections

-- Step 1: Add google_email to platformData for existing Google Sheets connections
-- This ensures we can identify different Google accounts
UPDATE "PlatformConnection" 
SET "platformData" = jsonb_set(
  COALESCE("platformData", '{}'),
  '{google_email}',
  '"unknown@example.com"'
)
WHERE "platformType" = 'GOOGLE_SHEETS' 
  AND ("platformData" IS NULL OR "platformData"->>'google_email' IS NULL);

-- Step 2: Update platformName to include email for existing connections
UPDATE "PlatformConnection" 
SET "platformName" = 'Google Sheets - ' || COALESCE("platformData"->>'google_email', 'Unknown Account')
WHERE "platformType" = 'GOOGLE_SHEETS' 
  AND "platformName" = 'Google Sheets';

-- Step 3: Drop the existing unique constraint
ALTER TABLE "PlatformConnection" 
DROP CONSTRAINT IF EXISTS "PlatformConnection_userId_platformType_platformStoreId_key";

-- Step 4: Create new unique constraint that allows multiple Google accounts
-- For Google Sheets, we use the google_email to differentiate accounts
-- For other platforms, we keep the original constraint behavior
CREATE UNIQUE INDEX "PlatformConnection_unique_per_account" 
ON "PlatformConnection" (
  "userId", 
  "platformType", 
  COALESCE("platformStoreId", ''), 
  COALESCE("platformData"->>'google_email', '')
) 
WHERE "platformType" != 'GOOGLE_SHEETS';

-- For Google Sheets specifically, create a constraint based on google_email
CREATE UNIQUE INDEX "PlatformConnection_google_sheets_unique" 
ON "PlatformConnection" (
  "userId", 
  "platformType", 
  ("platformData"->>'google_email')
) 
WHERE "platformType" = 'GOOGLE_SHEETS';

-- Step 5: Create index for better performance on Google email lookups
CREATE INDEX "idx_platform_connections_google_email" 
ON "PlatformConnection" USING GIN (("platformData"->>'google_email'))
WHERE "platformType" = 'GOOGLE_SHEETS';

-- Step 6: Migrate existing single-spreadsheet connections to new format
-- Add connected_spreadsheet data to platformData if it doesn't exist
UPDATE "PlatformConnection" 
SET "platformData" = jsonb_set(
  COALESCE("platformData", '{}'),
  '{connected_spreadsheets_count}',
  '0'
)
WHERE "platformType" = 'GOOGLE_SHEETS' 
  AND ("platformData" IS NULL OR "platformData"->>'connected_spreadsheets_count' IS NULL);

-- Step 7: Create SpreadsheetConnection records for existing connections that have spreadsheet data
INSERT INTO "SpreadsheetConnection" (
  "id",
  "connectionId",
  "spreadsheetId",
  "spreadsheetName",
  "webViewLink",
  "connectedAt",
  "sheetsData",
  "isActive",
  "createdAt",
  "updatedAt"
)
SELECT 
  'sc_' || "id" as "id",
  "id" as "connectionId",
  "platformData"->>'connected_spreadsheet'->>'id' as "spreadsheetId",
  "platformData"->>'connected_spreadsheet'->>'name' as "spreadsheetName",
  'https://docs.google.com/spreadsheets/d/' || ("platformData"->>'connected_spreadsheet'->>'id') as "webViewLink",
  COALESCE(
    ("platformData"->>'connected_spreadsheet'->>'connected_at')::timestamp,
    "createdAt"
  ) as "connectedAt",
  "platformData"->>'connected_spreadsheet'->'sheets' as "sheetsData",
  true as "isActive",
  "createdAt",
  "updatedAt"
FROM "PlatformConnection"
WHERE "platformType" = 'GOOGLE_SHEETS'
  AND "platformData" IS NOT NULL
  AND "platformData"->>'connected_spreadsheet' IS NOT NULL
  AND "platformData"->>'connected_spreadsheet'->>'id' IS NOT NULL
ON CONFLICT ("connectionId", "spreadsheetId") DO NOTHING;

-- Step 8: Update connected_spreadsheets_count for migrated connections
UPDATE "PlatformConnection" 
SET "platformData" = jsonb_set(
  "platformData",
  '{connected_spreadsheets_count}',
  (
    SELECT COUNT(*)::text::jsonb 
    FROM "SpreadsheetConnection" 
    WHERE "connectionId" = "PlatformConnection"."id" 
      AND "isActive" = true
  )
)
WHERE "platformType" = 'GOOGLE_SHEETS';

-- Step 9: Add last_token_refresh timestamp for existing connections
UPDATE "PlatformConnection" 
SET "platformData" = jsonb_set(
  COALESCE("platformData", '{}'),
  '{last_token_refresh}',
  to_jsonb(COALESCE("lastSyncAt", "createdAt"))
)
WHERE "platformType" = 'GOOGLE_SHEETS' 
  AND ("platformData" IS NULL OR "platformData"->>'last_token_refresh' IS NULL);