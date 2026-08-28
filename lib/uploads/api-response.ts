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
};

export async function safeUploadById(id: string, includeChunks = true): Promise<SafeUpload | null> {
  const upload = await prisma.upload.findUnique({
    where: { id },
    select: includeChunks
      ? { ...safeUploadSelect, chunks: { orderBy: { index: "asc" as const }, select: safeChunkSelect } }
      : safeUploadSelect,
  });
  if (!upload) return null;
  return upload as SafeUpload;
}
