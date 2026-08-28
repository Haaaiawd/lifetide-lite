import { NextResponse } from "next/server";
import { requireGuestSession } from "@/lib/auth/session";
import { safeUploadById } from "@/lib/uploads/api-response";
import { loadWorkingMemory, saveWorkingMemory } from "@/lib/working-memory/store";
import { prisma } from "@/lib/db/prisma";
import { UPLOAD_STATUS } from "@/lib/uploads/config";
import type { EvidenceNote, SourceRef, WorkingMemory } from "@/lib/working-memory/types";
import type { NextRequest } from "next/server";

function invalidateUploadEvidence(memory: WorkingMemory, uploadId: string): void {
  const correction: SourceRef = {
    kind: "user_correction",
    correction_id: `deleted-upload-${uploadId}`,
    wave_id: "system",
  };
  for (const evidence of memory.evidence as EvidenceNote[]) {
    const fromUpload = evidence.source_refs.some(
      (ref) => ref.kind === "upload_chunk" && ref.document_id === uploadId
    );
    if (fromUpload) {
      evidence.status = "invalidated";
      evidence.invalidated_by = correction;
    }
  }
  for (const claim of memory.claims) {
    if (claim.evidence_ids.some((id) => memory.evidence.some((e) => e.id === id && e.status === "invalidated"))) {
      claim.status = "invalidated";
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
    invalidateUploadEvidence(memory, id);
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
