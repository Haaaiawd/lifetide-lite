import { z } from "zod";

// Canonical TypeScript + Zod contracts for the conversational six-dimension harness.
// Source of truth: .loom/design/insight-plan-contracts.md and .loom/design/state-and-persistence-protocol.md
// Contract revision: 3

export const idSchema = z.string().min(1);
export type Id = z.infer<typeof idSchema>;

export const isoDateTimeSchema = z.string().datetime();
export type ISODateTime = z.infer<typeof isoDateTimeSchema>;

export const revisionSchema = z.number().int().nonnegative();
export type Revision = z.infer<typeof revisionSchema>;

export const epistemicStatusSchema = z.enum([
  "user_stated",
  "document_stated",
  "external_fact",
  "working_inference",
  "design_hypothesis",
  "imagination",
]);
export type EpistemicStatus = z.infer<typeof epistemicStatusSchema>;

export const calibrationVerdictSchema = z.enum(["unreviewed", "accurate", "partly_accurate", "inaccurate"]);
export type CalibrationVerdict = z.infer<typeof calibrationVerdictSchema>;

export const sourceKindSchema = z.enum([
  "free_text",
  "question_answer",
  "material_excerpt",
  "calibration",
  "trial_reflection",
  "external_research",
]);
export type SourceKind = z.infer<typeof sourceKindSchema>;

export const sourceRefSchema = z.object({
  source_id: idSchema,
  source_revision: revisionSchema,
});
export type SourceRef = z.infer<typeof sourceRefSchema>;

export const sourceVersionSchema = z.object({
  source_id: idSchema,
  session_id: idSchema,
  revision: revisionSchema,
  kind: sourceKindSchema,
  created_at: isoDateTimeSchema,
  untrusted: z.boolean(),
  text_ref: idSchema,
});
export type SourceVersion = z.infer<typeof sourceVersionSchema>;

export const sourceHeadSchema = z.object({
  session_id: idSchema,
  source_id: idSchema,
  active_revision: revisionSchema.optional(),
  status: z.enum(["active", "deleted"]),
  deleted_at: isoDateTimeSchema.optional(),
});
export type SourceHead = z.infer<typeof sourceHeadSchema>;

export const evidenceShapeSchema = z.enum([
  "abstract_statement",
  "concrete_scene",
  "observed_behavior",
  "tradeoff",
  "document_excerpt",
  "calibration",
  "external_fact",
  "imagination",
]);
export type EvidenceShape = z.infer<typeof evidenceShapeSchema>;

export const evidenceLinkSchema = sourceRefSchema.extend({
  excerpt: z.string().optional(),
  epistemic_status: epistemicStatusSchema,
  evidence_shape: evidenceShapeSchema,
  relevance: z.string().min(1),
});
export type EvidenceLink = z.infer<typeof evidenceLinkSchema>;

export const radarDimensionSchema = z.enum([
  "traits",
  "motivation",
  "capabilities",
  "relationships",
  "environment",
  "narrative",
]);
export type RadarDimension = z.infer<typeof radarDimensionSchema>;

export const radarStateSchema = z.enum(["unseen", "signaled", "grounded", "conflicted", "declined"]);
export type RadarState = z.infer<typeof radarStateSchema>;

export const radarCellSchema = z.object({
  dimension: radarDimensionSchema,
  state: radarStateSchema,
  reason: z.string().min(1),
  evidence: z.array(evidenceLinkSchema),
  updated_at: isoDateTimeSchema,
});
export type RadarCell = z.infer<typeof radarCellSchema>;

export const radarDeltaSchema = z.object({
  dimension: radarDimensionSchema,
  from: radarStateSchema,
  to: radarStateSchema,
  reason: z.string().min(1),
  source_refs: z.array(sourceRefSchema).min(1),
});
export type RadarDelta = z.infer<typeof radarDeltaSchema>;

export const claimStatusSchema = z.enum(["active", "conflicted", "superseded", "invalidated", "stale"]);
export type ClaimStatus = z.infer<typeof claimStatusSchema>;

export const claimSchema = z.object({
  id: idSchema,
  generation_provenance_id: idSchema,
  text: z.string().min(1),
  epistemic_status: z.enum(["working_inference", "design_hypothesis"]),
  evidence: z.array(evidenceLinkSchema).min(1),
  dimensions: z.array(radarDimensionSchema),
  calibration: calibrationVerdictSchema,
  status: claimStatusSchema,
  superseded_by_id: idSchema.optional(),
});
export type Claim = z.infer<typeof claimSchema>;

