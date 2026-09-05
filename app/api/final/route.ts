import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { resolveSession, hasConsent } from "@/lib/auth/resolve";
import { loadOrCreateWorkingMemory, saveWorkingMemory } from "@/lib/working-memory/store";
import { runSensemakerFinal, buildPrototypesForPlan, FinalGenerationError } from "@/lib/ai/sensemaker/final";
import { commitEvent, loadPublicSnapshot } from "@/lib/db/commit";
import { makeEnvelope } from "@/lib/state/envelope";
import { hashObject } from "@/lib/utils/hash";
import { getProviderConfig } from "@/lib/ai/client";
import type {
  RoutePhaseEntered,
  RouteIntentCandidatesCommitted,
  RouteIntentsAccepted,
  OrdinaryDayScreeningStarted,
  OrdinaryDaysCommitted,
  ParallelLivesCommitted,
} from "@/lib/state/events";
import type { RouteIntent, Prototype, ParallelLife, ParallelLivesPlan, OrdinaryDay, EvidenceLink as ContractEvidenceLink, RadarDimension } from "@/lib/state/contracts";
import type { FinalPlan, SensemakerFinalInput, ParallelLife as UIParallelLife } from "@/lib/working-memory/types";
import type { NextRequest } from "next/server";

function toUiPlan(
  plan: ParallelLivesPlan,
  prototypes: Prototype[],
  promptVersion: string,
  config: { provider: string; model: string }
): FinalPlan {
  const prototypeByTrialId = new Map<string, Prototype>(prototypes.map((p) => [p.trial_id, p]));

  const lives = plan.lives.map((life) => {
    const trial = prototypeByTrialId.get(life.trial_id)!;
    return {
      ...life,
      trial,
    } as UIParallelLife;
  });

  return {
    schema_version: "parallel-lives.v3.ui",
    id: plan.id,
    session_id: plan.session_id,
    generation_provenance_id: plan.generation_provenance_id,
    provisional: plan.provisional,
    framing: plan.framing,
    blueprint: plan.blueprint,
    analysis: plan.analysis,
    lives: lives as [UIParallelLife, UIParallelLife, UIParallelLife],
    shared_values: plan.shared_values,
    real_tradeoff: plan.real_tradeoff,
    open_questions: plan.open_questions,
    created_at: new Date().toISOString(),
    prompt_version: promptVersion,
    model_config_id: `${config.provider}/${config.model}`,
  };
}

// GET /api/final — return existing plan if already generated.
export async function GET(request: NextRequest) {
  const { session } = await resolveSession(request);
  if (!session) {
    return NextResponse.json({ error: "No active session" }, { status: 401 });
  }

  if (!hasConsent(session.consents, "ai")) {
    return NextResponse.json({ error: "AI consent required", missing: ["ai"] }, { status: 403 });
  }

  const memory = await loadOrCreateWorkingMemory(session.id);
  if (!memory.finalPlan) {
    return NextResponse.json({ error: "Plan not yet generated" }, { status: 404 });
  }

  const config = getProviderConfig();
  const prototypes = buildPrototypesForPlan(session.id, memory.finalPlan, memory.finalPlan.generation_provenance_id);
  const uiPlan = toUiPlan(memory.finalPlan, prototypes, "sensemaker.final.v3", config);
  return NextResponse.json(uiPlan);
}

