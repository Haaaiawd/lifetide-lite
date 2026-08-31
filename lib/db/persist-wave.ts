// Domain persistence helpers for wave-related canonical events.
// Used by commit.ts and as a transitional bridge while app/api routes migrate to the XState ledger.

import { randomUUID } from "node:crypto";
import { prisma } from "./prisma";
import type { Wave, GenerationProvenance, WaveMissionProposal, OpeningQuestionProposal, QuestionOption } from "@/lib/state/contracts";
import type { Id } from "@/lib/state/contracts";

type PrismaTx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

export async function ensureGenerationProvenance(
  tx: PrismaTx,
  sessionId: Id,
  provenance: GenerationProvenance
) {
  await tx.generationProvenance.upsert({
    where: { sessionId_proposalId: { sessionId, proposalId: provenance.proposal_id } },
    create: {
      id: provenance.id,
      sessionId,
      proposalId: provenance.proposal_id,
      correlationId: provenance.correlation_id,
      promptContractRevision: provenance.prompt_contract_revision,
      promptFileHash: provenance.prompt_file_hash,
      schemaHash: provenance.schema_hash,
      contextBuilderVersion: provenance.context_builder_version,
      contextHash: provenance.context_hash,
      provider: provenance.provider,
      model: provenance.model,
      modelConfigJson: JSON.stringify(provenance.model_config_json),
      modelConfigHash: provenance.model_config_hash,
      fixtureSuiteVersion: provenance.fixture_suite_version,
    },
    update: {},
  });
}

export async function persistWaveMissionAndArtifacts(
  tx: PrismaTx,
  sessionId: Id,
  wave: Wave,
  provenance: GenerationProvenance
) {
  await ensureGenerationProvenance(tx, sessionId, provenance);

  const mission = wave.mission;
  await tx.waveMission.upsert({
    where: { sessionId_waveId: { sessionId, waveId: mission.wave_id } },
    create: {
      sessionId,
      waveId: mission.wave_id,
      generationProvenanceId: provenance.id,
      decisionToImprove: mission.decision_to_improve,
      targetDimensions: JSON.stringify(mission.target_dimensions),
      knownSourceRefs: JSON.stringify(mission.known_source_refs),
      importantUnknown: mission.important_unknown,
      whyNow: mission.why_now,
      exitCondition: mission.exit_condition,
      sensitivityCeiling: mission.sensitivity_ceiling,
    },
    update: {},
  });

  for (const unit of wave.elicitation_units) {
    await tx.elicitationUnit.upsert({
      where: { id: unit.id },
      create: {
        id: unit.id,
        sessionId,
        waveId: wave.id,
        generationProvenanceId: provenance.id,
        orderInWave: unit.order_in_wave,
        decisionTarget: unit.decision_target,
        targetDimensions: JSON.stringify(unit.target_dimensions),
        status: unit.status,
        questionId: unit.question_id,
        sourceRefs: JSON.stringify(unit.source_refs),
      },
      update: {},
    });
  }

  for (const batch of wave.microbatches) {
    await tx.microbatch.upsert({
      where: { id: batch.id },
      create: {
        id: batch.id,
        sessionId,
        waveId: batch.wave_id,
        generationProvenanceId: provenance.id,
        index: batch.index,
        sessionRevision: batch.session_revision,
        status: batch.status,
        idempotencyKey: batch.idempotency_key,
      },
      update: {},
    });

    for (const question of batch.questions) {
      await tx.question.upsert({
        where: { id: question.id },
        create: {
          id: question.id,
          sessionId,
          waveId: question.wave_id,
          microbatchId: batch.id,
          generationProvenanceId: provenance.id,
          orderInWave: question.order_in_wave,
          elicitationUnitId: question.elicitation_unit_id,
          text: question.text,
          responseKind: question.response_kind,
          options: question.options ? JSON.stringify(question.options) : null,
          sensitivity: question.sensitivity,
          whyThisMatters: question.why_this_matters,
          decisionTarget: question.decision_target,
          asksForConcreteExample: question.asks_for_concrete_example,
          allowsSkip: question.allows_skip,
          allowsFreeText: question.allows_free_text,
        },
        update: {},
      });
    }
  }
}

export function buildWaveFromProposal(
  waveId: Id,
  index: number,
  mission: WaveMissionProposal,
  questions: OpeningQuestionProposal[],
  nextRevision: number
): Wave {
  const missionId = randomUUID();
  const batchId = randomUUID();

  const elicitationUnits = mission.elicitation_units.map((u, i) => ({
    id: `eu-${index}-${i}`,
    generation_provenance_id: missionId,
    order_in_wave: i + 1,
    decision_target: u.decision_target,
    target_dimensions: u.target_dimensions,
    status: "pending" as const,
    source_refs: u.precovered_by,
    question_id: undefined as Id | undefined,
  }));

  const mappedQuestions = questions.map((q, i): {
    id: Id;
    wave_id: Id;
    microbatch_id: Id;
    generation_provenance_id: Id;
    order_in_wave: number;
    elicitation_unit_id: Id;
    text: string;
    response_kind: OpeningQuestionProposal["response_kind"];
    options?: QuestionOption[];
    sensitivity: OpeningQuestionProposal["sensitivity"];
    why_this_matters: string;
    decision_target: string;
    asks_for_concrete_example: boolean;
    allows_skip: true;
    allows_free_text: true;
  } => ({
    id: `q-${index}-${i}`,
    wave_id: waveId,
    microbatch_id: batchId,
    generation_provenance_id: missionId,
    order_in_wave: i + 1,
    elicitation_unit_id: elicitationUnits[q.elicitation_unit_index ?? i].id,
    text: q.text,
    response_kind: q.response_kind,
    options: q.options?.map((o, j): QuestionOption => ({ id: `opt-${j}`, generation_provenance_id: missionId, label: o.label, description: o.description })),
    sensitivity: q.sensitivity,
    why_this_matters: q.why_this_matters ?? "",
    decision_target: q.decision_target,
    asks_for_concrete_example: q.asks_for_concrete_example,
    allows_skip: q.allows_skip,
    allows_free_text: q.allows_free_text,
  }));

  const microbatch = {
    id: batchId,
    wave_id: waveId,
    generation_provenance_id: missionId,
    index: 1,
    session_revision: nextRevision,
    status: "proposed" as const,
    idempotency_key: `wave-${waveId}-batch-1`,
    questions: mappedQuestions,
  };

  const waveMission = {
    id: missionId,
    wave_id: waveId,
    generation_provenance_id: missionId,
    decision_to_improve: mission.decision_to_improve,
    target_dimensions: mission.target_dimensions,
    known_source_refs: mission.known_source_refs,
    important_unknown: mission.important_unknown,
    why_now: mission.why_now,
    exit_condition: mission.exit_condition,
    sensitivity_ceiling: mission.sensitivity_ceiling,
  };

  return {
    id: waveId,
    index,
    kind: "core" as const,
    mission: waveMission,
    status: "open" as const,
    microbatches: [microbatch],
    asked_count: 0,
    elicitation_units: elicitationUnits,
    covered_unit_count: 0,
  };
}
