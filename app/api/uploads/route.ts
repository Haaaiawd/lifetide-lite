import { NextResponse } from "next/server";
import { requireGuestSession, hasConsent } from "@/lib/auth/session";
import { isAllowedMimeType, getParser, UPLOAD_MAX_SIZE, UPLOAD_STATUS } from "@/lib/uploads/config";
import { parseUploadContent } from "@/lib/uploads/parse";
import { safeUploadById } from "@/lib/uploads/api-response";
import { prisma } from "@/lib/db/prisma";
import type { NextRequest } from "next/server";

function extensionOf(name: string): string {
  const idx = name.lastIndexOf(".");
  return idx >= 0 ? name.slice(idx).toLowerCase() : "";
}

function mimeFromExtension(ext: string): string | null {
  if (ext === ".txt") return "text/plain";
  if (ext === ".md") return "text/markdown";
  if (ext === ".json") return "application/json";
  return null;
}

export async function POST(request: NextRequest) {
  const session = await requireGuestSession(request);
  if (!session) {
    return NextResponse.json({ error: "No active guest session" }, { status: 401 });
  }

  if (!hasConsent(session.consents, "upload")) {
    return NextResponse.json({ error: "Upload consent required" }, { status: 403 });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form data" }, { status: 400 });
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Expected a file" }, { status: 400 });
  }

  const fileName = file.name;
  const mimeType = file.type || mimeFromExtension(extensionOf(fileName)) || "";

  // Independent server-side validation
  if (!isAllowedMimeType(mimeType)) {
    return NextResponse.json(
      {
        error: "File type not allowed",
        allowed: ["text/plain", "text/markdown", "application/json"],
        received: mimeType,
      },
      { status: 415 }
    );
  }

  if (file.size > UPLOAD_MAX_SIZE) {
    return NextResponse.json(
      { error: "File too large", maxBytes: UPLOAD_MAX_SIZE },
      { status: 413 }
    );
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const rawBase64 = buffer.toString("base64");
  const raw = buffer.toString("utf-8");

  // Create record in scanning state
  const upload = await prisma.upload.create({
    data: {
      sessionId: session.id,
      fileName,
      mimeType,
      size: file.size,
      status: UPLOAD_STATUS.SCANNING,
      rawBase64,
    },
  });

  // "Malware / parse" boundary: we only parse, never execute the content.
  const parser = getParser(mimeType);
  if (!parser) {
    await prisma.upload.update({
      where: { id: upload.id },
      data: { status: UPLOAD_STATUS.REJECTED, error: "No parser for accepted MIME type" },
    });
    return NextResponse.json({ error: "No parser available" }, { status: 422 });
  }

  await prisma.upload.update({
    where: { id: upload.id },
    data: { status: UPLOAD_STATUS.PARSING },
  });

  try {
    const chunks = parseUploadContent(raw, parser);

    await prisma.$transaction([
      prisma.upload.update({
        where: { id: upload.id },
        data: { status: UPLOAD_STATUS.READY },
      }),
      ...chunks.map((chunk) =>
        prisma.uploadChunk.create({
          data: {
            uploadId: upload.id,
            index: chunk.index,
            source: chunk.source,
            text: chunk.text,
          },
        })
      ),
    ]);

    const safeUpload = await safeUploadById(upload.id, true);
    return NextResponse.json({ upload: safeUpload }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Parse failed";
    await prisma.upload.update({
      where: { id: upload.id },
      data: { status: UPLOAD_STATUS.FAILED, error: message },
    });
    return NextResponse.json({ error: message }, { status: 422 });
  }
}
