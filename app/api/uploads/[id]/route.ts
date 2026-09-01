import { NextResponse } from "next/server";
import { requireGuestSession } from "@/lib/auth/session";
import { safeUploadById } from "@/lib/uploads/api-response";
import { loadWorkingMemory, saveWorkingMemory } from "@/lib/working-memory/store";
import { prisma } from "@/lib/db/prisma";
import { UPLOAD_STATUS } from "@/lib/uploads/config";
import type { WorkingMemory } from "@/lib/working-memory/types";
import type { NextRequest } from "next/server";

async function invalidateUploadEvidence(memory: WorkingMemory, uploadId: string): Promise<void> {
  const chunks = await prisma.uploadChunk.findMany({
    where: { uploadId },
    select: { id: true },
  });

  const sourceIds = new Set(chunks.map((c) => c.id));

  // Mark the corresponding source heads as deleted so future sensemakers
  // cannot use them as active evidence.
  for (const head of memory.source_heads) {
    if (sourceIds.has(head.source_id)) {
      head.status = "deleted";
      head.deleted_at = new Date().toISOString();
      head.active_revision = undefined;
    }
  }

  // Any claim or constraint that rested on a now-deleted source becomes stale.
  for (const claim of memory.claims) {
    if (claim.status !== "active") continue;
    const hasStaleEvidence = claim.evidence.some((link) => sourceIds.has(link.source_id));
    if (hasStaleEvidence) {
      claim.status = "stale";
    }
  }

  for (const constraint of memory.constraints) {
    if (constraint.status !== "active") continue;
    const hasStaleEvidence = constraint.evidence.some((link) => sourceIds.has(link.source_id));
    if (hasStaleEvidence) {
      constraint.status = "stale";
    }
  }
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireGuestSession(request);
  if (!session) {
    return NextResponse.json({ error: "No active guest session" }, { status: 401 });
  }

  const { id } = await params;

  const upload = await safeUploadById(id, true);
  if (!upload) {
    return NextResponse.json({ error: "Upload not found" }, { status: 404 });
  }

  // Verify ownership without exposing sessionId.
  const owns = await prisma.upload.findFirst({
    where: { id, sessionId: session.id },
    select: { id: true },
  });
  if (!owns) {
    return NextResponse.json({ error: "Upload not found" }, { status: 404 });
  }

  return NextResponse.json({ upload });
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireGuestSession(request);
  if (!session) {
    return NextResponse.json({ error: "No active guest session" }, { status: 401 });
  }

  const { id } = await params;

  const upload = await prisma.upload.findFirst({
    where: { id, sessionId: session.id },
  });

  if (!upload) {
    return NextResponse.json({ error: "Upload not found" }, { status: 404 });
  }

  const memory = await loadWorkingMemory(session.id);
  if (memory) {
    await invalidateUploadEvidence(memory, id);
    await saveWorkingMemory(session.id, memory);
  }

  await prisma.$transaction([
    // Mark any derived content that depended on this upload as unsupported.
    prisma.derivedContent.updateMany({
      where: { uploadId: id, supportStatus: "supported" },
      data: { supportStatus: "unsupported" },
    }),
    // Remove chunks and the upload record.
    prisma.uploadChunk.deleteMany({ where: { uploadId: id } }),
    prisma.upload.delete({ where: { id } }),
  ]);

  return NextResponse.json({ deleted: true });
}
