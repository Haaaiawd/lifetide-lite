import { NextRequest, NextResponse } from "next/server";
import { resolveSession } from "@/lib/auth/resolve";
import { loadOrCreateWorkingMemory } from "@/lib/working-memory/store";

// GET /api/progress — returns the user's current progress for resume logic.
export async function GET(request: NextRequest) {
  const { session, isAuthed, user } = await resolveSession(request);
  if (!session) {
    return NextResponse.json({ error: "No active session" }, { status: 401 });
  }

  const memory = await loadOrCreateWorkingMemory(session.id);

  const hasPortrait = !!memory.persona_portrait;
  const hasFinalPlan = !!memory.finalPlan;
  const waveIndex = memory.last_wave_index;

  // Determine the step the user was at
  let lastStep: "question" | "stop" | "portrait" | "routes" | "fresh" = "fresh";
  if (waveIndex === 0) {
    lastStep = "fresh";
  } else if (hasFinalPlan) {
    lastStep = "routes";
  } else if (hasPortrait) {
    lastStep = "portrait";
  } else if (waveIndex > 0) {
    lastStep = "stop";
  }

  return NextResponse.json({
    authenticated: isAuthed,
    user: user ? { email: user.email } : null,
    progress: {
      waveIndex,
      hasPortrait,
      hasFinalPlan,
      lastStep,
    },
  });
}
