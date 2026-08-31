// Transactional commit service for the conversational harness.
// Compare-and-swap session revision, idempotency, append-only ledger, XState snapshot.

import { randomUUID, createHash } from "node:crypto";
import { createActor } from "xstate";
import { prisma } from "./prisma";
import { harnessMachine } from "@/lib/state/machine";
import type { MachineContext } from "@/lib/state/machine";
import type { MachineEvent } from "@/lib/state/machine";
import type { EventEnvelope, Id, Revision, SessionStateHead } from "@/lib/state/contracts";
import type { WaveMissionCommitted, QuestionBatchCommitted, InsightCommitted, AnswerSubmitted, RouteIntentCandidatesCommitted, CalibrationSubmitted } from "@/lib/state/events";
import { z } from "zod";
import {
  waveSchema,
  sourceVersionSchema,
  answerSchema,
  answerCoverageSchema,
  generationProvenanceSchema,
  routeIntentSchema,
  ordinaryDaySchema,
  parallelLivesPlanSchema,
  microbatchSchema,
} from "@/lib/state/contracts";

type AnyEnvelope = EventEnvelope<string, unknown>;

export type CommitErrorCode =
  | "REVISION_CONFLICT"
  | "IDEMPOTENCY_CONFLICT"
  | "INVALID_PROPOSAL"
  | "INVALID_SOURCE_REF"
  | "INVALID_STATE"
  | "TENANT_MISMATCH"
  | "SAFETY_VIOLATION"
  | "PERSISTENCE_ERROR";

export type CommitResult =
  | { ok: true; nextRevision: Revision; stateValue: unknown; publicContext: unknown }
  | { ok: false; code: CommitErrorCode; currentSnapshot?: unknown; message: string };

function hashObject(obj: unknown): string {
  return createHash("sha256").update(JSON.stringify(obj)).digest("hex").slice(0, 32);
}

function envelopeToMachineEvent(envelope: AnyEnvelope): MachineEvent {
  return { type: envelope.event_type, envelope } as unknown as MachineEvent;
}

const sessionStartedPayloadSchema = z.object({
  guest_token_hash: z.string().min(1),
  expires_at: z.string().min(1),
});

const consentRecordedPayloadSchema = z.object({
  consent_version: z.string().min(1),
  ai: z.literal(true),
  upload: z.boolean(),
});

const modelCommitMetaSchema = z.object({
  proposal_id: z.string().min(1),
  generation_provenance: generationProvenanceSchema,
});

const answerSubmittedPayloadSchema = z.object({
  answer: answerSchema,
  source: sourceVersionSchema,
  coverage: z.array(answerCoverageSchema),
});

const calibrationSubmittedPayloadSchema = z.object({
  calibration: z.object({
    id: z.string().min(1),
    insight_id: z.string().min(1),
    verdict: z.enum(["accurate", "partly_accurate", "inaccurate"]),
    correction_text: z.string().optional(),
    preferred_direction: z.enum(["continue_here", "change_direction", "preview", "pause"]).optional(),
    source_ref: z.object({ source_id: z.string().min(1), source_revision: z.number().int().min(1) }),
  }),
  source: sourceVersionSchema,
});

const routePhaseEnteredPayloadSchema = z.object({
  reason: z.enum(["mission_sufficient", "user_preview", "user_stopped", "wave_cap"]),
  interview_snapshot_revision: z.number().int().min(0),
});

const routeIntentCandidatesPayloadSchema = modelCommitMetaSchema.extend({
  intents: z.array(routeIntentSchema).length(3),
});

const ordinaryDayScreeningStartedPayloadSchema = z.object({
  accepted_intent_ids: z.tuple([z.string().min(1), z.string().min(1), z.string().min(1)]),
});

const ordinaryDaysCommittedPayloadSchema = modelCommitMetaSchema.extend({
  days: z.tuple([ordinaryDaySchema, ordinaryDaySchema, ordinaryDaySchema]),
});

