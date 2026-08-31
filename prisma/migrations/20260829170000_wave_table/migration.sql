-- Create legacy Wave table if missing from baseline migrations.
CREATE TABLE "Wave" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sessionId" TEXT NOT NULL,
    "wave_id" TEXT NOT NULL,
    "wave_index" INTEGER NOT NULL,
    "focus_uncertainty_id" TEXT,
    "questions" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Wave_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "Wave_sessionId_idx" ON "Wave"("sessionId");
CREATE UNIQUE INDEX "Wave_sessionId_wave_id_key" ON "Wave"("sessionId", "wave_id");
