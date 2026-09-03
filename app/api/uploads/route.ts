import { NextResponse } from "next/server";
import { resolveSession } from "@/lib/auth/resolve";
import { hasConsent } from "@/lib/auth/session";
import { isAllowedMimeType, getParser, UPLOAD_MAX_SIZE, MAX_UPLOAD_FILES, UPLOAD_STATUS } from "@/lib/uploads/config";
import { extractFromBuffer } from "@/lib/uploads/extract";
import { textToChunks } from "@/lib/uploads/parse";
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
  if (ext === ".pdf") return "application/pdf";
  if (ext === ".docx") return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  if (ext === ".png") return "image/png";
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".webp") return "image/webp";
  if (ext === ".gif") return "image/gif";
  return null;
}

const ALLOWED_TYPES = [
  "text/plain",
  "text/markdown",
  "application/json",
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
];

export async function POST(request: NextRequest) {
  const { session } = await resolveSession(request);
  if (!session) {
    return NextResponse.json({ error: "No active session" }, { status: 401 });
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
        allowed: ALLOWED_TYPES,
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

  // Count only uploads that are actually usable (exclude terminal failure states)
  const existingCount = await prisma.upload.count({
    where: {
      sessionId: session.id,
      status: { notIn: [UPLOAD_STATUS.DELETED, UPLOAD_STATUS.FAILED, UPLOAD_STATUS.REJECTED] },
    },
  });
  if (existingCount >= MAX_UPLOAD_FILES) {
    return NextResponse.json(
      { error: "Too many upload files", maxFiles: MAX_UPLOAD_FILES },
      { status: 413 }
    );
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  // Create record in scanning state.
  // Note: rawBase64 is not stored — it was causing slow writes for 1MB+
  // files (base64 encoding inflates size ~33%, and SQLite blob writes
  // are not optimized for large payloads). Retry re-upload from the
  // client side instead of storing the raw file server-side.
  const upload = await prisma.upload.create({
    data: {
      sessionId: session.id,
      fileName,
      mimeType,
      size: file.size,
      status: UPLOAD_STATUS.SCANNING,
    },
  });

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
    const { previewText } = await extractFromBuffer(buffer, mimeType, parser);

    // Text-like files are immediately ready; images and PDFs need user confirmation.
    const needsConfirmation = parser === "image" || parser === "pdf";

    if (!needsConfirmation) {
      const chunks = textToChunks(previewText);
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
    } else {
      // Store only the extracted text in DB — pageImages (PNG data URLs) are
      // returned to the client for preview but NOT persisted, since they can
      // be several MB and SQLite blob writes are slow. The client keeps them
      // in memory for the preview session; if the user refreshes, they can
      // re-upload. The text is what actually gets used for interview context.
      await prisma.derivedContent.create({
        data: {
          sessionId: session.id,
          uploadId: upload.id,
          kind: "extract_preview",
          payload: JSON.stringify({ text: previewText }),
          supportStatus: "supported",
        },
      });
      await prisma.upload.update({
        where: { id: upload.id },
        data: { status: UPLOAD_STATUS.PREVIEW_READY },
      });
    }

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
