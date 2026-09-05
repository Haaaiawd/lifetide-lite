import { NextRequest, NextResponse } from "next/server";
import { resolveSession } from "@/lib/auth/resolve";
import { loadOrCreateWorkingMemory } from "@/lib/working-memory/store";
import { prisma } from "@/lib/db/prisma";

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
  const hasPendingInsight = !!memory.last_insight;
  const hasStreamingInsight = !!memory.streaming_insight;

  // Check if there's a committed wave whose index is higher than
  // memory.last_wave_index. This happens when GET /api/wave created
  // a new wave but the user hasn't submitted answers yet (POST /api/wave).
  // In that case the user is mid-wave and should resume to the question
  // view, not the stop page.
  // "synthesizing" waves are included: a synthesis interrupted mid-stream
  // (client disconnect, server restart, stream error) leaves the wave in
  // that state, and it must surface as pending so the user can retry.
  const committedWaves = await prisma.wave.findMany({
    where: { sessionId: session.id, status: { in: ["committed", "synthesizing"] } },
    orderBy: { wave_index: "desc" },
    take: 1,
  });
  const latestCommittedWaveIndex = committedWaves.length > 0 ? committedWaves[0].wave_index : 0;
  const hasPendingWave = latestCommittedWaveIndex > waveIndex;
  const pendingWaveId = hasPendingWave ? committedWaves[0].wave_id : null;
  const pendingWaveQuestions = hasPendingWave ? JSON.parse(committedWaves[0].questions) : null;

  // Determine the step the user was at
  let lastStep: "question" | "stop" | "portrait" | "routes" | "insight" | "fresh" = "fresh";
  if (waveIndex === 0 && !hasPendingWave) {
    lastStep = "fresh";
  } else if (hasFinalPlan) {
    lastStep = "routes";
  } else if (hasPortrait) {
    lastStep = "portrait";
  } else if (hasStreamingInsight) {
    // A wave is currently being synthesized and the user left mid-stream.
    // Restore the partial insight card so they can see what was generating.
    lastStep = "insight";
  } else if (hasPendingInsight) {
    // User was on the insight/calibration page when they refreshed.
    // Restore them there instead of jumping to the stop page.
    lastStep = "insight";
  } else if (hasPendingWave) {
    // A wave was generated but not yet submitted — user is mid-wave.
    lastStep = "question";
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
      hasPendingInsight,
      hasStreamingInsight,
      hasPendingWave,
      pendingWaveId,
      pendingWaveIndex: hasPendingWave ? latestCommittedWaveIndex : null,
      pendingWaveQuestions,
      lastStep,
      lastInsight: memory.last_insight ?? null,
      streamingInsight: memory.streaming_insight ?? null,
    },
  });
}
