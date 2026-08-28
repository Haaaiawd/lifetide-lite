import { NextResponse } from "next/server";
import { getOrCreateGuestSession, requireGuestSession, attachGuestCookie, hasConsent } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { makeWave1Questions, WAVE_1_ID, WAVE_1_VERSION } from "@/lib/interview/templates";
import { runSensemakerWave } from "@/lib/ai/sensemaker/wave";
import { runInterviewer } from "@/lib/ai/interviewer";
import { selectedUncertainty, rankActiveUncertainties } from "@/lib/interview/uncertainty";
import { loadOrCreateWorkingMemory, saveWorkingMemory } from "@/lib/working-memory/store";
import { applyMemoryOperations } from "@/lib/working-memory/operations";
import type { InterviewAnswer, InterviewQuestion, InterviewerInput, WorkingMemory } from "@/lib/working-memory/types";
import type { NextRequest } from "next/server";

const MAX_WAVES = 4;
const MAX_QUESTIONS = 19;

export async function GET(request: NextRequest) {
  const { session, isNew } = await getOrCreateGuestSession(request);

  if (!hasConsent(session.consents, "ai")) {
    const response = NextResponse.json(
      { error: "AI consent required", missing: ["ai"] },
      { status: 403 }
    );
    if (isNew) attachGuestCookie(response, session.token);
    return response;
  }

  const memory = await loadOrCreateWorkingMemory(session.id);

  // Wave 1 is a versioned template.
  if (memory.last_wave_index === 0) {
    const existing = await prisma.wave.findUnique({
      where: { sessionId_wave_id: { sessionId: session.id, wave_id: WAVE_1_ID } },
    });

    if (!existing) {
      await prisma.wave.create({
        data: {
          sessionId: session.id,
          wave_id: WAVE_1_ID,
          wave_index: 1,
          focus_uncertainty_id: null,
          questions: JSON.stringify(makeWave1Questions()),
          status: "committed",
        },
      });
    }

    const response = NextResponse.json({
      wave_id: WAVE_1_ID,
      wave_index: 1,
      version: WAVE_1_VERSION,
      questions: makeWave1Questions(),
    });
    if (isNew) attachGuestCookie(response, session.token);
    return response;
  }

  // Resume or advance.
  const stop = evaluateStop(memory, await countSessionQuestions(session.id));
  if (stop.stop) {
    const response = NextResponse.json({
      stop: true,
      can_generate: stop.canGenerate,
      provisional: stop.provisional,
      reason: stop.reason,
    });
    if (isNew) attachGuestCookie(response, session.token);
    return response;
  }

  const nextIndex = memory.last_wave_index + 1;
  if (nextIndex > MAX_WAVES) {
    return NextResponse.json({ stop: true, can_generate: true, provisional: false, reason: "wave_limit" });
  }

  const existing = await prisma.wave.findUnique({
    where: { sessionId_wave_id: { sessionId: session.id, wave_id: `w${nextIndex}` } },
  });

  if (existing && existing.status === "committed") {
    const questions: InterviewQuestion[] = JSON.parse(existing.questions);
    const response = NextResponse.json({
      wave_id: existing.wave_id,
      wave_index: existing.wave_index,
      version: `${existing.wave_id}-adaptive`,
      focus_uncertainty_id: existing.focus_uncertainty_id,
      questions,
    });
    if (isNew) attachGuestCookie(response, session.token);
    return response;
  }

  // Generate a new adaptive wave.
  const ranked = rankActiveUncertainties(memory);
  if (!ranked.selectedId) {
    return NextResponse.json({
      stop: true,
      can_generate: true,
      provisional: true,
      reason: "no_active_uncertainty",
    });
  }

  const uncertainty = selectedUncertainty(memory);
  if (!uncertainty) {
    return NextResponse.json({
      stop: true,
      can_generate: true,
      provisional: true,
      reason: "no_active_uncertainty",
    });
  }

  const previousWaves = await prisma.wave.findMany({
    where: { sessionId: session.id },
    orderBy: { wave_index: "asc" },
  });

  const recentQuestionTexts: string[] = [];
  for (const w of previousWaves) {
    const qs: InterviewQuestion[] = JSON.parse(w.questions);
    for (const q of qs) recentQuestionTexts.push(q.text);
  }

  const relevantEvidence = memory.evidence.filter((e) => e.status === "active").slice(0, 8);
  const relevantConstraints = memory.constraints.filter((c) => c.status === "active").slice(0, 4);
  const latestFeedback = memory.recent_feedback[memory.recent_feedback.length - 1];

  const burden = await computeBurden(session.id, memory);

  const interviewerInput: InterviewerInput = {
    schema_version: "interviewer.input.v1",
    session_id: session.id,
    next_wave_id: `w${nextIndex}`,
    next_wave_index: nextIndex,
    selected_uncertainty_id: uncertainty.id,
    ranked_active_uncertainty_ids: [ranked.sorted[0].id, ...ranked.sorted.slice(1).map((u) => u.id)],
    selected_uncertainty: uncertainty,
    relevant_evidence: relevantEvidence,
    relevant_constraints: relevantConstraints,
    latest_feedback: latestFeedback,
    recent_question_texts: recentQuestionTexts.slice(-8),
    burden,
    prompt_version: "v0-draft",
  };

  const interviewerOutput = await runInterviewer(interviewerInput, memory);

  await prisma.wave.create({
    data: {
      sessionId: session.id,
      wave_id: `w${nextIndex}`,
      wave_index: nextIndex,
      focus_uncertainty_id: uncertainty.id,
      questions: JSON.stringify(interviewerOutput.questions),
      status: "committed",
    },
  });

  const response = NextResponse.json({
    wave_id: `w${nextIndex}`,
    wave_index: nextIndex,
    version: `${interviewerInput.next_wave_id}-adaptive`,
    focus_uncertainty_id: uncertainty.id,
    focus_reason: interviewerOutput.focus_reason,
    questions: interviewerOutput.questions,
  });
  if (isNew) attachGuestCookie(response, session.token);
  return response;
}

