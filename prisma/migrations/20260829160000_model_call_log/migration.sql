-- Create ModelCallLog table if missing from baseline migrations.
CREATE TABLE "ModelCallLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sessionId" TEXT,
    "wave_id" TEXT,
    "purpose" TEXT NOT NULL,
    "model_config_id" TEXT,
    "prompt_version" TEXT,
    "status" TEXT NOT NULL,
    "input_tokens" INTEGER,
    "output_tokens" INTEGER,
    "latency_ms" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ModelCallLog_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "ModelCallLog_sessionId_idx" ON "ModelCallLog"("sessionId");
CREATE INDEX "ModelCallLog_purpose_idx" ON "ModelCallLog"("purpose");
