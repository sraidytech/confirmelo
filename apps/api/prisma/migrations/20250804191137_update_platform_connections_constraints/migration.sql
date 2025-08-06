-- First, let's check if the constraint exists and drop it
DO $$ 
BEGIN
    -- Drop the existing unique constraint if it exists
    IF EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'PlatformConnection_userId_platformType_platformStoreId_key'
        AND table_name = 'PlatformConnection'
    ) THEN
        ALTER TABLE "PlatformConnection" DROP CONSTRAINT "PlatformConnection_userId_platformType_platformStoreId_key";
    END IF;
END $$;

-- Drop the existing unique index if it exists
DROP INDEX IF EXISTS "PlatformConnection_userId_platformType_platformStoreId_key";

-- Create a partial unique index for non-Google platforms (maintains existing behavior)
CREATE UNIQUE INDEX "PlatformConnection_userId_platformType_platformStoreId_non_google_key" 
ON "PlatformConnection"("userId", "platformType", "platformStoreId") 
WHERE "platformType" != 'GOOGLE_SHEETS';

-- Create index on Google email field for better performance on Google Sheets connections
CREATE INDEX "PlatformConnection_google_email_idx" 
ON "PlatformConnection"(("platformData"->>'google_email')) 
WHERE "platformType" = 'GOOGLE_SHEETS';

-- Create composite index for Google Sheets connections to ensure uniqueness per user per Google account
CREATE UNIQUE INDEX "PlatformConnection_userId_google_email_key" 
ON "PlatformConnection"("userId", ("platformData"->>'google_email')) 
WHERE "platformType" = 'GOOGLE_SHEETS' AND "platformData"->>'google_email' IS NOT NULL;