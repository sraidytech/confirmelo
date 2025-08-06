-- Fix duplicate unknown emails by making them unique
UPDATE "PlatformConnection" 
SET "platformData" = "platformData" || jsonb_build_object(
    'google_email', 'unknown_' || substr(id, 1, 8) || '@gmail.com'
)
WHERE "platformType" = 'GOOGLE_SHEETS'
AND "platformData"->>'google_email' = 'unknown@gmail.com';