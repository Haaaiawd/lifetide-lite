import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { resolveSession } from "@/lib/auth/resolve";
import { hasConsent } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { buildWaveFromProposal, persistWaveMissionAndArtifacts } from "@/lib/db/persist-wave";
import { commitEvent, loadPublicSnapshot } from "@/lib/db/commit";
import { hashObject } from "@/lib/utils/hash";
import { makeEnvelope } from "@/lib/state/envelope";
import { getProviderConfig } from "@/lib/ai/client";
import type {
  WaveMissionCommitted,
  AnswerSubmitted,
  WaveEndCommitted,
  InsightCommitted,
  SessionStarted,
} from "@/lib/state/events";
import type { Answer, SourceVersion, SourceHead } from "@/lib/state/contracts";
import { makeWave1Questions, buildWave1Canonical, WAVE_1_ID, WAVE_1_VERSION } from "@/lib/interview/templates";
import { runSensemakerWave, runSensemakerWaveStream } from "@/lib/ai/sensemaker/wave";
import { runWave1Sensemaker } from "@/lib/ai/sensemaker/wave1";
import { runInterviewer } from "@/lib/ai/interviewer";
import { selectedUncertainty, rankActiveUncertainties } from "@/lib/interview/uncertainty";
import { deriveShortQuestion } from "@/lib/interview/derive-question";
import { loadOrCreateWorkingMemory, saveWorkingMemory } from "@/lib/working-memory/store";
import { applyMemoryOperations } from "@/lib/working-memory/operations";
import { recomputeUncertaintyPriority } from "@/lib/working-memory/types";
import type { InterviewAnswer, InterviewQuestion, InterviewerInput, Uncertainty, WorkingMemory } from "@/lib/working-memory/types";
import { loadUploadChunks } from "@/lib/uploads/load-chunks";
import type { NextRequest } from "next/server";

const MAX_WAVES = 6;
const MAX_QUESTIONS = 50;

function isActiveSourceVersion(memory: WorkingMemory, sv: SourceVersion): boolean {
  if (sv.untrusted) return false;
  const head = memory.source_heads.find((h) => h.source_id === sv.source_id);
  return head?.status === "active" && head.active_revision === sv.revision;
}

function isActiveSourceRef(memory: WorkingMemory, sourceId: string, revision: number): boolean {
  const head = memory.source_heads.find((h) => h.source_id === sourceId);
  return head?.status === "active" && head.active_revision === revision;
}

function activeSourceVersions(memory: WorkingMemory): SourceVersion[] {
  return memory.source_versions.filter((sv) => isActiveSourceVersion(memory, sv));
}

function seedUncertaintyIfEmpty(
  memory: WorkingMemory,
  waveIndex: number,
  importantUnknown: string,
  evidence: { source_id: string; source_revision: number }[],
): void {
  // Only seed if there are no active uncertainties.
  // Inactive/deleted/declined uncertainties should not block re-seeding.
  if (memory.uncertainties.some((u) => u.status === "active")) return;

  const routeIntentIds = memory.route_intents
    .filter((r) => r.status === "seed" || r.status === "accepted")
    .map((r) => r.id)
    .slice(0, 3);

  const factors = {
    plan_impact: 3,
    evidence_gap: 2,
    user_salience: 3,
    reversibility_value: 2,
    sensitivity_cost: 0,
    repetition_cost: 0,
  } as const;

  const uncertainty: Uncertainty = {
    id: randomUUID(),
    // important_unknown is a statement ("我暂不知晓的是……"), not a question.
    // Store it as the topic (background context), not as question text.
    topic: importantUnknown,
    // Derive a short, generic question from the topic — never embed the full statement.
    question: deriveShortQuestion(importantUnknown),
    plan_consequence: "答案会决定路线更偏向组织内延续、邻近转向还是释放型探索。",
    related_evidence: evidence.map((e) => ({
      source_id: e.source_id,
      source_revision: e.source_revision,
      epistemic_status: "working_inference",
      evidence_shape: "abstract_statement",
      relevance: "本波 insight 提出的关键未知",
    })),
    related_route_intent_ids: routeIntentIds as [string, ...string[]],
    factors,
    priority: recomputeUncertaintyPriority(factors),
    created_wave: waveIndex,
    status: "active",
  };

  memory.uncertainties.push(uncertainty);
}

