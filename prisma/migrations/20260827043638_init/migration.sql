-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "token" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Consent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sessionId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "required" BOOLEAN NOT NULL,
    "given" BOOLEAN NOT NULL,
    "givenAt" DATETIME,
    CONSTRAINT "Consent_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Answer" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sessionId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "value" TEXT,
    "skipped" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Answer_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Upload" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sessionId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "parsedText" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Upload_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DerivedContent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sessionId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "payload" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DerivedContent_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Session_token_key" ON "Session"("token");

-- CreateIndex
CREATE INDEX "Consent_sessionId_idx" ON "Consent"("sessionId");

-- CreateIndex
CREATE UNIQUE INDEX "Consent_sessionId_type_key" ON "Consent"("sessionId", "type");

-- CreateIndex
CREATE INDEX "Answer_sessionId_idx" ON "Answer"("sessionId");

-- CreateIndex
CREATE INDEX "Upload_sessionId_idx" ON "Upload"("sessionId");

-- CreateIndex
CREATE INDEX "DerivedContent_sessionId_idx" ON "DerivedContent"("sessionId");