const parallelLivesCommittedPayloadSchema = modelCommitMetaSchema.extend({
  plan: parallelLivesPlanSchema,
});

function validatePayload(envelope: AnyEnvelope): true | CommitResult {
  try {
    switch (envelope.event_type) {
      case "SESSION_STARTED":
        sessionStartedPayloadSchema.parse(envelope.payload);
        break;
      case "CONSENT_RECORDED":
        consentRecordedPayloadSchema.parse(envelope.payload);
        break;
      case "WAVE_MISSION_COMMITTED":
        modelCommitMetaSchema.extend({ wave: waveSchema }).parse(envelope.payload);
        break;
      case "QUESTION_BATCH_COMMITTED":
        modelCommitMetaSchema.extend({ wave_id: z.string().min(1), batch: microbatchSchema }).parse(envelope.payload);
        break;
      case "ANSWER_SUBMITTED":
        answerSubmittedPayloadSchema.parse(envelope.payload);
        break;
      case "WAVE_END_COMMITTED":
        modelCommitMetaSchema.extend({ wave_id: z.string().min(1), stop_reason: z.string().min(1) }).parse(envelope.payload);
        break;
      case "INSIGHT_COMMITTED":
        modelCommitMetaSchema.extend({ insight_status: z.literal("generated"), proposal: z.record(z.unknown()) }).parse(envelope.payload);
        break;
      case "CALIBRATION_SUBMITTED":
        calibrationSubmittedPayloadSchema.parse(envelope.payload);
        break;
      case "CALIBRATION_SKIPPED":
        z.object({ insight_id: z.string().min(1), explicitly_skipped: z.literal(true) }).parse(envelope.payload);
        break;
      case "NEXT_WAVE_COMMITTED":
        z.object({ kind: z.enum(["core", "deep_dive"]) }).parse(envelope.payload);
        break;
      case "ROUTE_PHASE_ENTERED":
        routePhaseEnteredPayloadSchema.parse(envelope.payload);
        break;
      case "ROUTE_INTENT_CANDIDATES_COMMITTED":
        routeIntentCandidatesPayloadSchema.parse(envelope.payload);
        break;
      case "ROUTE_INTENTS_ACCEPTED":
        z.object({ intents: z.array(routeIntentSchema).length(3) }).parse(envelope.payload);
        break;
      case "ORDINARY_DAY_SCREENING_STARTED":
        ordinaryDayScreeningStartedPayloadSchema.parse(envelope.payload);
        break;
      case "ORDINARY_DAYS_COMMITTED":
        ordinaryDaysCommittedPayloadSchema.parse(envelope.payload);
        break;
      case "PARALLEL_LIVES_COMMITTED":
        parallelLivesCommittedPayloadSchema.parse(envelope.payload);
        break;
    }
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, code: "INVALID_PROPOSAL", message: `payload validation failed for ${envelope.event_type}: ${message}` };
  }
}

function assertNestedSessionIds(payload: unknown, sessionId: Id, seen = new Set<unknown>()): true | CommitResult {
  if (!payload || typeof payload !== "object") return true;
  if (seen.has(payload)) return true;
  seen.add(payload);

  if (Array.isArray(payload)) {
    for (const item of payload) {
      const result = assertNestedSessionIds(item, sessionId, seen);
      if (result !== true) return result;
    }
    return true;
  }

  for (const [key, value] of Object.entries(payload)) {
    if (key === "session_id" && typeof value === "string" && value !== sessionId) {
      return {
        ok: false,
        code: "TENANT_MISMATCH",
        message: `nested session_id ${value} does not match request session`,
      };
    }
    const result = assertNestedSessionIds(value, sessionId, seen);
    if (result !== true) return result;
  }
  return true;
}