export const constraintKindSchema = z.enum(["time", "money", "health", "care", "place", "legal", "other"]);
export type ConstraintKind = z.infer<typeof constraintKindSchema>;

export const constraintSchema = z.object({
  id: idSchema,
  generation_provenance_id: idSchema,
  text: z.string().min(1),
  kind: constraintKindSchema,
  flexibility: z.enum(["fixed_now", "negotiable", "unknown"]),
  evidence: z.array(evidenceLinkSchema).min(1),
  status: z.enum(["active", "stale", "invalidated"]),
});
export type Constraint = z.infer<typeof constraintSchema>;

export const routeIntentSchema = z.object({
  id: idSchema,
  generation_provenance_id: idSchema,
  title_hint: z.string().min(1),
  life_shape: z.object({
    daily_rhythm: z.string().min(1),
    work_or_study: z.string().min(1),
    relationships: z.string().min(1),
    environment: z.string().min(1),
    responsibilities: z.string().min(1),
    resources: z.string().min(1),
  }),
  real_cost: z.string().min(1),
  evidence: z.array(evidenceLinkSchema).min(1),
  status: z.enum(["seed", "accepted", "rejected", "merged"]),
});
export type RouteIntent = z.infer<typeof routeIntentSchema>;

export const workingUnderstandingSchema = z.object({
  session_id: idSchema,
  revision: revisionSchema,
  design_question: z.string().optional(),
  design_question_source_refs: z.array(sourceRefSchema),
  source_heads: z.array(sourceHeadSchema),
  source_versions: z.array(sourceVersionSchema),
  claims: z.array(claimSchema),
  constraints: z.array(constraintSchema),
  radar: z.record(radarDimensionSchema, radarCellSchema),
  route_intents: z.array(routeIntentSchema),
  corrections: z.array(idSchema),
  declined_topics: z.array(z.string()),
});
export type WorkingUnderstanding = z.infer<typeof workingUnderstandingSchema>;

export const waveKindSchema = z.enum(["core", "deep_dive"]);
export type WaveKind = z.infer<typeof waveKindSchema>;

export const deepDiveReasonSchema = z.enum([
  "high_impact_signal",
  "material_conflict",
  "route_collapse",
  "ordinary_day_invention_risk",
  "user_requested",
]);
export type DeepDiveReason = z.infer<typeof deepDiveReasonSchema>;

export const questionResponseKindSchema = z.enum([
  "single_choice",
  "multiple_choice",
  "rank",
  "anchored_scale",
  "short_text",
  "scene_text",
]);
export type QuestionResponseKind = z.infer<typeof questionResponseKindSchema>;

export const questionOptionSchema = z.object({
  id: idSchema,
  generation_provenance_id: idSchema,
  label: z.string().min(1),
  description: z.string().optional(),
});
export type QuestionOption = z.infer<typeof questionOptionSchema>;

export const questionSchema = z.object({
  id: idSchema,
  wave_id: idSchema,
  microbatch_id: idSchema,
  generation_provenance_id: idSchema,
  order_in_wave: z.number().int().min(1).max(10),
  elicitation_unit_id: idSchema,
  text: z.string().min(1),
  response_kind: questionResponseKindSchema,
  options: z.array(questionOptionSchema).optional(),
  sensitivity: z.enum(["ordinary", "sensitive"]),
  why_this_matters: z.string().min(1),
  decision_target: z.string().min(1),
  asks_for_concrete_example: z.boolean(),
  allows_skip: z.literal(true),
  allows_free_text: z.literal(true),
});
export type Question = z.infer<typeof questionSchema>;

export const microbatchSchema = z.object({
  id: idSchema,
  wave_id: idSchema,
  generation_provenance_id: idSchema,
  index: z.number().int().nonnegative(),
  session_revision: revisionSchema,
  status: z.enum(["proposed", "committed", "answered", "superseded"]),
  questions: z.array(questionSchema),
  idempotency_key: z.string().min(1),
});
export type Microbatch = z.infer<typeof microbatchSchema>;

