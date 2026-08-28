import { NextResponse } from "next/server";
import { requireGuestSession, hasConsent } from "@/lib/auth/session";
import { loadOrCreateWorkingMemory } from "@/lib/working-memory/store";
import { runSensemakerFinal } from "@/lib/ai/sensemaker/final";
import type { NextRequest } from "next/server";

export async function POST(request: NextRequest) {
  const session = await requireGuestSession(request);
  if (!session) {
    return NextResponse.json({ error: "No active guest session" }, { status: 401 });
  }

  if (!hasConsent(session.consents, "ai")) {
    return NextResponse.json({ error: "AI consent required", missing: ["ai"] }, { status: 403 });
  }

  const memory = await loadOrCreateWorkingMemory(session.id);

  if (memory.last_wave_index === 0) {
    return NextResponse.json({ error: "Complete at least Wave 1 before generating plans" }, { status: 400 });
  }

  const plan = await runSensemakerFinal(session.id, memory);
  return NextResponse.json(plan);
}