export async function commitEvent(
  sessionId: Id,
  envelope: AnyEnvelope,
  opts: { expectedProposalId?: Id } = {}
): Promise<CommitResult> {
  if (envelope.session_id !== sessionId) {
    return { ok: false, code: "TENANT_MISMATCH", message: "event session_id does not match request session" };
  }

  const nestedCheck = assertNestedSessionIds(envelope.payload, sessionId);
  if (nestedCheck !== true) return nestedCheck;

  const payloadValidation = validatePayload(envelope);
  if (payloadValidation !== true) return payloadValidation;

  try {
    return await prisma.$transaction(
    async (tx) => {
      const stateHead = await tx.sessionStateHead.findUnique({ where: { sessionId } });
      const currentRevision = stateHead?.revision ?? 0;

      const existingByKey = await tx.transitionEvent.findUnique({
        where: { sessionId_idempotencyKey: { sessionId, idempotencyKey: envelope.idempotency_key } },
      });
      if (existingByKey) {
        if (existingByKey.payloadHash !== hashObject(envelope.payload)) {
          return { ok: false, code: "IDEMPOTENCY_CONFLICT", message: "idempotency key reused with different payload" };
        }
        // Idempotent replay: return the original committed result.
        return {
          ok: true,
          nextRevision: existingByKey.committedRevision,
          stateValue: JSON.parse(existingByKey.stateSnapshotJson),
          publicContext: stateHead ? JSON.parse(stateHead.publicContextJson) : {},
        };
      }

      if (currentRevision !== envelope.base_revision) {
        return {
          ok: false,
          code: "REVISION_CONFLICT",
          currentSnapshot: stateHead ? JSON.parse(stateHead.publicContextJson) : undefined,
          message: `Expected base revision ${envelope.base_revision}, found ${currentRevision}`,
        };
      }

      // Load the persisted machine snapshot or start from initial.
      const initialContext: MachineContext = {
        session_id: sessionId,
        revision: currentRevision,
        workingUnderstanding: {
          session_id: sessionId,
          revision: currentRevision,
          design_question: undefined,
          design_question_source_refs: [],
          source_heads: [],
          source_versions: [],
          claims: [],
          constraints: [],
          radar: {
            traits: { dimension: "traits", state: "unseen", reason: "", evidence: [], updated_at: new Date().toISOString() },
            motivation: { dimension: "motivation", state: "unseen", reason: "", evidence: [], updated_at: new Date().toISOString() },
            capabilities: { dimension: "capabilities", state: "unseen", reason: "", evidence: [], updated_at: new Date().toISOString() },
            relationships: { dimension: "relationships", state: "unseen", reason: "", evidence: [], updated_at: new Date().toISOString() },
            environment: { dimension: "environment", state: "unseen", reason: "", evidence: [], updated_at: new Date().toISOString() },
            narrative: { dimension: "narrative", state: "unseen", reason: "", evidence: [], updated_at: new Date().toISOString() },
          },
          route_intents: [],
          corrections: [],
          declined_topics: [],
        },
        waves: [],
        routeIntents: [],
        activeTrials: [],
        pausedTrials: [],
        safetyFlags: [],
      };

      const actor = createActor(harnessMachine, { input: {}, snapshot: stateHead ? JSON.parse(stateHead.stateValueJson) : undefined });
      actor.start();
      const beforeSnapshot = actor.getSnapshot();
      const beforeState = beforeSnapshot.value;
      const beforeRevision = beforeSnapshot.context.revision;

      // Validate source references before applying.
      // TODO: implement strict source-ref validation using tx.SourceHead / tx.SourceVersion.

      actor.send(envelopeToMachineEvent(envelope));
      const after = actor.getSnapshot();
      const afterState = after.value;
      const afterRevision = after.context.revision;

      // Guard rejection is visible when neither state value nor context revision changed.
      if (
        JSON.stringify(beforeState) === JSON.stringify(afterState) &&
        afterRevision === beforeRevision &&
        JSON.stringify(beforeState) !== JSON.stringify("safety_stop")
      ) {
        return { ok: false, code: "INVALID_STATE", message: "Event was rejected by state machine guard" };
      }

      const nextRevision = currentRevision + 1;
      const stateValueJson = JSON.stringify(after);
      const publicContextJson = JSON.stringify({
        state: afterState,
        revision: nextRevision,
        session_id: sessionId,
      });
      const snapshotHash = hashObject(after);

      // Persist domain records derived from the canonical event payload.
      await persistDomainRecords(tx, envelope);

      await tx.transitionEvent.create({
        data: {
          sessionId,
          eventId: envelope.event_id,
          eventType: envelope.event_type,
          schemaVersion: 3,
          baseRevision: currentRevision,
          committedRevision: nextRevision,
          idempotencyKey: envelope.idempotency_key,
          payloadHash: hashObject(envelope.payload),
          correlationId: envelope.correlation_id,
          causationId: envelope.causation_id,
          proposalId: envelope.proposal_id ?? opts.expectedProposalId,
          actor: envelope.actor,
          fromState: JSON.stringify(beforeState),
          toState: JSON.stringify(afterState),
          eventMetadataJson: JSON.stringify({
            event_id: envelope.event_id,
            emitted_at: envelope.emitted_at,
            safety_flag: envelope.safety_flag,
          }),
          stateSnapshotJson: stateValueJson,
          snapshotHash,
          committedAt: new Date(),
        },
      });

      await tx.sessionStateHead.upsert({
        where: { sessionId },
        create: {
          sessionId,
          revision: nextRevision,
          machineVersion: 3,
          stateValueJson,
          publicContextJson,
          snapshotHash,
          updatedAt: new Date(),
        },
        update: {
          revision: nextRevision,
          stateValueJson,
          publicContextJson,
          snapshotHash,
          updatedAt: new Date(),
        },
      });

      return {
        ok: true,
        nextRevision,
        stateValue: afterState,
        publicContext: JSON.parse(publicContextJson),
      };
    },
    {
      maxWait: 5000,
      timeout: 15000,
    }
  );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, code: "PERSISTENCE_ERROR", message };
  }
}

