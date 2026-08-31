-- TASK-008: event ledger, state snapshot, source versioning, generation provenance and new wave/insight domain tables.
-- Existing Session, Consent, Answer, Upload, UploadChunk, DerivedContent, WorkingMemory, Wave, ModelCallLog tables are retained.

-- Immutable source versions and active heads.
CREATE TABLE "SourceVersion" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sessionId" TEXT NOT NULL,
    "source_id" TEXT NOT NULL,
    "revision" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "untrusted" BOOLEAN NOT NULL DEFAULT false,
    "textRef" TEXT NOT NULL,
    CONSTRAINT "SourceVersion_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "SourceHead" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sessionId" TEXT NOT NULL,
    "source_id" TEXT NOT NULL,
    "activeRevision" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'active',
    "deletedAt" DATETIME,
    CONSTRAINT "SourceHead_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "SourceHead_sessionId_source_id_key" ON "SourceHead"("sessionId", "source_id");
CREATE UNIQUE INDEX "SourceVersion_sessionId_source_id_revision_key" ON "SourceVersion"("sessionId", "source_id", "revision");
CREATE INDEX "SourceVersion_sessionId_idx" ON "SourceVersion"("sessionId");
CREATE INDEX "SourceVersion_source_id_idx" ON "SourceVersion"("source_id");

-- Append-only committed transition ledger.
CREATE TABLE "TransitionEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sessionId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "schemaVersion" INTEGER NOT NULL DEFAULT 3,
    "baseRevision" INTEGER NOT NULL,
    "committedRevision" INTEGER NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "payloadHash" TEXT NOT NULL,
    "correlationId" TEXT NOT NULL,
    "causationId" TEXT,
    "proposalId" TEXT,
    "actor" TEXT NOT NULL,
    "fromState" TEXT NOT NULL,
    "toState" TEXT NOT NULL,
    "eventMetadataJson" TEXT NOT NULL,
    "stateSnapshotJson" TEXT NOT NULL,
    "snapshotHash" TEXT NOT NULL,
    "committedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TransitionEvent_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TransitionEvent_sessionId_eventId_key" UNIQUE ("sessionId", "eventId"),
    CONSTRAINT "TransitionEvent_sessionId_idempotencyKey_key" UNIQUE ("sessionId", "idempotencyKey")
);

CREATE INDEX "TransitionEvent_sessionId_idx" ON "TransitionEvent"("sessionId");
CREATE INDEX "TransitionEvent_proposalId_idx" ON "TransitionEvent"("sessionId", "proposalId");

-- Current session state snapshot for fast resume.
CREATE TABLE "SessionStateHead" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sessionId" TEXT NOT NULL UNIQUE,
    "revision" INTEGER NOT NULL DEFAULT 0,
    "machineVersion" INTEGER NOT NULL DEFAULT 3,
    "stateValueJson" TEXT NOT NULL,
    "publicContextJson" TEXT NOT NULL,
    "resumeStateJson" TEXT,
    "snapshotHash" TEXT NOT NULL,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SessionStateHead_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "SessionStateHead_sessionId_idx" ON "SessionStateHead"("sessionId");

-- Generation provenance for every accepted model proposal.
CREATE TABLE "GenerationProvenance" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sessionId" TEXT NOT NULL,
    "proposalId" TEXT NOT NULL,
    "correlationId" TEXT NOT NULL,
    "promptContractRevision" INTEGER NOT NULL DEFAULT 3,
    "promptFileHash" TEXT NOT NULL,
    "schemaHash" TEXT NOT NULL,
    "contextBuilderVersion" TEXT NOT NULL,
    "contextHash" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "modelConfigJson" TEXT NOT NULL,
    "modelConfigHash" TEXT NOT NULL,
    "fixtureSuiteVersion" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "GenerationProvenance_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "GenerationProvenance_sessionId_proposalId_key" UNIQUE ("sessionId", "proposalId")
);

CREATE INDEX "GenerationProvenance_sessionId_idx" ON "GenerationProvenance"("sessionId");

-- Dependency edges for stale/invalidated propagation.
CREATE TABLE "DependencyEdge" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sessionId" TEXT NOT NULL,
    "fromId" TEXT NOT NULL,
    "fromKind" TEXT NOT NULL,
    "toId" TEXT NOT NULL,
    "toKind" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DependencyEdge_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "DependencyEdge_sessionId_idx" ON "DependencyEdge"("sessionId");
CREATE INDEX "DependencyEdge_fromId_idx" ON "DependencyEdge"("fromId");
CREATE INDEX "DependencyEdge_toId_idx" ON "DependencyEdge"("toId");

