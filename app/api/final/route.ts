import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { requireGuestSession, hasConsent } from "@/lib/auth/session";
import { loadOrCreateWorkingMemory } from "@/lib/working-memory/store";
import { runSensemakerFinal } from "@/lib/ai/sensemaker/final";
import { commitEvent, loadPublicSnapshot } from "@/lib/db/commit";
import { makeEnvelope } from "@/lib/state/envelope";
import { hashObject } from "@/lib/utils/hash";
import type {
  RoutePhaseEntered,
  RouteIntentCandidatesCommitted,
  OrdinaryDayScreeningStarted,
  OrdinaryDaysCommitted,
  ParallelLivesCommitted,
} from "@/lib/state/events";
import type { RouteIntent, ParallelLife, ParallelLivesPlan, OrdinaryDay, EvidenceLink, RadarDimension } from "@/lib/state/contracts";
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
      provider: "fixture",
      model: "fixture",
      model_config_json: {},
      model_config_hash: hashObject({}),
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
      idempotency_key: `route-phase-final-${session.id}`,
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

  const provenanceId = randomUUID();
  const provenance = {
    id: provenanceId,
    session_id: session.id,
    proposal_id: provenanceId,
    correlation_id: randomUUID(),
    prompt_contract_revision: 3 as const,
    prompt_file_hash: hashObject("prompts/prototype-designer-v2.md"),
    schema_hash: hashObject(plan),
    context_builder_version: "sensemaker-final-v2",
    context_hash: hashObject({ memory }),
    provider: "fixture",
    model: "fixture",
    model_config_json: {},
    model_config_hash: hashObject({}),
    fixture_suite_version: "sensemaker-final-v2",
    created_at: new Date().toISOString(),
  };

  const intents: RouteIntent[] = plan.lives.map((life) => ({
    id: life.id,
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
    evidence: life.evidence_for as any,
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
    idempotency_key: `route-intents-${session.id}`,
    correlation_id: provenance.correlation_id,
    proposal_id: provenance.proposal_id,
    payload: intentPayload,
  });
  const intentResult = await commitEvent(session.id, intentEnvelope);
  if (intentResult.ok) {
    baseRevision = intentResult.nextRevision;
  } else {
    console.error("Failed to commit ROUTE_INTENT_CANDIDATES_COMMITTED:", intentResult.message);
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
    idempotency_key: `ordinary-day-screening-${session.id}`,
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
    provider: "fixture",
    model: "fixture",
    model_config_json: {},
    model_config_hash: hashObject({}),
    fixture_suite_version: "odyssey-ordinary-day-v1",
    created_at: new Date().toISOString(),
  };

  const days: [OrdinaryDay, OrdinaryDay, OrdinaryDay] = plan.lives.map((life, idx) => {
    const intentEvidence = intents[idx].evidence?.[0] as EvidenceLink | undefined;
    const evidence: EvidenceLink[] = intentEvidence
      ? [{
          ...intentEvidence,
          relevance: "说明该普通一天如何从路线意向推演而来",
          excerpt: "从路线意向生成的普通一天",
        }]
      : [];
    const day: OrdinaryDay = {
      id: randomUUID(),
      route_intent_id: intents[idx].id,
      generation_provenance_id: daysProvenance.id,
      moments: [
        `早晨：${life.ordinary_day.slice(0, 20)}...`,
        `上午：处理${life.title}的核心事务`,
        `午后：${life.attractions[0] ?? "保持节奏"}`,
        `晚上：${life.costs_and_tradeoffs[0] ?? "回顾与调整"}`,
      ],
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
    idempotency_key: `ordinary-days-${session.id}`,
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

  const lives: ParallelLife[] = plan.lives.map((life, idx) => ({
    id: life.id,
    route_intent_id: intents[idx].id,
    generation_provenance_id: provenance.id,
    title: life.title,
    core_experience: life.core_experience,
    year_1: life.year_1,
    year_2: life.year_2,
    year_3: life.year_3,
    ordinary_day: life.ordinary_day,
    attractions: life.attractions,
    costs_and_tradeoffs: life.costs_and_tradeoffs,
    evidence_for: life.evidence_for as any,
    assumptions: life.assumptions,
    uncertainties: life.uncertainties,
    risks: life.risks,
    trial_id: randomUUID(),
  }));

  const livesPlan: ParallelLivesPlan = {
    id: randomUUID(),
    session_id: session.id,
    generation_provenance_id: provenance.id,
    schema_version: "parallel-lives.v3",
    provisional: plan.provisional,
    framing: plan.framing,
    lives,
    shared_values: plan.shared_values,
    real_tradeoff: plan.real_tradeoff,
    open_questions: plan.open_questions,
  };

  const livesPayload: ParallelLivesCommitted = {
    proposal_id: provenance.proposal_id,
    generation_provenance: provenance,
    plan: livesPlan,
  };
  const livesEnvelope = makeEnvelope("PARALLEL_LIVES_COMMITTED", {
    session_id: session.id,
    actor: "sensemaker",
    base_revision: baseRevision,
    idempotency_key: `parallel-lives-${session.id}`,
    correlation_id: provenance.correlation_id,
    proposal_id: provenance.proposal_id,
    payload: livesPayload,
  });
  const livesResult = await commitEvent(session.id, livesEnvelope);
  if (!livesResult.ok) {
    console.error("Failed to commit PARALLEL_LIVES_COMMITTED:", livesResult.message);
  }

  return NextResponse.json(plan);
}
