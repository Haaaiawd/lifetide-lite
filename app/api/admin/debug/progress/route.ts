import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireAdmin } from "@/lib/auth/admin";

// GET /api/admin/debug/progress?session_id=xxx
// Admin-only: returns a readable conversation progress view with
// Q&A dialogue, six-dimensional radar states, and insight cards.
export async function GET(request: NextRequest) {
  const { response } = await requireAdmin(request);
  if (response) return response;

  const sessionId = request.nextUrl.searchParams.get("session_id");
  if (!sessionId) {
    return NextResponse.json({ error: "session_id is required" }, { status: 400 });
  }

  const { session, waves, answers, workingMemory } = await prisma.$transaction(async (tx) => {
    const session = await tx.session.findUnique({
      where: { id: sessionId },
      include: { user: true },
    });
    if (!session) {
      return { session: null, waves: [], answers: [], workingMemory: null };
    }
    const [waves, answers, workingMemory] = await Promise.all([
      tx.wave.findMany({
        where: { sessionId },
        orderBy: { wave_index: "asc" },
      }),
      tx.answer.findMany({
        where: { sessionId },
        orderBy: { createdAt: "asc" },
      }),
      tx.workingMemory.findUnique({ where: { sessionId } }),
    ]);
    return { session, waves, answers, workingMemory };
  });

  if (!session) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  const wm = workingMemory ? JSON.parse(workingMemory.payload) : null;

  // Build dialogue: wave by wave, question + answer pairs
  const dialogue = waves.map((w) => {
    const questions = JSON.parse(w.questions) as Array<{ id: string; text: string; type?: string }>;
    const qaPairs = questions.map((q) => {
      const ans = answers.find((a) => a.questionId === q.id);
      return {
        question_id: q.id,
        question_text: q.text,
        question_type: q.type ?? "open",
        answer_value: ans ? (ans.skipped ? "(跳过)" : ans.value) : null,
        answered_at: ans ? ans.createdAt.toISOString() : null,
      };
    });
    return {
      wave_index: w.wave_index,
      wave_id: w.wave_id,
      status: w.status,
      created_at: w.createdAt.toISOString(),
      qa_pairs: qaPairs,
    };
  });

  // Build radar summary
  const radar = wm?.radar
    ? Object.entries(wm.radar).map(([dim, cell]: [string, any]) => ({
        dimension: dim,
        state: cell.state,
        reason: cell.reason,
        evidence_count: cell.evidence?.length ?? 0,
        updated_at: cell.updated_at,
      }))
    : [];

  // Build insights summary (all insights from working memory history)
  // last_insight is the most recent; we also extract radar_deltas from it
  const lastInsight = wm?.last_insight
    ? {
        wave_id: wm.last_insight.wave_id,
        user_told_me: wm.last_insight.user_told_me,
        current_reading: wm.last_insight.current_reading,
        important_unknown: wm.last_insight.important_unknown,
        route_impact: wm.last_insight.route_impact,
        language_strength: wm.last_insight.language_strength,
        radar_deltas: wm.last_insight.radar_deltas ?? [],
        generated_at: wm.last_insight.generated_at,
      }
    : null;

  // Route intents
  const routeIntents = wm?.route_intents
    ? wm.route_intents.map((r: any) => ({
        id: r.id,
        label: r.label ?? r.title ?? r.intent,
        status: r.status,
        evidence_count: r.evidence?.length ?? 0,
      }))
    : [];

  // Portrait
  const portrait = wm?.persona_portrait
    ? {
        essence: wm.persona_portrait.essence,
        trait_summary: wm.persona_portrait.trait_summary,
        generated: true,
      }
    : null;

  // Final plan
  const finalPlan = wm?.finalPlan
    ? {
        lives: wm.finalPlan.lives?.map((l: any) => ({
          title: l.title ?? l.label,
          ordinary_day_summary: l.ordinary_day?.summary ?? l.ordinary_day?.anchor,
        })),
        generated: true,
      }
    : null;

  return NextResponse.json({
    meta: {
      session_id: sessionId,
      user_email: session.user?.email ?? "guest",
      created_at: session.createdAt.toISOString(),
      last_wave_index: wm?.last_wave_index ?? 0,
      revision: workingMemory?.revision ?? 0,
    },
    dialogue,
    radar,
    last_insight: lastInsight,
    route_intents: routeIntents,
    portrait,
    final_plan: finalPlan,
    streaming_insight: wm?.streaming_insight
      ? { partial: true, user_told_me: wm.streaming_insight.user_told_me }
      : null,
  });
}