export async function POST(request: NextRequest) {
  const session = await requireGuestSession(request);
  if (!session) {
    return NextResponse.json({ error: "No active guest session" }, { status: 401 });
  }

  if (!hasConsent(session.consents, "ai")) {
    return NextResponse.json({ error: "AI consent required", missing: ["ai"] }, { status: 403 });
  }

  let body: { wave_id: string; answers: Array<{ question_id: string; value?: string | string[] | number; skipped?: boolean }> };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { wave_id, answers } = body;
  if (!wave_id || !Array.isArray(answers)) {
    return NextResponse.json({ error: "wave_id and answers array required" }, { status: 400 });
  }

  const wave = await prisma.wave.findUnique({
    where: { sessionId_wave_id: { sessionId: session.id, wave_id } },
  });

  if (!wave || wave.status !== "committed") {
    return NextResponse.json({ error: "Wave not available for submission" }, { status: 409 });
  }

  const questions: InterviewQuestion[] = JSON.parse(wave.questions);
  const questionById = new Map(questions.map((q) => [q.id, q]));

  if (answers.length !== questions.length) {
    return NextResponse.json(
      { error: "Answer count does not match question count" },
      { status: 400 }
    );
  }

  const now = new Date();
  const createdAnswers: InterviewAnswer[] = [];

  await prisma.$transaction(async (tx) => {
    for (const answer of answers) {
      const question = questionById.get(answer.question_id);
      if (!question) {
        throw new Error(`Unknown question: ${answer.question_id}`);
      }

      const skipped = answer.skipped ?? false;
      const value = skipped ? null : (answer.value ?? null);

      const created = await tx.answer.create({
        data: {
          sessionId: session.id,
          questionId: question.id,
          value: value === undefined ? null : Array.isArray(value) ? value.join("；") : String(value),
          skipped,
        },
      });

      createdAnswers.push({
        id: created.id,
        question_id: question.id,
        wave_id: question.wave_id,
        value: answer.value,
        skipped,
        submitted_at: created.createdAt.toISOString(),
      });
    }
  });

  const memory = await loadOrCreateWorkingMemory(session.id);
  const waveIndex = parseWaveIndex(wave_id);

  const output = await runSensemakerWave({
    schema_version: "sensemaker.wave.input.v1",
    session_id: session.id,
    wave_id,
    wave_index: waveIndex,
    focus_uncertainty_id: wave.focus_uncertainty_id ?? undefined,
    questions,
    answers: createdAnswers,
    memory,
    expected_revision: memory.revision,
    prompt_version: "v0-draft",
  });

  if (output.expected_revision !== memory.revision + 1) {
    return NextResponse.json({ error: "WorkingMemory revision mismatch" }, { status: 409 });
  }

  const nextMemory = applyMemoryOperations(memory, output.operations, { wave_id });
  await saveWorkingMemory(session.id, nextMemory);

  await prisma.wave.update({
    where: { id: wave.id },
    data: { status: "synthesized" },
  });

  return NextResponse.json(
    {
      wave_id,
      wave_index: waveIndex,
      revision: nextMemory.revision,
      insight: output.insight,
    },
    { status: 201 }
  );
}

function parseWaveIndex(waveId: string): number {
  const match = /^w(\d+)$/.exec(waveId);
  return match ? Number(match[1]) : 0;
}

async function countSessionQuestions(sessionId: string): Promise<number> {
  return prisma.answer.count({ where: { sessionId } });
}

function evaluateStop(memory: WorkingMemory, answeredQuestions: number): { stop: boolean; canGenerate: boolean; provisional: boolean; reason: string } {
  const hasRouteSeeds = memory.route_seeds.filter((r) => r.status === "active").length >= 3;
  const hasEvidence = memory.evidence.filter((e) => e.status === "active").length >= 1;

  if (memory.last_wave_index >= MAX_WAVES) {
    return { stop: true, canGenerate: hasRouteSeeds, provisional: false, reason: "wave_limit" };
  }

  if (answeredQuestions >= MAX_QUESTIONS) {
    return { stop: true, canGenerate: hasRouteSeeds, provisional: false, reason: "question_limit" };
  }

  // Sufficient for final after at least one adaptive wave.
  if (memory.last_wave_index >= 2 && hasRouteSeeds && hasEvidence) {
    return { stop: true, canGenerate: true, provisional: false, reason: "sufficient" };
  }

  return { stop: false, canGenerate: hasRouteSeeds, provisional: false, reason: "continue" };
}

async function computeBurden(sessionId: string, memory: WorkingMemory) {
  const allAnswers = await prisma.answer.findMany({
    where: { sessionId },
    orderBy: { createdAt: "asc" },
  });

  const total = allAnswers.length;
  const skipped = allAnswers.filter((a) => a.skipped).length;
  const skipRate = total > 0 ? skipped / total : 0;
  const lengths = allAnswers
    .filter((a) => !a.skipped && a.value)
    .map((a) => (a.value ? a.value.length : 0));
  const medianChars = lengths.length > 0 ? lengths.sort((a, b) => a - b)[Math.floor(lengths.length / 2)] : 0;

  const firstAnswer = allAnswers[0]?.createdAt;
  const elapsedMinutes = firstAnswer
    ? (Date.now() - new Date(firstAnswer).getTime()) / 1000 / 60
    : 0;

  return {
    median_answer_chars: medianChars,
    skip_rate: skipRate,
    elapsed_minutes: elapsedMinutes,
    user_requested_shorter: false,
  };
}
