import { NextResponse } from "next/server";
import { resolveSession } from "@/lib/auth/resolve";
import { getParser, UPLOAD_STATUS } from "@/lib/uploads/config";
import { parseUploadContent } from "@/lib/uploads/parse";
import { safeUploadById } from "@/lib/uploads/api-response";
import { prisma } from "@/lib/db/prisma";
import type { NextRequest } from "next/server";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { session } = await resolveSession(request);
  if (!session) {
    return NextResponse.json({ error: "No active session" }, { status: 401 });
  }

  const { id } = await params;

  const upload = await prisma.upload.findFirst({
    where: { id, sessionId: session.id },
  });

  if (!upload) {
    return NextResponse.json({ error: "Upload not found" }, { status: 404 });
  }

  if (!upload.rawBase64) {
    return NextResponse.json({ error: "原始文件未保留，请重新上传" }, { status: 422 });
  }

  const parser = getParser(upload.mimeType);
  if (!parser) {
    await prisma.upload.update({
      where: { id },
      data: { status: UPLOAD_STATUS.REJECTED, error: "No parser for MIME type" },
    });
    return NextResponse.json({ error: "No parser available" }, { status: 422 });
  }

  await prisma.upload.update({
    where: { id },
    data: { status: UPLOAD_STATUS.PARSING, error: null },
  });

  // Clear old chunks before re-parsing.
  await prisma.uploadChunk.deleteMany({ where: { uploadId: id } });

  try {
    const raw = Buffer.from(upload.rawBase64, "base64").toString("utf-8");
    const chunks = parseUploadContent(raw, parser);

    await prisma.$transaction([
      prisma.upload.update({
        where: { id },
        data: { status: UPLOAD_STATUS.READY, error: null },
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
    return NextResponse.json({ upload: safeUpload });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Parse failed";
    await prisma.upload.update({
      where: { id },
      data: { status: UPLOAD_STATUS.FAILED, error: message },
    });
    return NextResponse.json({ error: message }, { status: 422 });
  }
}