export const elicitationUnitStatusSchema = z.enum(["pending", "asked", "precovered", "resolved", "skipped"]);
export type ElicitationUnitStatus = z.infer<typeof elicitationUnitStatusSchema>;

export const elicitationUnitSchema = z.object({
  id: idSchema,
  generation_provenance_id: idSchema,
  order_in_wave: z.number().int().min(1).max(10),
  decision_target: z.string().min(1),
  target_dimensions: z.array(radarDimensionSchema).min(1).max(6),
  status: elicitationUnitStatusSchema,
  question_id: idSchema.optional(),
  source_refs: z.array(sourceRefSchema),
});
export type ElicitationUnit = z.infer<typeof elicitationUnitSchema>;

export const waveMissionSchema = z.object({
  id: idSchema,
  wave_id: idSchema,
  generation_provenance_id: idSchema,
  decision_to_improve: z.string().min(1),
  target_dimensions: z.array(radarDimensionSchema).min(1).max(6),
  known_source_refs: z.array(sourceRefSchema),
  important_unknown: z.string().min(1),
  why_now: z.string().min(1),
  exit_condition: z.string().min(1),
  sensitivity_ceiling: z.enum(["ordinary", "sensitive_with_permission"]),
});
export type WaveMission = z.infer<typeof waveMissionSchema>;

export const waveStopReasonSchema = z.enum([
  "mission_sufficient",
  "question_limit",
  "user_stopped",
  "user_material_covered",
  "safety_boundary",
]);
export type WaveStopReason = z.infer<typeof waveStopReasonSchema>;

export const waveSchema = z.object({
  id: idSchema,
  index: z.number().int().min(1).max(8),
  kind: waveKindSchema,
  mission: waveMissionSchema,
  status: z.enum(["open", "synthesizing", "awaiting_calibration", "closed"]),
  microbatches: z.array(microbatchSchema),
  asked_count: z.number().int().min(0).max(10),
  elicitation_units: z.array(elicitationUnitSchema),
  covered_unit_count: z.number().int().min(0).max(10),
  stop_reason: waveStopReasonSchema.optional(),
});
export type Wave = z.infer<typeof waveSchema>;

export const elicitationUnitProposalSchema = z.object({
  decision_target: z.string().min(1),
  target_dimensions: z.array(radarDimensionSchema).min(1).max(3),
  precovered_by: z.array(sourceRefSchema),
});
export type ElicitationUnitProposal = z.infer<typeof elicitationUnitProposalSchema>;

export const waveMissionProposalSchema = waveMissionSchema
  .omit({ id: true, wave_id: true, generation_provenance_id: true })
  .extend({
    elicitation_units: z.array(elicitationUnitProposalSchema).min(5).max(10),
  });
export type WaveMissionProposal = z.infer<typeof waveMissionProposalSchema>;

export const questionOptionProposalSchema = questionOptionSchema.omit({ id: true, generation_provenance_id: true });
export type QuestionOptionProposal = z.infer<typeof questionOptionProposalSchema>;

export const questionContentProposalSchema = questionSchema
  .omit({
    id: true,
    wave_id: true,
    microbatch_id: true,
    generation_provenance_id: true,
    order_in_wave: true,
    elicitation_unit_id: true,
    options: true,
  })
  .extend({
    options: z.array(questionOptionProposalSchema).optional(),
  });
export type QuestionContentProposal = z.infer<typeof questionContentProposalSchema>;

export const openingQuestionProposalSchema = questionContentProposalSchema.extend({
  elicitation_unit_index: z.number().int().min(0).max(9),
  elicitation_unit_id: z.never().optional(),
});
export type OpeningQuestionProposal = z.infer<typeof openingQuestionProposalSchema>;

export const continuationQuestionProposalSchema = questionContentProposalSchema.extend({
  elicitation_unit_index: z.never().optional(),
  elicitation_unit_id: idSchema,
});
export type ContinuationQuestionProposal = z.infer<typeof continuationQuestionProposalSchema>;

export const deepDiveRecommendationSchema = z.object({
  id: idSchema,
  generation_provenance_id: idSchema,
  reason: deepDiveReasonSchema,
  source_refs: z.array(sourceRefSchema).min(1),
  route_decision_affected: z.string().min(1),
  status: z.literal("accepted"),
});
export type DeepDiveRecommendation = z.infer<typeof deepDiveRecommendationSchema>;

