-- Migration script to convert existing Google Sheets connections to new multi-spreadsheet format

-- Step 1: Update existing Google Sheets connections with proper Google account information
UPDATE "PlatformConnection" 
SET "platformData" = COALESCE("platformData", '{}'::jsonb) || jsonb_build_object(
    'google_email', COALESCE("platformData"->>'google_email', 'unknown@gmail.com'),
    'google_user_id', COALESCE("platformData"->>'google_user_id', 'unknown'),
    'google_name', COALESCE("platformData"->>'google_name', 'Unknown User'),
    'api_version', 'v4',
    'connected_at', COALESCE("platformData"->>'connected_at', NOW()::text)
)
WHERE "platformType" = 'GOOGLE_SHEETS';

-- Step 2: Update platform names to include Google account email for better identification
UPDATE "PlatformConnection" 
SET "platformName" = 'Google Sheets - ' || COALESCE("platformData"->>'google_email', 'Unknown Account')
WHERE "platformType" = 'GOOGLE_SHEETS' 
AND "platformName" = 'GOOGLE_SHEETS Connection';

-- Step 3: Migrate existing connected spreadsheet data to the new SpreadsheetConnection table
INSERT INTO "SpreadsheetConnection" (
    "id",
    "connectionId",
    "spreadsheetId", 
    "spreadsheetName",
    "webViewLink",
    "connectedAt",
    "lastAccessedAt",
    "isActive",
    "sheetsData",
    "permissions",
    "lastSyncAt",
    "syncCount",
    "createdAt",
    "updatedAt"
)
SELECT 
    'sc_' || substr(md5(random()::text), 1, 25) as id,
    pc.id as "connectionId",
    (pc."platformData"->'connected_spreadsheet'->>'id') as "spreadsheetId",
    (pc."platformData"->'connected_spreadsheet'->>'name') as "spreadsheetName",
    'https://docs.google.com/spreadsheets/d/' || (pc."platformData"->'connected_spreadsheet'->>'id') as "webViewLink",
    COALESCE(
        (pc."platformData"->'connected_spreadsheet'->>'connected_at')::timestamp,
        pc."createdAt"
    ) as "connectedAt",
    pc."lastSyncAt" as "lastAccessedAt",
    true as "isActive",
    pc."platformData"->'connected_spreadsheet'->'sheets' as "sheetsData",
    jsonb_build_object(
        'canEdit', true,
        'canShare', false,
        'canComment', true,
        'role', 'editor'
    ) as "permissions",
    pc."lastSyncAt",
    pc."syncCount",
    pc."createdAt",
    pc."updatedAt"
FROM "PlatformConnection" pc
WHERE pc."platformType" = 'GOOGLE_SHEETS'
AND pc."platformData" ? 'connected_spreadsheet'
AND pc."platformData"->'connected_spreadsheet' ? 'id'
AND pc."platformData"->'connected_spreadsheet'->>'id' IS NOT NULL
AND pc."platformData"->'connected_spreadsheet'->>'id' != '';

-- Step 4: Clean up the old connected_spreadsheet data from platformData
UPDATE "PlatformConnection" 
SET "platformData" = "platformData" - 'connected_spreadsheet'
WHERE "platformType" = 'GOOGLE_SHEETS'
AND "platformData" ? 'connected_spreadsheet';

-- Step 5: Add connected_spreadsheets_count to platformData for performance
UPDATE "PlatformConnection" 
SET "platformData" = "platformData" || jsonb_build_object(
    'connected_spreadsheets_count', (
        SELECT COUNT(*)::int 
        FROM "SpreadsheetConnection" sc 
        WHERE sc."connectionId" = "PlatformConnection".id 
        AND sc."isActive" = true
    )
)
WHERE "platformType" = 'GOOGLE_SHEETS';