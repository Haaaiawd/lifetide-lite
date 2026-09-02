import { NextResponse } from "next/server";
import { resolveSession } from "@/lib/auth/resolve";
import { prisma } from "@/lib/db/prisma";
import { textToChunks } from "@/lib/uploads/parse";
import { safeUploadById } from "@/lib/uploads/api-response";
import { UPLOAD_STATUS } from "@/lib/uploads/config";
import type { NextRequest } from "next/server";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { session } = await resolveSession(request);
  if (!session) {
    return NextResponse.json({ error: "No active session" }, { status: 401 });
  }

  const { id } = await params;
  let confirmedText = "";
  try {
    const body = await request.json();
    confirmedText = typeof body.confirmedText === "string" ? body.confirmedText : "";
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const upload = await prisma.upload.findUnique({
    where: { id },
    include: { session: true },
  });

  if (!upload) {
    return NextResponse.json({ error: "Upload not found" }, { status: 404 });
  }

  if (upload.sessionId !== session.id) {
    return NextResponse.json({ error: "Upload does not belong to this session" }, { status: 403 });
  }

  if (upload.status !== UPLOAD_STATUS.PREVIEW_READY) {
    return NextResponse.json({ error: "Upload is not awaiting confirmation" }, { status: 409 });
  }

  try {
    await prisma.uploadChunk.deleteMany({ where: { uploadId: id } });

    const chunks = textToChunks(confirmedText || "（未确认内容）");
    await prisma.$transaction([
      prisma.upload.update({
        where: { id },
        data: { status: UPLOAD_STATUS.READY },
      }),
      ...chunks.map((chunk) =>
        prisma.uploadChunk.create({
          data: {
            uploadId: id,
            index: chunk.index,
            source: chunk.source,
            text: chunk.text,
          },
        })
      ),
    ]);

    const safeUpload = await safeUploadById(id, true);
    return NextResponse.json({ upload: safeUpload }, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Confirm failed";
    await prisma.upload.update({
      where: { id },
      data: { status: UPLOAD_STATUS.FAILED, error: message },
    });
    return NextResponse.json({ error: message }, { status: 422 });
  }
}