export async function POST(request: NextRequest) {
  const { session } = await resolveSession(request);
  if (!session) {
    return NextResponse.json({ error: "No active session" }, { status: 401 });
  }

  if (!hasConsent(session.consents, "ai")) {
    return NextResponse.json({ error: "AI consent required", missing: ["ai"] }, { status: 403 });
  }

  const memory = await loadOrCreateWorkingMemory(session.id);

  // Idempotent replay: if a plan is already stored for this session, map and return it.
  if (memory.finalPlan) {
    const config = getProviderConfig();
    const prototypes = buildPrototypesForPlan(session.id, memory.finalPlan, memory.finalPlan.generation_provenance_id);
    const uiPlan = toUiPlan(memory.finalPlan, prototypes, "sensemaker.final.v3", config);
    return NextResponse.json(uiPlan);
  }

  if (memory.last_wave_index === 0) {
    return NextResponse.json({ error: "Complete at least Wave 1 before generating plans" }, { status: 400 });
  }

  if (!memory.persona_portrait) {
    return NextResponse.json({ error: "Generate portrait before final plan", can_proceed: false }, { status: 409 });
  }

  const config = getProviderConfig();

  const input: SensemakerFinalInput = {
    schema_version: "sensemaker.final.input.v3",
    memory,
    stop_reason: "sufficient",
    provisional: false,
    prompt_version: "sensemaker.final.v3",
  };

  let plan;
  try {
    plan = await runSensemakerFinal(input);
  } catch (err) {
    if (err instanceof FinalGenerationError) {
      const status = err.reason === "validation" ? 422 : 502;
      return NextResponse.json(
        { error: err.message, reason: err.reason, retryable: true },
        { status },
      );
    }
    throw err;
  }

  // Commit final-plan events to the XState ledger.
  const snapshot = await loadPublicSnapshot(session.id);
  let baseRevision = snapshot?.revision ?? 0;
  const stateValue = snapshot ? (snapshot.state_value_json as { value: unknown }).value : null;
  const inRoutePhase = stateValue === "route_intents" || (typeof stateValue === "object" && stateValue !== null && "route_intents" in stateValue);

  if (!inRoutePhase) {
    const routeProvenanceId = randomUUID();
    const routeProvenance = {
      id: routeProvenanceId,
      session_id: session.id,
      proposal_id: routeProvenanceId,
      correlation_id: randomUUID(),
      prompt_contract_revision: 3 as const,
      prompt_file_hash: hashObject("app/api/final"),
      schema_hash: hashObject(plan),
      context_builder_version: "final-v1",
      context_hash: hashObject({ session_id: session.id }),
      provider: config.provider,
      model: config.model,
      model_config_json: { provider: config.provider, model: config.model },
      model_config_hash: hashObject({ provider: config.provider, model: config.model }),
      fixture_suite_version: "final-v1",
      created_at: new Date().toISOString(),
    };
    const routePayload: RoutePhaseEntered = {
      reason: "mission_sufficient",
      interview_snapshot_revision: baseRevision,
    };
    const routeEnvelope = makeEnvelope("ROUTE_PHASE_ENTERED", {
      session_id: session.id,
      actor: "host",
      base_revision: baseRevision,
      idempotency_key: `route-phase-final-${session.id}-${routeProvenanceId}`,
      correlation_id: routeProvenance.correlation_id,
      proposal_id: routeProvenance.proposal_id,
      payload: routePayload,
    });
    const routeResult = await commitEvent(session.id, routeEnvelope);
    if (routeResult.ok) {
      baseRevision = routeResult.nextRevision;
    } else {
      console.error("Failed to commit ROUTE_PHASE_ENTERED:", routeResult.message);
    }
  }

  const provenanceId = plan.generation_provenance_id;
  const provenance = {
    id: provenanceId,
    session_id: session.id,
    proposal_id: provenanceId,
    correlation_id: randomUUID(),
    prompt_contract_revision: 3 as const,
    prompt_file_hash: hashObject("prompts/odyssey-generator-v2.md"),
    schema_hash: hashObject(plan),
    context_builder_version: "sensemaker-final-v3",
    context_hash: hashObject({ memory }),
    provider: config.provider,
    model: config.model,
    model_config_json: { provider: config.provider, model: config.model },
    model_config_hash: hashObject({ provider: config.provider, model: config.model }),
    fixture_suite_version: "sensemaker-final-v3",
    created_at: new Date().toISOString(),
  };

  const intents: RouteIntent[] = plan.lives.map((life) => ({
    id: life.route_intent_id,
    generation_provenance_id: provenance.id,
    title_hint: life.title,
    life_shape: {
      daily_rhythm: life.ordinary_day,
      work_or_study: life.core_experience,
      relationships: life.title,
      environment: life.year_1,
      responsibilities: life.year_2,
      resources: life.year_3,
    },
    real_cost: life.costs_and_tradeoffs[0] ?? "待明确",
    evidence: life.evidence_for,
    status: "seed",
  }));

  const intentPayload: RouteIntentCandidatesCommitted = {
    proposal_id: provenance.proposal_id,
    generation_provenance: provenance,
    intents,
  };
  const intentEnvelope = makeEnvelope("ROUTE_INTENT_CANDIDATES_COMMITTED", {
    session_id: session.id,
    actor: "sensemaker",
    base_revision: baseRevision,
    idempotency_key: `route-intents-${session.id}-${provenanceId}`,
    correlation_id: provenance.correlation_id,
    proposal_id: provenance.proposal_id,
    payload: intentPayload,
  });
  const intentResult = await commitEvent(session.id, intentEnvelope);
  if (intentResult.ok) {
    baseRevision = intentResult.nextRevision;
  } else {
    console.error("Failed to commit ROUTE_INTENT_CANDIDATES_COMMITTED:", intentResult.message);
    return NextResponse.json({ error: "Could not persist route candidates" }, { status: 409 });
  }

  // Explicitly accept the three validated candidate intents.
  const acceptedIntents: [RouteIntent, RouteIntent, RouteIntent] = intents.map((intent) => ({
    ...intent,
    status: "accepted" as const,
  })) as [RouteIntent, RouteIntent, RouteIntent];
  const acceptedPayload: RouteIntentsAccepted = { intents: acceptedIntents };
  const acceptedEnvelope = makeEnvelope("ROUTE_INTENTS_ACCEPTED", {
    session_id: session.id,
    actor: "user",
    base_revision: baseRevision,
    idempotency_key: `route-intents-accepted-${session.id}-${provenanceId}`,
    correlation_id: provenance.correlation_id,
    proposal_id: provenance.proposal_id,
    payload: acceptedPayload,
  });
  const acceptedResult = await commitEvent(session.id, acceptedEnvelope);
  if (acceptedResult.ok) {
    baseRevision = acceptedResult.nextRevision;
  } else {
    console.error("Failed to commit ROUTE_INTENTS_ACCEPTED:", acceptedResult.message);
    return NextResponse.json({ error: "Could not accept route intents" }, { status: 409 });
  }

  // Enter ordinary-day screening before parallel lives.
  const acceptedIntentIds: [string, string, string] = [intents[0].id, intents[1].id, intents[2].id];
  const screeningPayload: OrdinaryDayScreeningStarted = {
    accepted_intent_ids: acceptedIntentIds,
  };
  const screeningEnvelope = makeEnvelope("ORDINARY_DAY_SCREENING_STARTED", {
    session_id: session.id,
    actor: "host",
    base_revision: baseRevision,
    idempotency_key: `ordinary-day-screening-${session.id}-${provenanceId}`,
    correlation_id: provenance.correlation_id,
    proposal_id: provenance.proposal_id,
    payload: screeningPayload,
  });
  const screeningResult = await commitEvent(session.id, screeningEnvelope);
  if (screeningResult.ok) {
    baseRevision = screeningResult.nextRevision;
  } else {
    console.error("Failed to commit ORDINARY_DAY_SCREENING_STARTED:", screeningResult.message);
  }

  const daysProvenanceId = randomUUID();
  const daysProvenance = {
    id: daysProvenanceId,
    session_id: session.id,
    proposal_id: daysProvenanceId,
    correlation_id: randomUUID(),
    prompt_contract_revision: 3 as const,
    prompt_file_hash: hashObject("prompts/odyssey-ordinary-day.md"),
    schema_hash: hashObject(plan.lives.map((l) => l.ordinary_day)),
    context_builder_version: "odyssey-ordinary-day-v1",
    context_hash: hashObject({ session_id: session.id, accepted_intent_ids: acceptedIntentIds }),
    provider: config.provider,
    model: config.model,
    model_config_json: { provider: config.provider, model: config.model },
    model_config_hash: hashObject({ provider: config.provider, model: config.model }),
    fixture_suite_version: "odyssey-ordinary-day-v1",
    created_at: new Date().toISOString(),
  };

  const days: [OrdinaryDay, OrdinaryDay, OrdinaryDay] = plan.lives.map((life, idx) => {
    const firstEvidence = intents[idx].evidence[0] as ContractEvidenceLink | undefined;
    const evidence: ContractEvidenceLink[] = firstEvidence
      ? [{
          ...firstEvidence,
          relevance: "说明该普通一天如何从路线意向推演而来",
          excerpt: life.ordinary_day,
        }]
      : [];
    const day: OrdinaryDay = {
      id: randomUUID(),
      route_intent_id: intents[idx].id,
      generation_provenance_id: daysProvenance.id,
      moments: life.day_narrative.scenes.map((s) => s.text),
      screens: {
        traits: "延续当前特质倾向",
        motivation: life.attractions[0] ?? "保持内在驱动",
        capabilities: "调用已有能力",
        relationships: "关系模式基本稳定",
        environment: life.year_1,
        narrative: life.title,
      } as Record<RadarDimension, string>,
      epistemic_status: "design_hypothesis",
      evidence,
    };
    return day;
  }) as [OrdinaryDay, OrdinaryDay, OrdinaryDay];

  const daysPayload: OrdinaryDaysCommitted = {
    proposal_id: daysProvenance.proposal_id,
    generation_provenance: daysProvenance,
    days,
  };
  const daysEnvelope = makeEnvelope("ORDINARY_DAYS_COMMITTED", {
    session_id: session.id,
    actor: "sensemaker",
    base_revision: baseRevision,
    idempotency_key: `ordinary-days-${session.id}-${provenanceId}`,
    correlation_id: daysProvenance.correlation_id,
    proposal_id: daysProvenance.proposal_id,
    payload: daysPayload,
  });
  const daysResult = await commitEvent(session.id, daysEnvelope);
  if (daysResult.ok) {
    baseRevision = daysResult.nextRevision;
  } else {
    console.error("Failed to commit ORDINARY_DAYS_COMMITTED:", daysResult.message);
  }

  // Strip the runtime prototypes before storing / committing the canonical ParallelLivesPlan.
  const { prototypes: _prototypes, ...rawPlan } = plan;

  const livesPayload: ParallelLivesCommitted = {
    proposal_id: provenance.proposal_id,
    generation_provenance: provenance,
    plan: rawPlan,
  };
  const livesEnvelope = makeEnvelope("PARALLEL_LIVES_COMMITTED", {
    session_id: session.id,
    actor: "sensemaker",
    base_revision: baseRevision,
    idempotency_key: `parallel-lives-${session.id}-${provenanceId}`,
    correlation_id: provenance.correlation_id,
    proposal_id: provenance.proposal_id,
    payload: livesPayload,
  });
  const livesResult = await commitEvent(session.id, livesEnvelope);
  if (!livesResult.ok) {
    console.error("Failed to commit PARALLEL_LIVES_COMMITTED:", livesResult.message);
  }

  // Persist the raw v3 plan so reload or re-clicks return the same result.
  memory.finalPlan = rawPlan;
  await saveWorkingMemory(session.id, memory);

  const uiPlan = toUiPlan(plan, plan.prototypes, input.prompt_version, config);

  return NextResponse.json(uiPlan);
}
