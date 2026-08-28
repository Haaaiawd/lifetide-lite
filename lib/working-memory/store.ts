import { prisma } from "@/lib/db/prisma";
import { workingMemorySchema } from "./schema";
import { makeEmptyWorkingMemory, type WorkingMemory } from "./types";

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
