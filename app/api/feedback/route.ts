import { NextResponse } from "next/server";
import { requireGuestSession, hasConsent } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { loadOrCreateWorkingMemory, saveWorkingMemory } from "@/lib/working-memory/store";
import { applyInsightFeedback } from "@/lib/working-memory/operations";
import { commitEvent, loadPublicSnapshot } from "@/lib/db/commit";
import { makeEnvelope } from "@/lib/state/envelope";
import { hashObject } from "@/lib/utils/hash";
import { evaluateStop, countSessionQuestions } from "@/app/api/wave/route";
import { randomUUID } from "node:crypto";
import type { InsightVerdict } from "@/lib/working-memory/types";
import type { CalibrationSubmitted, CalibrationSkipped, NextWaveCommitted, RoutePhaseEntered } from "@/lib/state/events";
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

  // Commit calibration to the XState ledger and decide next phase.
  const snapshot = await loadPublicSnapshot(session.id);
  let baseRevision = snapshot?.revision ?? 0;

  const stop = evaluateStop(nextMemory, await countSessionQuestions(session.id));

  if (verdict !== "inaccurate") {
    const sourceId = feedback.id;
    const calibration: CalibrationSubmitted["calibration"] = {
      id: feedback.id,
      insight_id: wave_id,
      verdict: verdict as "accurate" | "partly_accurate" | "inaccurate",
      correction_text: correction,
      preferred_direction: next_interest === "继续" ? "continue_here" : next_interest === "预览" ? "preview" : next_interest === "暂停" ? "pause" : undefined,
      source_ref: { source_id: sourceId, source_revision: 1 },
    };
    const source = {
      source_id: sourceId,
      session_id: session.id,
      revision: 1,
      kind: "calibration" as const,
      created_at: feedback.created_at,
      untrusted: false,
      text_ref: wave_id,
    };
    const calPayload: CalibrationSubmitted = { calibration, source };
    const calEnvelope = makeEnvelope("CALIBRATION_SUBMITTED", {
      session_id: session.id,
      actor: "user",
      base_revision: baseRevision,
      idempotency_key: `calibration-${session.id}-${wave_id}`,
      payload: calPayload,
    });
    const calResult = await commitEvent(session.id, calEnvelope);
    if (calResult.ok) {
      baseRevision = calResult.nextRevision;
    } else {
      console.error("Failed to commit CALIBRATION_SUBMITTED:", calResult.message);
    }
  } else {
    const skippedPayload: CalibrationSkipped = {
      insight_id: wave_id,
      explicitly_skipped: true,
    };
    const skippedEnvelope = makeEnvelope("CALIBRATION_SKIPPED", {
      session_id: session.id,
      actor: "user",
      base_revision: baseRevision,
      idempotency_key: `calibration-skip-${session.id}-${wave_id}`,
      payload: skippedPayload,
    });
    const skipResult = await commitEvent(session.id, skippedEnvelope);
    if (skipResult.ok) {
      baseRevision = skipResult.nextRevision;
    } else {
      console.error("Failed to commit CALIBRATION_SKIPPED:", skipResult.message);
    }
  }

  if (stop.stop) {
    const routeProvenanceId = randomUUID();
    const routeProvenance = {
      id: routeProvenanceId,
      session_id: session.id,
      proposal_id: routeProvenanceId,
      correlation_id: randomUUID(),
      prompt_contract_revision: 3 as const,
      prompt_file_hash: hashObject("app/api/feedback"),
      schema_hash: hashObject(nextMemory),
      context_builder_version: "feedback-v1",
      context_hash: hashObject({ verdict, next_interest }),
      provider: "fixture",
      model: "fixture",
      model_config_json: {},
      model_config_hash: hashObject({}),
      fixture_suite_version: "feedback-v1",
      created_at: new Date().toISOString(),
    };
    const routeReasonMap: Record<string, RoutePhaseEntered["reason"]> = {
      wave_limit: "wave_cap",
      question_limit: "wave_cap",
      sufficient: "mission_sufficient",
      continue: "mission_sufficient",
    };
    const routePayload: RoutePhaseEntered = {
      reason: routeReasonMap[stop.reason] ?? "mission_sufficient",
      interview_snapshot_revision: baseRevision,
    };
    const routeEnvelope = makeEnvelope("ROUTE_PHASE_ENTERED", {
      session_id: session.id,
      actor: "host",
      base_revision: baseRevision,
      idempotency_key: `route-phase-${session.id}-${wave_id}`,
      correlation_id: routeProvenance.correlation_id,
      proposal_id: routeProvenance.proposal_id,
      payload: routePayload,
    });
    const routeResult = await commitEvent(session.id, routeEnvelope);
    if (!routeResult.ok) {
      console.error("Failed to commit ROUTE_PHASE_ENTERED:", routeResult.message);
    }
  } else {
    const nextProvenanceId = randomUUID();
    const nextProvenance = {
      id: nextProvenanceId,
      session_id: session.id,
      proposal_id: nextProvenanceId,
      correlation_id: randomUUID(),
      prompt_contract_revision: 3 as const,
      prompt_file_hash: hashObject("app/api/feedback"),
      schema_hash: hashObject(nextMemory),
      context_builder_version: "feedback-v1",
      context_hash: hashObject({ verdict, next_interest }),
      provider: "fixture",
      model: "fixture",
      model_config_json: {},
      model_config_hash: hashObject({}),
      fixture_suite_version: "feedback-v1",
      created_at: new Date().toISOString(),
    };
    const nextPayload: NextWaveCommitted = { kind: "core" };
    const nextEnvelope = makeEnvelope("NEXT_WAVE_COMMITTED", {
      session_id: session.id,
      actor: "host",
      base_revision: baseRevision,
      idempotency_key: `next-wave-${session.id}-${wave_id}`,
      correlation_id: nextProvenance.correlation_id,
      proposal_id: nextProvenance.proposal_id,
      payload: nextPayload,
    });
    const nextResult = await commitEvent(session.id, nextEnvelope);
    if (!nextResult.ok) {
      console.error("Failed to commit NEXT_WAVE_COMMITTED:", nextResult.message);
    }
  }

  return NextResponse.json({
    feedback,
    invalidated,
    revision: nextMemory.revision,
  });
}