export const deepDiveRecommendationProposalSchema = deepDiveRecommendationSchema.omit({
  id: true,
  generation_provenance_id: true,
  status: true,
});
export type DeepDiveRecommendationProposal = z.infer<typeof deepDiveRecommendationProposalSchema>;

export const interviewerProposalSchema = z.discriminatedUnion("mode", [
  z.object({
    mode: z.literal("open_wave"),
    mission: waveMissionProposalSchema,
    action: z.literal("continue"),
    bridge: z.string().optional(),
    mission_status: z.literal("opening"),
    questions: z.array(openingQuestionProposalSchema).min(5).max(8),
    reason: z.string().min(1),
    route_decision_affected: z.string().min(1),
  }),
  z.object({
    mode: z.literal("continue_wave"),
    action: z.enum(["continue", "end_wave"]),
    bridge: z.string().optional(),
    mission_status: z.enum(["developing", "sufficient", "blocked"]),
    questions: z.array(continuationQuestionProposalSchema).min(0).max(3),
    reason: z.string().min(1),
    route_decision_affected: z.string().min(1),
  }),
  z.object({
    mode: z.literal("propose_deep_dive"),
    action: z.literal("deep_dive"),
    bridge: z.string().optional(),
    mission_status: z.enum(["sufficient", "blocked"]),
    questions: z.array(z.never()),
    reason: z.string().min(1),
    route_decision_affected: z.string().min(1),
    deep_dive_reason: deepDiveReasonSchema,
    source_refs: z.array(sourceRefSchema).min(1),
  }),
]);
export type InterviewerProposal = z.infer<typeof interviewerProposalSchema>;

export const answerSchema = z.object({
  id: idSchema,
  question_id: idSchema.optional(),
  source_ref: sourceRefSchema,
  selected_option_ids: z.array(idSchema).optional(),
  skipped: z.boolean(),
  created_from: z.enum(["card", "composer"]),
});
export type Answer = z.infer<typeof answerSchema>;

export const answerCoverageSchema = z.object({
  source_ref: sourceRefSchema,
  resolved_question_ids: z.array(idSchema),
  proposed_by: z.enum(["host", "model"]),
  explanation: z.string().min(1),
});
export type AnswerCoverage = z.infer<typeof answerCoverageSchema>;

export const claimProposalSchema = claimSchema.omit({
  id: true,
  generation_provenance_id: true,
  calibration: true,
  status: true,
  superseded_by_id: true,
});
export type ClaimProposal = z.infer<typeof claimProposalSchema>;

export const constraintProposalSchema = constraintSchema.omit({ id: true, generation_provenance_id: true, status: true });
export type ConstraintProposal = z.infer<typeof constraintProposalSchema>;

export const routeIntentProposalSchema = routeIntentSchema.omit({ id: true, generation_provenance_id: true, status: true });
export type RouteIntentProposal = z.infer<typeof routeIntentProposalSchema>;

export const memoryOperationSchema = z.discriminatedUnion("op", [
  z.object({ op: z.literal("add_claim"), value: claimSchema }),
  z.object({ op: z.literal("supersede_claim"), prior_id: idSchema, value: claimSchema }),
  z.object({ op: z.literal("invalidate_claim"), id: idSchema, reason_source_ref: sourceRefSchema }),
  z.object({ op: z.literal("add_constraint"), value: constraintSchema }),
  z.object({ op: z.literal("update_radar"), value: radarDeltaSchema }),
  z.object({ op: z.literal("add_route_intent_seed"), value: routeIntentSchema }),
  z.object({ op: z.literal("mark_stale"), ids: z.array(idSchema).min(1), source_ref: sourceRefSchema }),
]);
export type MemoryOperation = z.infer<typeof memoryOperationSchema>;

export const memoryOperationProposalSchema = z.discriminatedUnion("op", [
  z.object({ op: z.literal("add_claim"), value: claimProposalSchema }),
  z.object({ op: z.literal("supersede_claim"), prior_id: idSchema, value: claimProposalSchema }),
  z.object({ op: z.literal("invalidate_claim"), id: idSchema, reason_source_ref: sourceRefSchema }),
  z.object({ op: z.literal("add_constraint"), value: constraintProposalSchema }),
  z.object({ op: z.literal("update_radar"), value: radarDeltaSchema }),
  z.object({ op: z.literal("add_route_intent_seed"), value: routeIntentProposalSchema }),
  z.object({ op: z.literal("mark_stale"), ids: z.array(idSchema).min(1), source_ref: sourceRefSchema }),
]);
export type MemoryOperationProposal = z.infer<typeof memoryOperationProposalSchema>;

