-- Check Migration Results for Google Sheets Multi-Account Support
-- This script helps diagnose issues with multiple Google Sheets connections

-- 1. Check all Google Sheets platform connections
SELECT 
    'Platform Connections' as table_name,
    id,
    "userId",
    "platformType",
    "platformName",
    status,
    "platformData"->>'google_email' as google_email,
    "platformData"->>'connected_spreadsheets_count' as connected_count,
    "createdAt",
    "updatedAt"
FROM "PlatformConnection" 
WHERE "platformType" = 'GOOGLE_SHEETS'
ORDER BY "createdAt" DESC;

-- 2. Check spreadsheet connections
SELECT 
    'Spreadsheet Connections' as table_name,
    sc.id,
    sc."connectionId",
    sc."spreadsheetId",
    sc."spreadsheetName",
    sc."isActive",
    sc."connectedAt",
    pc."platformName",
    pc."platformData"->>'google_email' as google_email
FROM "SpreadsheetConnection" sc
JOIN "PlatformConnection" pc ON sc."connectionId" = pc.id
WHERE pc."platformType" = 'GOOGLE_SHEETS'
ORDER BY sc."connectedAt" DESC;

-- 3. Check for connections without spreadsheets
SELECT 
    'Connections Without Spreadsheets' as table_name,
    pc.id,
    pc."platformName",
    pc."platformData"->>'google_email' as google_email,
    pc.status,
    COUNT(sc.id) as spreadsheet_count
FROM "PlatformConnection" pc
LEFT JOIN "SpreadsheetConnection" sc ON pc.id = sc."connectionId" AND sc."isActive" = true
WHERE pc."platformType" = 'GOOGLE_SHEETS'
GROUP BY pc.id, pc."platformName", pc."platformData"->>'google_email', pc.status
HAVING COUNT(sc.id) = 0;

-- 4. Check for duplicate connections (same user, same email)
SELECT 
    'Potential Duplicates' as table_name,
    "userId",
    "platformData"->>'google_email' as google_email,
    COUNT(*) as connection_count,
    array_agg(id) as connection_ids,
    array_agg("platformName") as platform_names
FROM "PlatformConnection" 
WHERE "platformType" = 'GOOGLE_SHEETS'
GROUP BY "userId", "platformData"->>'google_email'
HAVING COUNT(*) > 1;

-- 5. Check unique constraints
SELECT 
    'Unique Constraints' as table_name,
    conname as constraint_name,
    pg_get_constraintdef(oid) as constraint_definition
FROM pg_constraint 
WHERE conrelid = 'PlatformConnection'::regclass
  AND contype = 'u';

-- 6. Check indexes related to Google Sheets
SELECT 
    'Indexes' as table_name,
    indexname,
    indexdef
FROM pg_indexes 
WHERE tablename = 'PlatformConnection' 
  AND (indexname LIKE '%google%' OR indexdef LIKE '%google_email%');

-- 7. Check platform data structure
SELECT 
    'Platform Data Structure' as table_name,
    id,
    "platformName",
    jsonb_pretty("platformData") as platform_data_formatted
FROM "PlatformConnection" 
WHERE "platformType" = 'GOOGLE_SHEETS'
ORDER BY "createdAt" DESC
LIMIT 5;

-- 8. Check for orphaned spreadsheet connections
SELECT 
    'Orphaned Spreadsheet Connections' as table_name,
    sc.*
FROM "SpreadsheetConnection" sc
LEFT JOIN "PlatformConnection" pc ON sc."connectionId" = pc.id
WHERE pc.id IS NULL;

-- 9. Summary statistics
SELECT 
    'Summary Statistics' as table_name,
    COUNT(DISTINCT pc.id) as total_google_connections,
    COUNT(DISTINCT pc."userId") as unique_users,
    COUNT(DISTINCT pc."platformData"->>'google_email') as unique_emails,
    COUNT(sc.id) as total_spreadsheet_connections,
    COUNT(CASE WHEN sc."isActive" = true THEN 1 END) as active_spreadsheet_connections
FROM "PlatformConnection" pc
LEFT JOIN "SpreadsheetConnection" sc ON pc.id = sc."connectionId"
WHERE pc."platformType" = 'GOOGLE_SHEETS';