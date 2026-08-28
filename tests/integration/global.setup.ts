import { PrismaClient } from "@prisma/client";

if ("loadEnvFile" in process) {
  (process as NodeJS.Process & { loadEnvFile(path: string): void }).loadEnvFile(".env");
}

const prisma = new PrismaClient();

export default async function globalSetup() {
  // Clear test data once before all workers run. Integration tests create
  // isolated guest sessions and must not wipe each other's data mid-run.
  await prisma.derivedContent.deleteMany({});
  await prisma.uploadChunk.deleteMany({});
  await prisma.upload.deleteMany({});
  await prisma.answer.deleteMany({});
  await prisma.modelCallLog.deleteMany({});
  await prisma.wave.deleteMany({});
  await prisma.workingMemory.deleteMany({});
  await prisma.consent.deleteMany({});
  await prisma.session.deleteMany({});
  await prisma.$disconnect();
}