export const insightStatusSchema = z.enum(["proposed", "generated", "calibrated", "stale", "invalidated"]);
export type InsightStatus = z.infer<typeof insightStatusSchema>;

export const immediateInsightSchema = z.object({
  id: idSchema,
  wave_id: idSchema,
  generation_provenance_id: idSchema,
  generated_at: isoDateTimeSchema,
  user_told_me: z.string().min(1),
  current_reading: z.string().min(1),
  important_unknown: z.string().min(1),
  radar_deltas: z.array(radarDeltaSchema),
  route_impact: z.string().min(1),
  evidence: z.array(evidenceLinkSchema).min(1),
  status: insightStatusSchema,
  language_strength: z.enum(["tentative", "well_supported", "conflicted"]),
});
export type ImmediateInsight = z.infer<typeof immediateInsightSchema>;

export const immediateInsightProposalSchema = immediateInsightSchema.omit({
  id: true,
  generation_provenance_id: true,
  generated_at: true,
  status: true,
}).extend({
  status: z.literal("proposed"),
});
export type ImmediateInsightProposal = z.infer<typeof immediateInsightProposalSchema>;

export const waveSensemakerProposalSchema = z.object({
  base_revision: revisionSchema,
  operations: z.array(memoryOperationProposalSchema),
  insight: immediateInsightProposalSchema,
});
export type WaveSensemakerProposal = z.infer<typeof waveSensemakerProposalSchema>;

export const calibrationSchema = z.object({
  id: idSchema,
  insight_id: idSchema,
  verdict: z.enum(["accurate", "partly_accurate", "inaccurate"]),
  correction_text: z.string().optional(),
  preferred_direction: z.enum(["continue_here", "change_direction", "preview", "pause"]).optional(),
  source_ref: sourceRefSchema,
});
export type Calibration = z.infer<typeof calibrationSchema>;

export const gateStatusSchema = z.enum(["met", "unmet", "waived_by_user", "not_applicable"]);
export type GateStatus = z.infer<typeof gateStatusSchema>;

export const routeReadinessSchema = z.object({
  design_question: gateStatusSchema,
  ordinary_day_anchor: gateStatusSchema,
  six_dimensions_handled: gateStatusSchema,
  four_dimensions_grounded: gateStatusSchema,
  distinct_route_intents: gateStatusSchema,
  material_tradeoff: gateStatusSchema,
  calibration: gateStatusSchema,
  safety_clear: gateStatusSchema,
  source_refs: z.array(sourceRefSchema),
  formal_ready: z.boolean(),
  provisional_allowed: z.boolean(),
  provisional_requested: z.boolean(),
  evaluated_at_wave: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]),
  evaluated_at_revision: revisionSchema,
});
export type RouteReadiness = z.infer<typeof routeReadinessSchema>;

export const safetyFlagSchema = z.object({
  id: idSchema,
  session_id: idSchema,
  policy_version: z.string().min(1),
  trigger_code: z.string().min(1),
  status: z.enum(["active", "resolved"]),
  source_refs: z.array(sourceRefSchema),
  created_at: isoDateTimeSchema,
  resolved_at: isoDateTimeSchema.optional(),
});
export type SafetyFlag = z.infer<typeof safetyFlagSchema>;

export const generationProvenanceSchema = z.object({
  id: idSchema,
  session_id: idSchema,
  proposal_id: idSchema,
  correlation_id: idSchema,
  prompt_contract_revision: z.literal(3),
  prompt_file_hash: z.string().min(1),
  schema_hash: z.string().min(1),
  context_builder_version: z.string().min(1),
  context_hash: z.string().min(1),
  provider: z.string().min(1),
  model: z.string().min(1),
  model_config_json: z.unknown(),
  model_config_hash: z.string().min(1),
  fixture_suite_version: z.string().min(1),
  created_at: isoDateTimeSchema,
});
export type GenerationProvenance = z.infer<typeof generationProvenanceSchema>;

// Event contracts from state-and-persistence-protocol.md