type PrismaTx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

async function persistDomainRecords(tx: PrismaTx, envelope: AnyEnvelope) {
  switch (envelope.event_type) {
    case "WAVE_MISSION_COMMITTED":
      await persistWaveMission(tx, envelope.payload as WaveMissionCommitted);
      break;
    case "QUESTION_BATCH_COMMITTED":
      await persistQuestionBatch(tx, envelope.payload as QuestionBatchCommitted);
      break;
    case "INSIGHT_COMMITTED":
      await persistInsight(tx, envelope.payload as InsightCommitted);
      break;
    case "ANSWER_SUBMITTED":
      await persistAnswer(tx, envelope.payload as AnswerSubmitted);
      break;
    case "ROUTE_INTENT_CANDIDATES_COMMITTED":
      await persistRouteIntents(tx, envelope.payload as RouteIntentCandidatesCommitted);
      break;
    case "CALIBRATION_SUBMITTED":
      await persistCalibration(tx, envelope.payload as CalibrationSubmitted);
      break;
    default:
      // No domain records for this event type yet.
      break;
  }
}

async function persistGenerationProvenance(
  tx: PrismaTx,
  sessionId: Id,
  provenance: WaveMissionCommitted["generation_provenance"]
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

async function persistWaveMission(tx: PrismaTx, payload: WaveMissionCommitted) {
  const sessionId = payload.generation_provenance.session_id;
  const wave = payload.wave;
  const provenance = payload.generation_provenance;

  await persistGenerationProvenance(tx, sessionId, provenance);

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

async function persistQuestionBatch(tx: PrismaTx, payload: QuestionBatchCommitted) {
  const sessionId = payload.generation_provenance.session_id;
  const batch = payload.batch;

  await tx.microbatch.upsert({
    where: { id: batch.id },
    create: {
      id: batch.id,
      sessionId,
      waveId: batch.wave_id,
      generationProvenanceId: payload.generation_provenance.id,
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
        generationProvenanceId: payload.generation_provenance.id,
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

async function persistInsight(tx: PrismaTx, payload: InsightCommitted) {
  const sessionId = payload.generation_provenance.session_id;
  const insight = payload.proposal.insight;
  const insightId = randomUUID();

  await persistGenerationProvenance(tx, sessionId, payload.generation_provenance);

  await tx.immediateInsight.upsert({
    where: { id: insightId },
    create: {
      id: insightId,
      sessionId,
      waveId: insight.wave_id,
      generationProvenanceId: payload.generation_provenance.id,
      generatedAt: new Date().toISOString(),
      userToldMe: insight.user_told_me,
      currentReading: insight.current_reading,
      importantUnknown: insight.important_unknown,
      radarDeltas: JSON.stringify(insight.radar_deltas),
      routeImpact: insight.route_impact,
      evidence: JSON.stringify(insight.evidence),
      status: "generated",
      languageStrength: insight.language_strength,
    },
    update: {},
  });
}

async function persistAnswer(tx: PrismaTx, payload: AnswerSubmitted) {
  const sessionId = payload.source.session_id;
  const answer = payload.answer;
  const source = payload.source;
  const sourceVersionId = source.source_id;

  await tx.sourceVersion.upsert({
    where: { id: sourceVersionId },
    create: {
      id: sourceVersionId,
      sessionId,
      sourceId: source.source_id,
      revision: source.revision,
      kind: source.kind,
      untrusted: source.untrusted,
      textRef: source.text_ref,
    },
    update: {},
  });

  await tx.answer.upsert({
    where: { id: answer.id },
    create: {
      id: answer.id,
      sessionId,
      questionId: answer.question_id ?? "",
      value: answer.selected_option_ids ? JSON.stringify(answer.selected_option_ids) : null,
      skipped: answer.skipped,
    },
    update: {},
  });
}

async function persistRouteIntents(tx: PrismaTx, payload: RouteIntentCandidatesCommitted) {
  const sessionId = payload.generation_provenance.session_id;

  await persistGenerationProvenance(tx, sessionId, payload.generation_provenance);

  for (const intent of payload.intents) {
    await tx.routeIntent.upsert({
      where: { id: intent.id },
      create: {
        id: intent.id,
        sessionId,
        generationProvenanceId: payload.generation_provenance.id,
        titleHint: intent.title_hint,
        lifeShape: JSON.stringify(intent.life_shape),
        realCost: intent.real_cost,
        evidence: JSON.stringify(intent.evidence),
        status: intent.status,
      },
      update: {},
    });
  }
}

async function persistCalibration(tx: PrismaTx, payload: CalibrationSubmitted) {
  const sessionId = payload.source.session_id;
  const calibration = payload.calibration;
  const source = payload.source;

  await tx.sourceVersion.upsert({
    where: { id: source.source_id },
    create: {
      id: source.source_id,
      sessionId,
      sourceId: source.source_id,
      revision: source.revision,
      kind: source.kind,
      untrusted: source.untrusted,
      textRef: source.text_ref,
    },
    update: {},
  });

  await tx.calibration.upsert({
    where: { id: calibration.id },
    create: {
      id: calibration.id,
      sessionId,
      insightId: calibration.insight_id,
      verdict: calibration.verdict,
      correctionText: calibration.correction_text ?? null,
      preferredDirection: calibration.preferred_direction ?? null,
      sourceId: calibration.source_ref.source_id,
      sourceRevision: calibration.source_ref.source_revision,
    },
    update: {},
  });
}

export async function loadPublicSnapshot(sessionId: Id): Promise<SessionStateHead | null> {
  const row = await prisma.sessionStateHead.findUnique({ where: { sessionId } });
  if (!row) return null;
  return {
    session_id: row.sessionId,
    revision: row.revision,
    machine_version: row.machineVersion as 3,
    state_value_json: JSON.parse(row.stateValueJson),
    public_context_json: JSON.parse(row.publicContextJson),
    resume_state_json: row.resumeStateJson ? JSON.parse(row.resumeStateJson) : undefined,
    snapshot_hash: row.snapshotHash,
    updated_at: row.updatedAt.toISOString(),
  };
}
