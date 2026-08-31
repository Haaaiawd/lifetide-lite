import { prisma } from "@/lib/db/prisma";
import { boundedChatThreadSchema } from "@/lib/working-memory/schema";
import type { BoundedChatThread, ChatMessage, FinalPlan, Id } from "@/lib/working-memory/types";

const CHAT_THREAD_KIND = "chat";

function makeThreadId() {
  return `thread_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function makeMessageId() {
  return `msg_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

export async function loadOrCreateChatThread(
  sessionId: Id,
  plan: FinalPlan
): Promise<BoundedChatThread> {
  const existing = await prisma.derivedContent.findFirst({
    where: { sessionId, kind: CHAT_THREAD_KIND, supportStatus: "supported" },
    orderBy: { createdAt: "desc" },
  });

  if (existing) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(existing.payload);
    } catch {
      console.warn(`Chat thread for ${sessionId} is not valid JSON; creating a new one.`);
    }

    if (parsed) {
      const result = boundedChatThreadSchema.safeParse(parsed);
      if (result.success) {
        const thread = result.data as BoundedChatThread;
        if (thread.final_plan_revision === plan.memory_revision) {
          return thread;
        }
      } else {
        console.warn(`Chat thread for ${sessionId} failed validation:`, result.error.flatten());
      }
    }
  }

  const newThread: BoundedChatThread = {
    id: makeThreadId(),
    session_id: sessionId,
    final_plan_revision: plan.memory_revision,
    turns_used: 0,
    status: "active",
    local_notes: [],
    messages: [],
  };

  await saveChatThread(sessionId, newThread);
  return newThread;
}

export async function saveChatThread(sessionId: Id, thread: BoundedChatThread): Promise<void> {
  await prisma.derivedContent.upsert({
    where: {
      id: thread.id,
    },
    create: {
      id: thread.id,
      sessionId,
      kind: CHAT_THREAD_KIND,
      payload: JSON.stringify(thread),
      supportStatus: thread.status === "active" ? "supported" : "stale",
    },
    update: {
      payload: JSON.stringify(thread),
      supportStatus: thread.status === "active" ? "supported" : "stale",
    },
  });
}

export function buildChatMessage(
  role: ChatMessage["role"],
  text: string,
  options: Partial<Omit<ChatMessage, "id" | "role" | "text" | "created_at">> = {}
): ChatMessage {
  return {
    id: makeMessageId(),
    role,
    text,
    ...options,
    created_at: new Date().toISOString(),
  };
}

export async function appendChatMessage(
  sessionId: Id,
  thread: BoundedChatThread,
  message: ChatMessage,
  extra?: { local_note?: string; close?: boolean }
): Promise<BoundedChatThread> {
  const next: BoundedChatThread = {
    ...thread,
    messages: [...thread.messages, message],
    turns_used: message.role === "user" ? thread.turns_used + 1 : thread.turns_used,
    local_notes: extra?.local_note
      ? [...thread.local_notes.slice(-7), extra.local_note].slice(-8)
      : thread.local_notes,
    status: extra?.close
      ? "closed_limit"
      : thread.status,
  };
  await saveChatThread(sessionId, next);
  return next;
}