export const actorKindSchema = z.enum(["user", "host", "interviewer", "sensemaker", "system"]);
export type ActorKind = z.infer<typeof actorKindSchema>;

export const eventEnvelopeSchema = <T extends z.ZodTypeAny>(payloadSchema: T) =>
  z.object({
    event_id: idSchema,
    event_type: z.string().min(1),
    schema_version: z.literal(3),
    session_id: idSchema,
    actor: actorKindSchema,
    base_revision: revisionSchema,
    emitted_at: isoDateTimeSchema,
    idempotency_key: z.string().min(1),
    correlation_id: idSchema,
    causation_id: idSchema.optional(),
    proposal_id: idSchema.optional(),
    safety_flag: safetyFlagSchema.optional(),
    payload_hash: z.string().min(1),
    payload: payloadSchema,
  });

export const transitionEventRowSchema = z.object({
  session_id: idSchema,
  event_id: idSchema,
  event_type: z.string().min(1),
  schema_version: z.literal(3),
  base_revision: revisionSchema,
  committed_revision: revisionSchema,
  idempotency_key: z.string().min(1),
  payload_hash: z.string().min(1),
  correlation_id: idSchema,
  causation_id: idSchema.optional(),
  proposal_id: idSchema.optional(),
  actor: actorKindSchema,
  from_state: z.string().min(1),
  to_state: z.string().min(1),
  event_metadata_json: z.unknown(),
  state_snapshot_json: z.unknown(),
  snapshot_hash: z.string().min(1),
  committed_at: isoDateTimeSchema,
});
export type TransitionEventRow = z.infer<typeof transitionEventRowSchema>;

export const sessionStateHeadSchema = z.object({
  session_id: idSchema,
  revision: revisionSchema,
  machine_version: z.literal(3),
  state_value_json: z.unknown(),
  public_context_json: z.unknown(),
  resume_state_json: z.unknown().optional(),
  snapshot_hash: z.string().min(1),
  updated_at: isoDateTimeSchema,
});
export type SessionStateHead = z.infer<typeof sessionStateHeadSchema>;

export const proposalEnvelopeSchema = <T extends z.ZodTypeAny>(payloadSchema: T) =>
  z.object({
    proposal_id: idSchema,
    mode: z.string().min(1),
    schema_version: z.literal(3),
    session_id: idSchema,
    base_revision: revisionSchema,
    correlation_id: idSchema,
    attempt: z.union([z.literal(1), z.literal(2)]),
    provenance: z.object({
      prompt_contract_revision: z.literal(3),
      prompt_file_hash: z.string().min(1),
      schema_hash: z.string().min(1),
      context_builder_version: z.string().min(1),
      context_hash: z.string().min(1),
      provider: z.string().min(1),
      model: z.string().min(1),
      model_config_json: z.unknown(),
      model_config_hash: z.string().min(1),
      fixture_suite_version: z.string().min(1),
    }),
    payload_hash: z.string().min(1),
    generated_at: isoDateTimeSchema,
    payload: payloadSchema,
  });

export const ordinaryDaySchema = z.object({
  id: idSchema,
  route_intent_id: idSchema,
  generation_provenance_id: idSchema,
  moments: z.array(z.string().min(1)).min(4).max(6),
  screens: z.record(radarDimensionSchema, z.string().min(1)),
  epistemic_status: epistemicStatusSchema,
  evidence: z.array(evidenceLinkSchema),
});
export type OrdinaryDay = z.infer<typeof ordinaryDaySchema>;

export const dayNarrativeSceneSchema = z.object({
  text: z.string().min(1),
});
export type DayNarrativeScene = z.infer<typeof dayNarrativeSceneSchema>;

export const dayNarrativeSchema = z.object({
  scenes: z.array(dayNarrativeSceneSchema).min(4).max(8),
});
export type DayNarrative = z.infer<typeof dayNarrativeSchema>;

export const prototypeEmbedSchema = z.object({
  hypothesis: z.string().min(1),
  today_action: z.string().min(1),
  what_to_observe: z.string().min(1),
  day_1: z.string().min(1),
  day_2: z.string().min(1),
  day_3: z.string().min(1),
  time_ceiling_hours: z.number().min(0.5).max(6),
  money_ceiling: z.string().min(1),
  reversible_because: z.string().min(1),
  feedback_source: z.string().min(1),
  continue_signal: z.string().min(1),
  pause_or_exit_note: z.string().min(1),
  safety_check: z.string().min(1),
});
export type PrototypeEmbed = z.infer<typeof prototypeEmbedSchema>;

