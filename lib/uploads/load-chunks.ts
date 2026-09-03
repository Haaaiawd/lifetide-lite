import { prisma } from "@/lib/db/prisma";
import { hashObject } from "@/lib/utils/hash";
import type { UploadChunk } from "@/lib/working-memory/types";

// Load ready upload chunks for a session. Shared by all routes that need to
// pass uploaded materials into model context (wave GET/POST, final, portrait).
export async function loadUploadChunks(sessionId: string): Promise<UploadChunk[] | undefined> {
  const uploadsWithChunks = await prisma.upload.findMany({
    where: { sessionId, status: "ready" },
    include: { chunks: true },
    orderBy: { createdAt: "desc" },
    take: 5,
  });

  const chunks = uploadsWithChunks.flatMap((u) =>
    u.chunks.map((c) => ({
      document_id: u.id,
      chunk_id: c.id,
      ordinal: c.index,
      text: c.text,
      content_hash: hashObject(c.text),
      trust: "untrusted_user_data" as const,
      injection_pattern_detected: false,
    }))
  );
  return chunks.length > 0 ? chunks : undefined;
}
