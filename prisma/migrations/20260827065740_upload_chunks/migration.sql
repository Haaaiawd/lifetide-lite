/*
  Warnings:

  - You are about to drop the column `parsedText` on the `Upload` table. All the data in the column will be lost.
  - Added the required column `mimeType` to the `Upload` table without a default value. This is not possible if the table is not empty.
  - Added the required column `size` to the `Upload` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updatedAt` to the `Upload` table without a default value. This is not possible if the table is not empty.

*/
-- CreateTable
CREATE TABLE "UploadChunk" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "uploadId" TEXT NOT NULL,
    "index" INTEGER NOT NULL,
    "source" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "UploadChunk_uploadId_fkey" FOREIGN KEY ("uploadId") REFERENCES "Upload" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_DerivedContent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sessionId" TEXT NOT NULL,
    "uploadId" TEXT,
    "kind" TEXT NOT NULL,
    "payload" TEXT NOT NULL,
    "supportStatus" TEXT NOT NULL DEFAULT 'supported',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DerivedContent_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "DerivedContent_uploadId_fkey" FOREIGN KEY ("uploadId") REFERENCES "Upload" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_DerivedContent" ("createdAt", "id", "kind", "payload", "sessionId") SELECT "createdAt", "id", "kind", "payload", "sessionId" FROM "DerivedContent";
DROP TABLE "DerivedContent";
ALTER TABLE "new_DerivedContent" RENAME TO "DerivedContent";
CREATE INDEX "DerivedContent_sessionId_idx" ON "DerivedContent"("sessionId");
CREATE INDEX "DerivedContent_uploadId_idx" ON "DerivedContent"("uploadId");
CREATE TABLE "new_Upload" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sessionId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    "error" TEXT,
    "rawBase64" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Upload_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Upload" ("createdAt", "fileName", "id", "sessionId", "status") SELECT "createdAt", "fileName", "id", "sessionId", "status" FROM "Upload";
DROP TABLE "Upload";
ALTER TABLE "new_Upload" RENAME TO "Upload";
CREATE INDEX "Upload_sessionId_idx" ON "Upload"("sessionId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "UploadChunk_uploadId_idx" ON "UploadChunk"("uploadId");
