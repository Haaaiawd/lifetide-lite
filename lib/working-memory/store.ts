import { prisma } from "@/lib/db/prisma";
import { workingMemorySchema } from "./schema";
import { makeEmptyWorkingMemory, type WorkingMemory } from "./types";
import { deriveShortQuestion } from "@/lib/interview/derive-question";

export type StoredWorkingMemory = {
  id: string;
  sessionId: string;
  revision: number;
  payload: WorkingMemory;
  createdAt: Date;
  updatedAt: Date;
};

export async function loadWorkingMemory(sessionId: string): Promise<WorkingMemory | null> {
  const row = await prisma.workingMemory.findUnique({ where: { sessionId } });
  if (!row) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(row.payload);
  } catch {
    console.warn(`WorkingMemory for ${sessionId} is not valid JSON; treating as empty.`);
    return null;
  }

  // Backfill `topic` and re-derive `question` for legacy uncertainty records
  // created before the topic/question split. Old records stored the
  // important_unknown statement in `question`, which is exactly the `topic`
  // semantic. We move it to `topic` and re-derive a short `question` so
  // downstream consumers (final.ts, portrait.ts, chat/summary.ts) don't
  // embed a long statement into question-shaped contexts.
  if (parsed && typeof parsed === "object") {
    const obj = parsed as Record<string, unknown>;
    if (Array.isArray(obj.uncertainties)) {
      for (const u of obj.uncertainties as Array<Record<string, unknown>>) {
        if (u && typeof u === "object" && !("topic" in u) && typeof u.question === "string") {
          u.topic = u.question;
          u.question = deriveShortQuestion(u.question);
        }
      }
    }
  }

  const result = workingMemorySchema.safeParse(parsed);
  if (!result.success) {
    console.warn(`WorkingMemory for ${sessionId} failed runtime validation:`, result.error.flatten());
    return null;
  }

  return result.data as WorkingMemory;
}

export async function loadOrCreateWorkingMemory(sessionId: string): Promise<WorkingMemory> {
  const existing = await loadWorkingMemory(sessionId);
  if (existing) return existing;
  const memory = makeEmptyWorkingMemory(sessionId);
  await saveWorkingMemory(sessionId, memory);
  return memory;
}

export async function saveWorkingMemory(
  sessionId: string,
  memory: WorkingMemory
): Promise<WorkingMemory> {
  const next = { ...memory, updated_at: new Date().toISOString() };
  await prisma.workingMemory.upsert({
    where: { sessionId },
    create: {
      sessionId,
      revision: next.revision,
      payload: JSON.stringify(next),
    },
    update: {
      revision: next.revision,
      payload: JSON.stringify(next),
    },
  });
  return next;
}