export async function GET(request: NextRequest) {
  const { session } = await resolveSession(request);
  if (!session) {
    return NextResponse.json({ error: "No active session" }, { status: 401 });
  }

  // Ensure a SESSION_STARTED event exists for this session.
  const existingSnapshot = await loadPublicSnapshot(session.id);
  if (!existingSnapshot) {
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
    return NextResponse.json(
      { error: "AI consent required", missing: ["ai"] },
      { status: 403 }
    );
  }

  const memory = await loadOrCreateWorkingMemory(session.id);

  // Respect the XState ledger state when deciding whether to generate, resume or stop.
  const stateSnapshot = await loadPublicSnapshot(session.id);
  const stateValue = stateSnapshot ? (stateSnapshot.state_value_json as { value: unknown }).value : { interviewing: "orienting_wave" };

  const inRoutePhase = stateValue === "route_intents" || (typeof stateValue === "object" && stateValue !== null && "route_intents" in stateValue);
  const inAwaitingCalibration = typeof stateValue === "object" && stateValue !== null && (stateValue as any).interviewing === "awaiting_calibration";
  const inSynthesizing = typeof stateValue === "object" && stateValue !== null && (stateValue as any).interviewing === "synthesizing_wave";
  const finalOrTrialStates = new Set(["parallel_lives_ready", "trial_active", "bounded_reflection"]);
  const inFinalOrTrialPhase =
    (typeof stateValue === "string" && finalOrTrialStates.has(stateValue)) ||
    (typeof stateValue === "object" && stateValue !== null && finalOrTrialStates.has(Object.keys(stateValue as object)[0] ?? ""));

  if (inFinalOrTrialPhase) {
    const stop = evaluateStop(memory, await countSessionQuestions(session.id));
    const response = NextResponse.json({
      stop: true,
      can_generate: stop.canGenerate,
      provisional: stop.provisional,
      reason: "final_or_trial_phase",
    });
    return response;
  }

  if (inRoutePhase) {
    const stop = evaluateStop(memory, await countSessionQuestions(session.id));
    const response = NextResponse.json({
      stop: true,
      can_generate: stop.canGenerate,
      provisional: stop.provisional,
      reason: stop.reason,
    });
    return response;
  }

  if (inSynthesizing) {
    const response = NextResponse.json({
      stop: true,
      can_generate: true,
      provisional: false,
      reason: "synthesizing",
    });
    return response;
  }

  // Allow GET during awaiting_calibration only when prefetch=1 is set.
  // This lets the client generate the next wave while the user reads the insight.
  // Normal GET (without prefetch) still returns stop, preserving the
  // submit → feedback → next-wave flow for tests and non-prefetch clients.
  const isPrefetch = new URL(request.url).searchParams.get("prefetch") === "1";
  if (inAwaitingCalibration && !isPrefetch) {
    const response = NextResponse.json({
      stop: true,
      can_generate: true,
      provisional: false,
      reason: "synthesizing",
    });
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
      const config = getProviderConfig();
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
        provider: config.provider,
        model: config.model,
        model_config_json: { provider: config.provider, model: config.model },
        model_config_hash: hashObject({ provider: config.provider, model: config.model }),
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
    return response;
  }

  // Generate a new adaptive wave.
  const ranked = rankActiveUncertainties(memory);
  if (!ranked.selectedId) {
    return NextResponse.json({
      stop: true,
      can_generate: true,
      provisional: false,
      reason: "no_active_uncertainty",
    });
  }

  const uncertainty = selectedUncertainty(memory);
  if (!uncertainty) {
    return NextResponse.json({
      stop: true,
      can_generate: true,
      provisional: false,
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

  const relevantEvidence = activeSourceVersions(memory)
    .filter((sv) => sv.kind === "question_answer")
    .slice(0, 8);
  const relevantConstraints = memory.constraints.filter((c) => c.status === "active").slice(0, 4);
  const latestFeedback = memory.recent_feedback[memory.recent_feedback.length - 1];
  // Keep last 3 feedback entries so the Interviewer sees accumulated calibration,
  // not just the most recent one (issue #20).
  const recentFeedback = memory.recent_feedback.slice(-3);

  // Extract Q&A text from the most recent completed wave so the Interviewer
  // can build on actual answers instead of repeating similar questions (issue #18).
  const lastWave = previousWaves[previousWaves.length - 1];
  let lastWaveAnswers: { question_text: string; answer_text: string }[] | undefined;
  if (lastWave) {
    const lastWaveQuestions: InterviewQuestion[] = JSON.parse(lastWave.questions);
    const lastWaveAnswerRows = await prisma.answer.findMany({
      where: { sessionId: session.id },
      orderBy: { createdAt: "asc" },
    });
    // Build a map of questionId -> raw answer value for quick lookup.
    const answerMap = new Map<string, string>();
    for (const a of lastWaveAnswerRows) {
      if (a.value && !answerMap.has(a.questionId)) {
        answerMap.set(a.questionId, a.value);
      }
    }
    lastWaveAnswers = lastWaveQuestions
      .map((q) => {
        const raw = answerMap.get(q.id);
        if (!raw) return null;
        // Resolve option IDs to labels for choice questions.
        // Stored answer may be a single option id, comma-joined ids, or free text.
        let answerText = raw;
        if (q.options && q.options.length > 0) {
          const optionMap = new Map(q.options.map((o) => [o.id, o.label]));
          const ids = raw.split(",").map((s) => s.trim());
          const resolved = ids.map((id) => optionMap.get(id) ?? id);
          answerText = resolved.join(", ");
        }
        return {
          question_text: q.text,
          answer_text: answerText,
        };
      })
      .filter((qa): qa is { question_text: string; answer_text: string } => qa !== null);
    if (lastWaveAnswers.length === 0) lastWaveAnswers = undefined;
  }

  const burden = await computeBurden(session.id, memory);

  const uploadChunks = await loadUploadChunks(session.id);

  const interviewerInput: InterviewerInput = {
    schema_version: "interviewer.input.v3",
    session_id: session.id,
    next_wave_id: `w${nextIndex}`,
    next_wave_index: nextIndex,
    selected_uncertainty_id: uncertainty.id,
    ranked_active_uncertainty_ids: [ranked.sorted[0].id, ...ranked.sorted.slice(1).map((u) => u.id)],
    selected_uncertainty: uncertainty,
    relevant_evidence: relevantEvidence,
    relevant_constraints: relevantConstraints,
    latest_feedback: latestFeedback,
    recent_feedback: recentFeedback.length > 0 ? recentFeedback : undefined,
    recent_question_texts: recentQuestionTexts.slice(-8),
    last_wave_answers: lastWaveAnswers,
    upload_chunks: uploadChunks && uploadChunks.length > 0 ? uploadChunks : undefined,
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
    const config = getProviderConfig();
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
      provider: config.provider,
      model: config.model,
      model_config_json: { provider: config.provider, model: config.model },
      model_config_hash: hashObject({ provider: config.provider, model: config.model }),
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
  return response;
}

export async function POST(request: NextRequest) {
  const { session } = await resolveSession(request);
  if (!session) {
    return NextResponse.json({ error: "No active session" }, { status: 401 });
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
          value: value === undefined || value === null
            ? null
            : Array.isArray(value)
              ? value.filter((v) => v !== null && v !== undefined && v !== "").join("；")
              : String(value),
          skipped,
        },
      });

      createdAnswers.push({
        id: created.id,
        question_id: question.id,
        wave_id: question.wave_id,
        // Preserve the original structured value (array for multi-select,
        // string for text/choice) for the ledger and sensemaker envelope.
        // The DB stores a joined string for schema compatibility, but the
        // in-memory representation must stay structured so that:
        // 1. selected_option_ids in the ledger keeps the choice array
        // 2. buildWaveEnvelope can resolve option IDs to labels
        value: skipped ? undefined : (answer.value ?? undefined),
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
    const answerSource: SourceVersion = {
      source_id: sourceId,
      session_id: session.id,
      revision: 1,
      kind: "question_answer",
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

  // Register the new source versions in WorkingMemory before the sensemaker reads them.
  for (const createdAnswer of createdAnswers) {
    const question = questionById.get(createdAnswer.question_id)!;
    const sourceVersion: SourceVersion = {
      source_id: createdAnswer.id,
      session_id: session.id,
      revision: 1,
      kind: "question_answer",
      created_at: createdAnswer.submitted_at,
      untrusted: false,
      text_ref: question.id,
    };
    const sourceHead: SourceHead = {
      session_id: session.id,
      source_id: createdAnswer.id,
      active_revision: 1,
      status: "active",
    };
    memory.source_versions.push(sourceVersion);
    memory.source_heads.push(sourceHead);
  }

  const endProvenanceId = randomUUID();
  const endProvenanceCorrelationId = randomUUID();

  // Stream partial insight text to the client via SSE while AI is generating.
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const sendSSE = (event: string, data: unknown) => {
        controller.enqueue(encoder.encode(`event: ${event}\n`));
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };

      try {
        const output = await runSensemakerWaveStream(
          {
            schema_version: "sensemaker.wave.input.v3",
            session_id: session.id,
            wave_id,
            wave_index: waveIndex,
            focus_uncertainty_id: wave.focus_uncertainty_id ?? undefined,
            questions,
            answers: createdAnswers,
            memory,
            upload_chunks: await loadUploadChunks(session.id),
            expected_revision: memory.revision,
            prompt_version: "v0-draft",
          },
          (partial) => {
            sendSSE("partial", partial);
          }
        );

        if (output.expected_revision !== memory.revision + 1) {
          sendSSE("error", { error: "WorkingMemory revision mismatch" });
          controller.close();
          return;
        }

        // Apply memory operations. If operations contain invalid evidence
        // references (AI hallucinated source_ids), fall back to empty operations
        // rather than failing the entire wave — the insight is still valid,
        // just without new claims/constraints/route-intents.
        // Track which operations were actually applied so the ledger only
        // records what was committed to WorkingMemory.
        let nextMemory: WorkingMemory;
        let appliedOperations: typeof output.operations;
        try {
          nextMemory = applyMemoryOperations(memory, output.operations, {
            wave_id,
            generation_provenance_id: endProvenanceId,
          });
          appliedOperations = output.operations;
        } catch (opErr) {
          console.error("Memory operations failed, using empty operations:", opErr instanceof Error ? opErr.message : "unknown");
          appliedOperations = [];
          nextMemory = applyMemoryOperations(memory, [], {
            wave_id,
            generation_provenance_id: endProvenanceId,
          });
        }

        if (!nextMemory.uncertainties.some((u) => u.status === "active")) {
          // Only seed uncertainty with evidence that points to active sources.
          const validInsightEvidence = output.insight.evidence.filter((e) =>
            isActiveSourceRef(nextMemory, e.source_id, e.source_revision)
          );
          seedUncertaintyIfEmpty(
            nextMemory,
            waveIndex,
            output.insight.important_unknown,
            validInsightEvidence.length > 0 ? validInsightEvidence : output.insight.evidence
          );
        }

        const config = getProviderConfig();
        const promptFileHash = wave_id === "w1" ? hashObject("lib/ai/sensemaker/wave1") : hashObject("prompts/sensemaker-wave-v2.md");
        const endProvenance = {
          id: endProvenanceId,
          session_id: session.id,
          proposal_id: endProvenanceId,
          correlation_id: endProvenanceCorrelationId,
          prompt_contract_revision: 3 as const,
          prompt_file_hash: promptFileHash,
          schema_hash: hashObject(output),
          context_builder_version: "sensemaker-wave-v3",
          context_hash: hashObject({ session_id: session.id, wave_id, answers: createdAnswers }),
          provider: config.provider,
          model: config.model,
          model_config_json: { provider: config.provider, model: config.model },
          model_config_hash: hashObject({ provider: config.provider, model: config.model }),
          fixture_suite_version: "sensemaker-wave-v3",
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

          const insightProposal = {
            base_revision: output.base_revision,
            operations: appliedOperations,
            insight: output.insight,
          };
          const insightPayload: InsightCommitted = {
            proposal_id: endProvenance.proposal_id,
            generation_provenance: endProvenance,
            proposal: insightProposal,
            insight_status: "generated",
          };
          const insightEnvelope = makeEnvelope("INSIGHT_COMMITTED", {
            session_id: session.id,
            actor: "sensemaker",
            base_revision: baseRevision,
            idempotency_key: `insight-${session.id}-${wave_id}`,
            correlation_id: endProvenance.correlation_id,
            proposal_id: endProvenance.proposal_id,
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

        const fullInsight = {
          ...output.insight,
          id: randomUUID(),
          wave_id,
          generation_provenance_id: endProvenanceId,
          generated_at: now.toISOString(),
          status: "generated" as const,
        };

        // Store insight in WorkingMemory for resume after page refresh.
        // The user can refresh while on the insight page; without this,
        // progress API can't tell the user was mid-calibration and they
        // get sent to the stop page instead.
        nextMemory.last_insight = fullInsight;
        await saveWorkingMemory(session.id, nextMemory);

        sendSSE("done", {
          wave_id,
          wave_index: waveIndex,
          revision: nextMemory.revision,
          insight: fullInsight,
        });
        controller.close();
      } catch (err) {
        console.error("Wave SSE stream error:", err);
        sendSSE("error", { error: err instanceof Error ? err.message : "Unknown error" });
        controller.close();
      }
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}

function parseWaveIndex(waveId: string): number {
  const match = /^w(\d+)$/.exec(waveId);
  return match ? Number(match[1]) : 0;
}

export async function countSessionQuestions(sessionId: string): Promise<number> {
  return prisma.answer.count({ where: { sessionId } });
}

export function evaluateStop(memory: WorkingMemory, answeredQuestions: number): { stop: boolean; canGenerate: boolean; provisional: boolean; reason: string } {
  const activeRouteIntents = memory.route_intents.filter((r) => r.status === "seed" || r.status === "accepted");
  const hasRouteIntents = activeRouteIntents.length >= 3;
  const hasEvidence = activeSourceVersions(memory).length >= 1;

  if (memory.last_wave_index >= MAX_WAVES) {
    return { stop: true, canGenerate: hasRouteIntents, provisional: false, reason: "wave_limit" };
  }

  if (answeredQuestions >= MAX_QUESTIONS) {
    return { stop: true, canGenerate: hasRouteIntents, provisional: false, reason: "question_limit" };
  }

  // Sufficient for final after at least four waves (wave1 is fixed template,
  // so AI-driven waves 2-4 must have had a chance to cover the radar).
  if (memory.last_wave_index >= 4 && hasRouteIntents && hasEvidence) {
    return { stop: true, canGenerate: true, provisional: false, reason: "sufficient" };
  }

  return { stop: false, canGenerate: hasRouteIntents, provisional: false, reason: "continue" };
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
