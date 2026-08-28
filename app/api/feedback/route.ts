import { NextResponse } from "next/server";
import { requireGuestSession, hasConsent } from "@/lib/auth/session";
import { loadOrCreateWorkingMemory, saveWorkingMemory } from "@/lib/working-memory/store";
import { applyInsightFeedback } from "@/lib/working-memory/operations";
import { randomUUID } from "node:crypto";
import type { InsightVerdict } from "@/lib/working-memory/types";
import type { NextRequest } from "next/server";

export async function POST(request: NextRequest) {
  const session = await requireGuestSession(request);
  if (!session) {
    return NextResponse.json({ error: "No active guest session" }, { status: 401 });
  }

  if (!hasConsent(session.consents, "ai")) {
    return NextResponse.json({ error: "AI consent required", missing: ["ai"] }, { status: 403 });
  }

  let body: {
    wave_id: string;
    verdict: string;
    correction?: string;
    next_interest?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { wave_id, verdict, correction, next_interest } = body;

  if (!wave_id || typeof verdict !== "string") {
    return NextResponse.json({ error: "wave_id and verdict required" }, { status: 400 });
  }

  const allowed = new Set<InsightVerdict>(["accurate", "partly_accurate", "inaccurate"]);
  if (!allowed.has(verdict as InsightVerdict)) {
    return NextResponse.json({ error: "Invalid verdict" }, { status: 400 });
  }

  const memory = await loadOrCreateWorkingMemory(session.id);

  const feedback = {
    id: randomUUID(),
    wave_id,
    verdict: verdict as InsightVerdict,
    correction,
    next_interest,
    created_at: new Date().toISOString(),
  };

  const { memory: nextMemory, invalidated } = applyInsightFeedback(memory, feedback);
  await saveWorkingMemory(session.id, nextMemory);

  return NextResponse.json({
    feedback,
    invalidated,
    revision: nextMemory.revision,
  });
}
