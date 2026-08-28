-- CreateTable
CREATE TABLE "WorkingMemory" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sessionId" TEXT NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 0,
    "payload" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "WorkingMemory_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "WorkingMemory_sessionId_key" ON "WorkingMemory"("sessionId");

-- CreateIndex
CREATE INDEX "WorkingMemory_sessionId_idx" ON "WorkingMemory"("sessionId");