// ── Per-life design basis (internal — links life back to analysis) ──

export const designBasisSchema = z.object({
  principle_refs: z.array(z.string().min(1)).min(1),
  seed_ref: z.string().min(1),
  lived_difference: z.string().min(1),
  narrative_anchor: z.string().min(1),
  prototype_question: z.string().min(1),
});
export type DesignBasis = z.infer<typeof designBasisSchema>;

export const parallelLifeSchema = z.object({
  id: idSchema,
  route_intent_id: idSchema,
  generation_provenance_id: idSchema,
  design_basis: designBasisSchema,
  title: z.string().min(1),
  core_experience: z.string().min(1),
  year_1: z.string().min(1),
  year_2: z.string().min(1),
  year_3: z.string().min(1),
  ordinary_day: z.string().min(1),
  day_narrative: dayNarrativeSchema,
  attractions: z.array(z.string().min(1)).min(1),
  costs_and_tradeoffs: z.array(z.string().min(1)).min(1),
  evidence_for: z.array(evidenceLinkSchema).min(1),
  assumptions: z.array(z.string().min(1)),
  uncertainties: z.array(z.string().min(1)).min(1),
  risks: z.array(z.string().min(1)).min(1),
  prototype: prototypeEmbedSchema,
  trial_id: idSchema,
});
export type ParallelLife = z.infer<typeof parallelLifeSchema>;

export const blueprintEmbedSchema = z.object({
  current_coordinate: z.string().min(1),
  key_tensions: z.array(z.string().min(1)).min(1).max(3),
  recurring_elements: z.array(z.string().min(1)).min(1).max(3),
});
export type BlueprintEmbed = z.infer<typeof blueprintEmbedSchema>;

// ── Analysis layer (revision 5, internal — not shown directly to users) ──

export const analysisFindingSchema = z.object({
  summary: z.string().min(1),
  kind: epistemicStatusSchema,
  evidence_for: z.array(evidenceLinkSchema),
  uncertainty: z.string().nullable(),
});
export type AnalysisFinding = z.infer<typeof analysisFindingSchema>;

export const structureChangeSchema = z.object({
  axis: z.enum(["daily_rhythm", "work_learning", "relationships", "environment", "responsibilities", "meaning"]),
  change: z.string().min(1),
});
export type StructureChange = z.infer<typeof structureChangeSchema>;

export const lifeDashboardSchema = z.object({
  health: analysisFindingSchema.nullable(),
  work_learning: analysisFindingSchema.nullable(),
  play: analysisFindingSchema.nullable(),
  relationships: analysisFindingSchema.nullable(),
  cross_domain_effects: z.array(analysisFindingSchema),
});
export type LifeDashboard = z.infer<typeof lifeDashboardSchema>;

export const compassSchema = z.object({
  workview: analysisFindingSchema.nullable(),
  lifeview: analysisFindingSchema.nullable(),
  alignments: z.array(analysisFindingSchema),
  tensions: z.array(analysisFindingSchema),
});
export type Compass = z.infer<typeof compassSchema>;

export const energyPatternSchema = z.object({
  activity: z.string().min(1),
  conditions: z.array(z.string().min(1)),
  engagement: z.string().nullable(),
  after_effect: z.string().nullable(),
  finding: analysisFindingSchema,
  counter_evidence: z.array(evidenceLinkSchema),
});
export type EnergyPattern = z.infer<typeof energyPatternSchema>;

export const problemFrameSchema = z.object({
  presenting_question: z.string().nullable(),
  constraints: z.array(analysisFindingSchema),
  adjustable_factors: z.array(analysisFindingSchema),
  assumptions_to_test: z.array(analysisFindingSchema),
  design_question: analysisFindingSchema.nullable(),
});
export type ProblemFrame = z.infer<typeof problemFrameSchema>;

export const possibilitySeedSchema = z.object({
  direction: z.string().min(1),
  finding_refs: z.array(z.string().min(1)),
  structural_changes: z.array(structureChangeSchema).min(1),
  prerequisites: z.array(z.string().min(1)),
});
export type PossibilitySeed = z.infer<typeof possibilitySeedSchema>;

