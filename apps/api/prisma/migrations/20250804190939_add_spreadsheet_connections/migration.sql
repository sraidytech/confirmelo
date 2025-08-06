-- CreateTable
CREATE TABLE "SpreadsheetConnection" (
    "id" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "spreadsheetId" TEXT NOT NULL,
    "spreadsheetName" TEXT NOT NULL,
    "webViewLink" TEXT,
    "connectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastAccessedAt" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sheetsData" JSONB,
    "permissions" JSONB,
    "lastSyncAt" TIMESTAMP(3),
    "syncCount" INTEGER NOT NULL DEFAULT 0,
    "lastErrorAt" TIMESTAMP(3),
    "lastErrorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SpreadsheetConnection_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SpreadsheetConnection_connectionId_spreadsheetId_key" ON "SpreadsheetConnection"("connectionId", "spreadsheetId");

-- CreateIndex
CREATE INDEX "SpreadsheetConnection_connectionId_idx" ON "SpreadsheetConnection"("connectionId");

-- CreateIndex
CREATE INDEX "SpreadsheetConnection_spreadsheetId_idx" ON "SpreadsheetConnection"("spreadsheetId");

-- CreateIndex
CREATE INDEX "SpreadsheetConnection_isActive_idx" ON "SpreadsheetConnection"("isActive");

-- CreateIndex
CREATE INDEX "SpreadsheetConnection_lastAccessedAt_idx" ON "SpreadsheetConnection"("lastAccessedAt");

-- AddForeignKey
ALTER TABLE "SpreadsheetConnection" ADD CONSTRAINT "SpreadsheetConnection_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "PlatformConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;