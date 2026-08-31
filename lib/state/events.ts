// Event payload types from .loom/design/state-and-persistence-protocol.md
// These are the TypeScript companions to lib/state/contracts.ts

import type {
  Id,
  ISODateTime,
  Revision,
  SourceRef,
  SourceVersion,
  Wave,
  Microbatch,
  Answer,
  AnswerCoverage,
  WaveSensemakerProposal,
  Calibration,
  RouteIntent,
  DeepDiveRecommendation,
  OrdinaryDay,
  ParallelLivesPlan,
  TrialInstance,
  Prototype,
  Blueprint,
  ChatScope,
} from "./contracts";

export type SessionStarted = {
  guest_token_hash: string;
  expires_at: ISODateTime;
};

export type ConsentRecorded = {
  consent_version: string;
  ai: true;
  upload: boolean;
};

export type MaterialAttached = {
  upload_id: Id;
  source_refs: SourceRef[];
};

export type GenerationProvenance = {
  id: Id;
  session_id: Id;
  proposal_id: Id;
  correlation_id: Id;
  prompt_contract_revision: 3;
  prompt_file_hash: string;
  schema_hash: string;
  context_builder_version: string;
  context_hash: string;
  provider: string;
  model: string;
  model_config_json: unknown;
  model_config_hash: string;
  fixture_suite_version: string;
  created_at: ISODateTime;
};

export type ModelCommitMeta = {
  proposal_id: Id;
  generation_provenance: GenerationProvenance;
};

export type WaveMissionCommitted = ModelCommitMeta & {
  wave: Wave;
};

export type QuestionBatchCommitted = ModelCommitMeta & {
  wave_id: Id;
  batch: Microbatch;
};

export type AnswerSubmitted = {
  answer: Answer;
  source: SourceVersion;
  coverage: AnswerCoverage[];
};

export type AnswerRevised = {
  prior: SourceRef;
  next: SourceVersion;
  stale_artifact_ids: Id[];
};

export type DesignQuestionSet = {
  text: string;
  source: SourceVersion;
};

export type QuestionSkipped = {
  wave_id: Id;
  question_id: Id;
  elicitation_unit_id: Id;
};

export type WaveEndCommitted = ModelCommitMeta & {
  wave_id: Id;
  stop_reason: Wave["stop_reason"];
};

export type InsightCommitted = ModelCommitMeta & {
  proposal: WaveSensemakerProposal;
  insight_status: "generated";
};

export type CalibrationSubmitted = {
  calibration: Calibration;
  source: SourceVersion;
};

export type CalibrationSkipped = {
  insight_id: Id;
  explicitly_skipped: true;
};

export type NextWaveCommitted =
  | { kind: "core" }
  | (ModelCommitMeta & {
      kind: "deep_dive";
      recommendation: DeepDiveRecommendation;
    });

export type ProvisionalPreviewRequested = {
  requested_at_wave: 1 | 2 | 3 | 4 | 5;
  user_intent: "preview_only" | "end_and_shape_routes";
};

export type RoutePhaseEntered = {
  reason: "mission_sufficient" | "user_preview" | "user_stopped" | "wave_cap";
  interview_snapshot_revision: Revision;
};

export type RouteIntentCandidatesCommitted = ModelCommitMeta & {
  intents: RouteIntent[];
};

export type RouteIntentEdited = {
  intent_id?: Id;
  action: "edit" | "merge" | "reject" | "add";
  patch: Partial<Omit<RouteIntent, "id" | "generation_provenance_id" | "status">>;
  edit_source: SourceVersion;
};

export type RouteIntentsAccepted = {
  intents: [RouteIntent, RouteIntent, RouteIntent];
};

export type ReadinessGateWaived = {
  gate: "ordinary_day_anchor" | "six_dimensions_handled" | "four_dimensions_grounded" | "material_tradeoff";
  acknowledged_unknown: string;
  explicit: true;
};

export type OrdinaryDaysCommitted = ModelCommitMeta & {
  days: [OrdinaryDay, OrdinaryDay, OrdinaryDay];
};

export type OrdinaryDayScreeningStarted = {
  accepted_intent_ids: [Id, Id, Id];
};

export type OrdinaryDayCalibrated = {
  route_intent_id: Id;
  verdict: "like_me" | "not_like_me" | "unknown";
  target_ref: string;
  source: SourceVersion;
};

export type ParallelLivesCommitted = ModelCommitMeta & {
  plan: ParallelLivesPlan;
};

export type TrialStarted = {
  trial: TrialInstance;
  prototype: Prototype;
};

export type TrialStatusChanged = {
  trial_id: Id;
  note?: string;
};

export type TrialResumed = {
  trial_id: Id;
  prototype_ref: { trial_id: Id; prototype_id: Id };
};

export type TrialReflectionSubmitted = {
  trial_id: Id;
  source: SourceVersion;
};

export type BoundedReflectionOpened = {
  scope: ChatScope;
};

export type ChatNoteCommitted = {
  scope: ChatScope;
  note_source: SourceVersion;
  mutates_plan: false;
};

export type BlueprintCommitted = ModelCommitMeta & {
  blueprint: Blueprint;
};

export type ReflectionClosed = {
  return_to: "parallel_lives_ready";
};

export type SessionPaused = {
  resume_state: string;
  reason: "user" | "navigation" | "expiry_warning";
};

export type SessionResumed = {
  explicit: true;
};

export type ProviderFailed = {
  action: string;
  public_error_code: "timeout" | "rate_limited" | "provider_5xx" | "invalid_schema" | "repair_failed";
  correlation_id: Id;
  retry_count: number;
};

export type ProviderRecovered = {
  correlation_id: Id;
  outcome: "retry_succeeded" | "user_abandoned";
};

export type SafetyBoundaryTriggered = {
  flag: {
    id: Id;
    session_id: Id;
    policy_version: string;
    trigger_code: string;
    status: "active" | "resolved";
    source_refs: SourceRef[];
    created_at: ISODateTime;
    resolved_at?: ISODateTime;
  };
  locale?: string;
};

export type SessionDeleted = {
  scope: "session";
  ownership_confirmed: true;
};
