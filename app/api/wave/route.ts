import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { getOrCreateGuestSession, requireGuestSession, attachGuestCookie, hasConsent } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { buildWaveFromProposal, persistWaveMissionAndArtifacts } from "@/lib/db/persist-wave";
import { commitEvent, loadPublicSnapshot } from "@/lib/db/commit";
import { hashObject } from "@/lib/utils/hash";
import { makeEnvelope } from "@/lib/state/envelope";
import type { WaveMissionCommitted, AnswerSubmitted, WaveEndCommitted, InsightCommitted, SessionStarted } from "@/lib/state/events";
import type { Answer } from "@/lib/state/contracts";
import { makeWave1Questions, buildWave1Canonical, WAVE_1_ID, WAVE_1_VERSION } from "@/lib/interview/templates";
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

  if (isNew) {
    const started: SessionStarted = {
      guest_token_hash: session.token,
      expires_at: session.expiresAt.toISOString(),
    };
    const envelope = makeEnvelope("SESSION_STARTED", {
      session_id: session.id,
      actor: "system",
      base_revision: 0,
      idempotency_key: `session-start-${session.id}`,
      payload: started,
    });
    const result = await commitEvent(session.id, envelope);
    if (!result.ok) {
      console.error("Failed to commit SESSION_STARTED from /api/wave:", result.message);
    }
  }

  if (!hasConsent(session.consents, "ai")) {
    const response = NextResponse.json(
      { error: "AI consent required", missing: ["ai"] },
      { status: 403 }
    );
    if (isNew) attachGuestCookie(response, session.token);
    return response;
  }

  const memory = await loadOrCreateWorkingMemory(session.id);

  // Respect the XState ledger state when deciding whether to generate, resume or stop.
  const stateSnapshot = await loadPublicSnapshot(session.id);
  const stateValue = stateSnapshot ? (stateSnapshot.state_value_json as { value: unknown }).value : { interviewing: "orienting_wave" };

  const inRoutePhase = stateValue === "route_intents" || (typeof stateValue === "object" && stateValue !== null && "route_intents" in stateValue);
  const inAwaitingCalibration = typeof stateValue === "object" && stateValue !== null && (stateValue as any).interviewing === "awaiting_calibration";
  const inSynthesizing = typeof stateValue === "object" && stateValue !== null && (stateValue as any).interviewing === "synthesizing_wave";

  if (inRoutePhase) {
    const stop = evaluateStop(memory, await countSessionQuestions(session.id));
    const response = NextResponse.json({
      stop: true,
      can_generate: stop.canGenerate,
      provisional: stop.provisional,
      reason: stop.reason,
    });
    if (isNew) attachGuestCookie(response, session.token);
    return response;
  }

  if (inAwaitingCalibration || inSynthesizing) {
    const response = NextResponse.json({
      stop: true,
      can_generate: true,
      provisional: false,
      reason: "synthesizing",
    });
    if (isNew) attachGuestCookie(response, session.token);
    return response;
  }

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

    // Commit the canonical Wave 1 mission to the XState ledger.
    const snapshot = await loadPublicSnapshot(session.id);
    const stateValue = snapshot ? (snapshot.state_value_json as { value: unknown }).value : { interviewing: "orienting_wave" };
    const inAwaitingAnswers = typeof stateValue === "object" && stateValue !== null && (stateValue as any).interviewing === "awaiting_answers";

    if (!inAwaitingAnswers) {
      const provenanceId = randomUUID();
      const provenance = {
        id: provenanceId,
        session_id: session.id,
        proposal_id: provenanceId,
        correlation_id: randomUUID(),
        prompt_contract_revision: 3 as const,
        prompt_file_hash: hashObject("lib/interview/templates"),
        schema_hash: hashObject(makeWave1Questions()),
        context_builder_version: "template-v1",
        context_hash: hashObject({ wave_id: WAVE_1_ID, wave_index: 1 }),
        provider: "fixture",
        model: "fixture",
        model_config_json: {},
        model_config_hash: hashObject({}),
        fixture_suite_version: "template-v1",
        created_at: new Date().toISOString(),
      };
      const nextRevision = (snapshot?.revision ?? 0) + 1;
      const wave = buildWave1Canonical(session.id, provenanceId, nextRevision);
      const payload: WaveMissionCommitted = {
        proposal_id: provenance.proposal_id,
        generation_provenance: provenance,
        wave,
      };
      const envelope = makeEnvelope("WAVE_MISSION_COMMITTED", {
        session_id: session.id,
        actor: "host",
        base_revision: snapshot?.revision ?? 0,
        idempotency_key: `wave-${session.id}-${WAVE_1_ID}`,
        correlation_id: provenance.correlation_id,
        proposal_id: provenance.proposal_id,
        payload,
      });
      const result = await commitEvent(session.id, envelope);
      if (!result.ok) {
        console.error("Failed to commit WAVE_MISSION_COMMITTED for Wave 1:", result.message);
      }
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

  // Persist canonical v3 wave artifacts through the XState ledger.
  const proposal = interviewerOutput.proposal;
  if (proposal.mode === "open_wave") {
    const wave = buildWaveFromProposal(
      `w${nextIndex}`,
      nextIndex,
      proposal.mission,
      proposal.questions,
      memory.revision + 1
    );
    const provenanceId = randomUUID();
    const provenance = {
      id: provenanceId,
      session_id: session.id,
      proposal_id: provenanceId,
      correlation_id: randomUUID(),
      prompt_contract_revision: 3 as const,
      prompt_file_hash: hashObject("prompts/interviewer-v2.md"),
      schema_hash: hashObject(interviewerOutput.proposal),
      context_builder_version: "interviewer-v3",
      context_hash: hashObject(interviewerInput),
      provider: "fixture",
      model: "fixture",
      model_config_json: {},
      model_config_hash: hashObject({}),
      fixture_suite_version: "interviewer-v3",
      created_at: new Date().toISOString(),
    };
    const payload: WaveMissionCommitted = {
      proposal_id: provenance.proposal_id,
      generation_provenance: provenance,
      wave,
    };
    const snapshot = await loadPublicSnapshot(session.id);
    const envelope = makeEnvelope("WAVE_MISSION_COMMITTED", {
      session_id: session.id,
      actor: "interviewer",
      base_revision: snapshot?.revision ?? 0,
      idempotency_key: `wave-${session.id}-w${nextIndex}`,
      correlation_id: provenance.correlation_id,
      proposal_id: provenance.proposal_id,
      payload,
    });
    const result = await commitEvent(session.id, envelope);
    if (!result.ok) {
      console.error("Failed to commit WAVE_MISSION_COMMITTED:", result.message);
      // Transitional fallback: still persist domain records so tests and UI continue to work.
      await prisma.$transaction(async (tx) => {
        await persistWaveMissionAndArtifacts(tx, session.id, wave, provenance);
      });
    }
  }

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

  // Commit each answer to the XState ledger.
  const snapshot = await loadPublicSnapshot(session.id);
  let baseRevision = snapshot?.revision ?? 0;
  for (const createdAnswer of createdAnswers) {
    const question = questionById.get(createdAnswer.question_id)!;
    const sourceId = createdAnswer.id;
    const answer: Answer = {
      id: createdAnswer.id,
      question_id: question.id,
      source_ref: { source_id: sourceId, source_revision: 1 },
      selected_option_ids: Array.isArray(createdAnswer.value) ? createdAnswer.value : undefined,
      skipped: createdAnswer.skipped,
      created_from: "card",
    };
    const answerSource = {
      source_id: sourceId,
      session_id: session.id,
      revision: 1,
      kind: "question_answer" as const,
      created_at: createdAnswer.submitted_at,
      untrusted: false,
      text_ref: question.id,
    };
    const payload: AnswerSubmitted = { answer, source: answerSource, coverage: [] };
    const envelope = makeEnvelope("ANSWER_SUBMITTED", {
      session_id: session.id,
      actor: "user",
      base_revision: baseRevision,
      idempotency_key: `answer-${session.id}-${createdAnswer.id}`,
      payload,
    });
    const result = await commitEvent(session.id, envelope);
    if (result.ok) {
      baseRevision = result.nextRevision;
    } else {
      console.error("Failed to commit ANSWER_SUBMITTED:", result.message);
    }
  }

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

  // Commit wave end and insight to the XState ledger.
  const endProvenanceId = randomUUID();
  const endProvenance = {
    id: endProvenanceId,
    session_id: session.id,
    proposal_id: endProvenanceId,
    correlation_id: randomUUID(),
    prompt_contract_revision: 3 as const,
    prompt_file_hash: hashObject("prompts/sensemaker-wave-v2.md"),
    schema_hash: hashObject(output),
    context_builder_version: "sensemaker-wave-v1",
    context_hash: hashObject({ session_id: session.id, wave_id, answers: createdAnswers }),
    provider: "fixture",
    model: "fixture",
    model_config_json: {},
    model_config_hash: hashObject({}),
    fixture_suite_version: "sensemaker-wave-v1",
    created_at: new Date().toISOString(),
  };
  const waveEndPayload: WaveEndCommitted = {
    proposal_id: endProvenance.proposal_id,
    generation_provenance: endProvenance,
    wave_id,
    stop_reason: "mission_sufficient",
  };
  const waveEndEnvelope = makeEnvelope("WAVE_END_COMMITTED", {
    session_id: session.id,
    actor: "host",
    base_revision: baseRevision,
    idempotency_key: `wave-end-${session.id}-${wave_id}`,
    correlation_id: endProvenance.correlation_id,
    proposal_id: endProvenance.proposal_id,
    payload: waveEndPayload,
  });
  const waveEndResult = await commitEvent(session.id, waveEndEnvelope);
  if (waveEndResult.ok) {
    baseRevision = waveEndResult.nextRevision;

    const insightProvenanceId = randomUUID();
    const insightProvenance = {
      id: insightProvenanceId,
      session_id: session.id,
      proposal_id: insightProvenanceId,
      correlation_id: randomUUID(),
      prompt_contract_revision: 3 as const,
      prompt_file_hash: hashObject("prompts/sensemaker-wave-v2.md"),
      schema_hash: hashObject(output.insight),
      context_builder_version: "sensemaker-wave-v1",
      context_hash: hashObject({ memory: nextMemory, wave_id }),
      provider: "fixture",
      model: "fixture",
      model_config_json: {},
      model_config_hash: hashObject({}),
      fixture_suite_version: "sensemaker-wave-v1",
      created_at: new Date().toISOString(),
    };
    const raw = output.insight as any;
    const insightEvidence: any[] = createdAnswers.slice(0, 1).map((a) => ({
      source_id: a.id,
      source_revision: 1,
      excerpt: typeof a.value === "string" ? a.value : "",
      epistemic_status: "user_stated",
      evidence_shape: "concrete_scene",
      relevance: "支撑当前洞察",
    }));
    if (insightEvidence.length === 0) {
      insightEvidence.push({
        source_id: "system",
        source_revision: 1,
        excerpt: raw.observation ?? "无直接证据",
        epistemic_status: "user_stated",
        evidence_shape: "concrete_scene",
        relevance: "系统默认证据",
      });
    }
    const insightProposal: any = {
      wave_id,
      user_told_me: raw.observation ?? "用户完成本波问题",
      current_reading: raw.interpretation ?? "信息仍不足以形成明确理解",
      important_unknown: raw.uncertainty ?? "还需要更多具体经历",
      radar_deltas: [],
      route_impact: "继续聚焦当前决策",
      evidence: insightEvidence,
      status: "proposed",
      language_strength: raw.confidence === "high" ? "well_supported" : "tentative",
    };
    const sensemakerProposal: any = {
      base_revision: memory.revision,
      operations: output.operations,
      insight: insightProposal,
    };
    const insightPayload: InsightCommitted = {
      proposal_id: insightProvenance.proposal_id,
      generation_provenance: insightProvenance,
      proposal: sensemakerProposal,
      insight_status: "generated",
    };
    const insightEnvelope = makeEnvelope("INSIGHT_COMMITTED", {
      session_id: session.id,
      actor: "sensemaker",
      base_revision: baseRevision,
      idempotency_key: `insight-${session.id}-${wave_id}`,
      correlation_id: insightProvenance.correlation_id,
      proposal_id: insightProvenance.proposal_id,
      payload: insightPayload,
    });
    const insightResult = await commitEvent(session.id, insightEnvelope);
    if (!insightResult.ok) {
      console.error("Failed to commit INSIGHT_COMMITTED:", insightResult.message);
    }
  } else {
    console.error("Failed to commit WAVE_END_COMMITTED:", waveEndResult.message);
  }

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

export async function countSessionQuestions(sessionId: string): Promise<number> {
  return prisma.answer.count({ where: { sessionId } });
}

export function evaluateStop(memory: WorkingMemory, answeredQuestions: number): { stop: boolean; canGenerate: boolean; provisional: boolean; reason: string } {
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
