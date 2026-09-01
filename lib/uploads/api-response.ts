import { prisma } from "@/lib/db/prisma";

const safeUploadSelect = {
  id: true,
  fileName: true,
  mimeType: true,
  size: true,
  status: true,
  error: true,
} as const;

const safeChunkSelect = {
  index: true,
  source: true,
  text: true,
} as const;

export type SafeUpload = {
  id: string;
  fileName: string;
  mimeType: string;
  size: number;
  status: string;
  error: string | null;
  chunks?: { index: number; source: string; text: string }[];
  preview?: {
    text: string;
    pageImages: string[];
  };
};

export async function safeUploadById(id: string, includeChunks = true): Promise<SafeUpload | null> {
  const upload = await prisma.upload.findUnique({
    where: { id },
    select: includeChunks
      ? { ...safeUploadSelect, chunks: { orderBy: { index: "asc" as const }, select: safeChunkSelect } }
      : safeUploadSelect,
  });
  if (!upload) return null;

  const derived = await prisma.derivedContent.findFirst({
    where: { uploadId: id, kind: "extract_preview" },
    select: { payload: true },
    orderBy: { createdAt: "desc" },
  });

  const result: SafeUpload = upload as SafeUpload;
  if (derived) {
    try {
      const payload = JSON.parse(derived.payload);
      if (payload.text !== undefined || payload.pageImages !== undefined) {
        result.preview = {
          text: String(payload.text ?? ""),
          pageImages: Array.isArray(payload.pageImages) ? payload.pageImages.map(String) : [],
        };
      }
    } catch {
      // ignore malformed derived payload
    }
  }

  return result;
}