export const supportResourceSchema = z.object({
  resource: z.string().min(1),
  availability: z.enum(["available", "to_verify", "to_find"]),
  contribution: z.string().min(1),
  evidence_for: z.array(evidenceLinkSchema),
});
export type SupportResource = z.infer<typeof supportResourceSchema>;

export const designPrincipleSchema = z.object({
  principle: z.string().min(1),
  finding_refs: z.array(z.string().min(1)),
  tradeoff: z.string().nullable(),
});
export type DesignPrinciple = z.infer<typeof designPrincipleSchema>;

export const analysisSchema = z.object({
  life_dashboard: lifeDashboardSchema,
  compass: compassSchema,
  energy_patterns: z.array(energyPatternSchema),
  problem_frame: problemFrameSchema,
  possibility_seeds: z.array(possibilitySeedSchema),
  failure_learning: z.array(analysisFindingSchema),
  support_map: z.array(supportResourceSchema),
  design_principles: z.array(designPrincipleSchema),
});
export type Analysis = z.infer<typeof analysisSchema>;

export const parallelLivesPlanSchema = z.object({
  id: idSchema,
  session_id: idSchema,
  generation_provenance_id: idSchema,
  schema_version: z.literal("parallel-lives.v3"),
  provisional: z.boolean(),
  framing: z.string().min(1),
  blueprint: blueprintEmbedSchema,
  analysis: analysisSchema,
  lives: z.array(parallelLifeSchema).length(3),
  shared_values: z.array(z.string().min(1)).min(2),
  real_tradeoff: z.string().min(1),
  open_questions: z.array(z.string().min(1)).min(1),
});
export type ParallelLivesPlan = z.infer<typeof parallelLivesPlanSchema>;

export const trialStatusSchema = z.enum(["not_started", "active", "paused", "completed", "exited"]);
export type TrialStatus = z.infer<typeof trialStatusSchema>;

export const trialInstanceSchema = z.object({
  id: idSchema,
  session_id: idSchema,
  route_intent_id: idSchema,
  parallel_life_id: idSchema,
  prototype_id: idSchema,
  status: trialStatusSchema,
  started_at: isoDateTimeSchema,
  paused_at: isoDateTimeSchema.optional(),
  completed_at: isoDateTimeSchema.optional(),
  exited_at: isoDateTimeSchema.optional(),
});
export type TrialInstance = z.infer<typeof trialInstanceSchema>;

export const prototypeSchema = z.object({
  id: idSchema,
  session_id: idSchema,
  trial_id: idSchema,
  generation_provenance_id: idSchema,
  hypothesis: z.string().min(1),
  today_action: z.string().min(1),
  what_to_observe: z.string().min(1),
  day_1: z.string().min(1),
  day_2: z.string().min(1),
  day_3: z.string().min(1),
  time_ceiling_hours: z.number().min(0.5).max(6),
  money_ceiling: z.string().min(1),
  reversible_because: z.string().min(1),
  feedback_source: z.string().min(1),
  continue_signal: z.string().min(1),
  pause_or_exit_note: z.string().min(1),
  safety_check: z.string().min(1),
});
export type Prototype = z.infer<typeof prototypeSchema>;

export const blueprintSchema = z.object({
  id: idSchema,
  session_id: idSchema,
  generation_provenance_id: idSchema,
  snapshot_revision: revisionSchema,
  summary: z.string().min(1),
  open_questions: z.array(z.string().min(1)),
});
export type Blueprint = z.infer<typeof blueprintSchema>;

export const chatScopeSchema = z.enum([
  "explain",
  "compare",
  "adjust",
  "blueprint",
  "reflect_on_trial",
]);
export type ChatScope = z.infer<typeof chatScopeSchema>;

// Utility: EventEnvelope with typed payload
export type EventEnvelope<TType extends string, TPayload> = {
  event_id: Id;
  event_type: TType;
  schema_version: 3;
  session_id: Id;
  actor: "user" | "host" | "interviewer" | "sensemaker" | "system";
  base_revision: Revision;
  emitted_at: ISODateTime;
  idempotency_key: string;
  correlation_id: Id;
  causation_id?: Id;
  proposal_id?: Id;
  safety_flag?: SafetyFlag;
  payload_hash: string;
  payload: TPayload;
};