-- New wave domain tables. The legacy "Wave" table remains as a JSON container for donor compatibility.
CREATE TABLE "WaveMission" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sessionId" TEXT NOT NULL,
    "waveId" TEXT NOT NULL,
    "generationProvenanceId" TEXT NOT NULL,
    "decisionToImprove" TEXT NOT NULL,
    "targetDimensions" TEXT NOT NULL,
    "knownSourceRefs" TEXT NOT NULL,
    "importantUnknown" TEXT NOT NULL,
    "whyNow" TEXT NOT NULL,
    "exitCondition" TEXT NOT NULL,
    "sensitivityCeiling" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WaveMission_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "WaveMission_generationProvenanceId_fkey" FOREIGN KEY ("generationProvenanceId") REFERENCES "GenerationProvenance" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "WaveMission_sessionId_waveId_key" UNIQUE ("sessionId", "waveId")
);

CREATE INDEX "WaveMission_sessionId_idx" ON "WaveMission"("sessionId");

CREATE TABLE "ElicitationUnit" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sessionId" TEXT NOT NULL,
    "waveId" TEXT NOT NULL,
    "generationProvenanceId" TEXT NOT NULL,
    "orderInWave" INTEGER NOT NULL,
    "decisionTarget" TEXT NOT NULL,
    "targetDimensions" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "questionId" TEXT,
    "sourceRefs" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ElicitationUnit_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ElicitationUnit_generationProvenanceId_fkey" FOREIGN KEY ("generationProvenanceId") REFERENCES "GenerationProvenance" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "ElicitationUnit_sessionId_idx" ON "ElicitationUnit"("sessionId");
CREATE INDEX "ElicitationUnit_waveId_idx" ON "ElicitationUnit"("waveId");

CREATE TABLE "Microbatch" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sessionId" TEXT NOT NULL,
    "waveId" TEXT NOT NULL,
    "generationProvenanceId" TEXT NOT NULL,
    "index" INTEGER NOT NULL,
    "sessionRevision" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'proposed',
    "idempotencyKey" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Microbatch_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Microbatch_generationProvenanceId_fkey" FOREIGN KEY ("generationProvenanceId") REFERENCES "GenerationProvenance" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "Microbatch_sessionId_idx" ON "Microbatch"("sessionId");
CREATE INDEX "Microbatch_waveId_idx" ON "Microbatch"("waveId");

CREATE TABLE "Question" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sessionId" TEXT NOT NULL,
    "waveId" TEXT NOT NULL,
    "microbatchId" TEXT NOT NULL,
    "generationProvenanceId" TEXT NOT NULL,
    "orderInWave" INTEGER NOT NULL,
    "elicitationUnitId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "responseKind" TEXT NOT NULL,
    "options" TEXT,
    "sensitivity" TEXT NOT NULL,
    "whyThisMatters" TEXT NOT NULL,
    "decisionTarget" TEXT NOT NULL,
    "asksForConcreteExample" BOOLEAN NOT NULL DEFAULT false,
    "allowsSkip" BOOLEAN NOT NULL DEFAULT true,
    "allowsFreeText" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Question_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Question_microbatchId_fkey" FOREIGN KEY ("microbatchId") REFERENCES "Microbatch" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Question_generationProvenanceId_fkey" FOREIGN KEY ("generationProvenanceId") REFERENCES "GenerationProvenance" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "Question_sessionId_idx" ON "Question"("sessionId");
CREATE INDEX "Question_waveId_idx" ON "Question"("waveId");

CREATE TABLE "ImmediateInsight" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sessionId" TEXT NOT NULL,
    "waveId" TEXT NOT NULL,
    "generationProvenanceId" TEXT NOT NULL,
    "generatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userToldMe" TEXT NOT NULL,
    "currentReading" TEXT NOT NULL,
    "importantUnknown" TEXT NOT NULL,
    "radarDeltas" TEXT NOT NULL,
    "routeImpact" TEXT NOT NULL,
    "evidence" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'generated',
    "languageStrength" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ImmediateInsight_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ImmediateInsight_generationProvenanceId_fkey" FOREIGN KEY ("generationProvenanceId") REFERENCES "GenerationProvenance" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "ImmediateInsight_sessionId_idx" ON "ImmediateInsight"("sessionId");
CREATE INDEX "ImmediateInsight_waveId_idx" ON "ImmediateInsight"("waveId");

CREATE TABLE "Calibration" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sessionId" TEXT NOT NULL,
    "insightId" TEXT NOT NULL,
    "verdict" TEXT NOT NULL,
    "correctionText" TEXT,
    "preferredDirection" TEXT,
    "sourceId" TEXT NOT NULL,
    "sourceRevision" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Calibration_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "Calibration_sessionId_idx" ON "Calibration"("sessionId");
CREATE INDEX "Calibration_insightId_idx" ON "Calibration"("insightId");

CREATE TABLE "RouteIntent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sessionId" TEXT NOT NULL,
    "generationProvenanceId" TEXT NOT NULL,
    "titleHint" TEXT NOT NULL,
    "lifeShape" TEXT NOT NULL,
    "realCost" TEXT NOT NULL,
    "evidence" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'seed',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RouteIntent_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "RouteIntent_generationProvenanceId_fkey" FOREIGN KEY ("generationProvenanceId") REFERENCES "GenerationProvenance" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "RouteIntent_sessionId_idx" ON "RouteIntent"("sessionId");
