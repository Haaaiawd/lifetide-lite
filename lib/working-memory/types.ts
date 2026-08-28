// Runtime types for the WorkingMemory and Sensemaker contracts.
// See .loom/design/insight-plan-contracts.md

export type Id = string;

export type Confidence = "low" | "medium" | "high";
export type Status = "active" | "invalidated" | "resolved";
export type SupportStatus = "supported" | "unsupported" | "stale";

export type SourceRef =
  | { kind: "answer"; answer_id: Id; question_id: Id; wave_id: Id }
  | { kind: "insight_feedback"; feedback_id: Id; wave_id: Id }
  | { kind: "user_correction"; correction_id: Id; wave_id: Id }
  | { kind: "upload_chunk"; document_id: Id; chunk_id: Id }
  | { kind: "chat_note"; thread_id: Id; message_id: Id };

export type ResponseKind = "short_text" | "single_choice" | "multi_choice" | "scale";
export type Sensitivity = "normal" | "sensitive";

export type InterviewQuestion = {
  id: Id;
  wave_id: Id;
  order: number;
  text: string;
  why_this_matters?: string;
  response_kind: ResponseKind;
  options?: Array<{ id: Id; label: string }>;
  allows_custom?: boolean;
  sensitivity: Sensitivity;
  allows_skip: true;
  asks_for_concrete_example: boolean;
};

export type UploadChunk = {
  document_id: Id;
  chunk_id: Id;
  ordinal: number;
  text: string;
  content_hash: string;
  trust: "untrusted_user_data";
  injection_pattern_detected: boolean;
};

export type InterviewAnswer = {
  id: Id;
  question_id: Id;
  wave_id: Id;
  value?: string | string[] | number;
  skipped: boolean;
  correction?: string;
  submitted_at: string;
};

export type EvidenceNote = {
  id: Id;
  statement: string;
  source_refs: [SourceRef, ...SourceRef[]];
  epistemic: "user_confirmed" | "user_reported" | "reported_in_document" | "model_inference";
  relevance: Array<"direction" | "energy" | "constraint" | "route" | "risk">;
  confidence: Confidence;
  status: Status;
  invalidated_by?: SourceRef;
};

export type Claim = {
  id: Id;
  text: string;
  evidence_ids: [Id, ...Id[]];
  confidence: Confidence;
  status: Status;
  correction_note?: string;
};

export type ConstraintKind =
  | "time"
  | "money"
  | "health"
  | "care"
  | "location"
  | "relationship"
  | "legal"
  | "other";

export type Constraint = {
  id: Id;
  text: string;
  kind: ConstraintKind;
  flexibility: "fixed_now" | "negotiable" | "unknown";
  evidence_ids: [Id, ...Id[]];
  status: Status;
};

export type RouteSeed = {
  id: Id;
  title_hint: string;
  life_shape: string;
  distinct_on: string;
  appeal_evidence_ids: Id[];
  feasibility_evidence_ids: Id[];
  uncertainty_ids: Id[];
  status: Status;
};

export type UncertaintyFactors = {
  plan_impact: 0 | 1 | 2 | 3;
  evidence_gap: 0 | 1 | 2 | 3;
  user_salience: 0 | 1 | 2 | 3;
  reversibility_value: 0 | 1 | 2 | 3;
  sensitivity_cost: 0 | 1 | 2 | 3;
  repetition_cost: 0 | 1 | 2 | 3;
};

export type Uncertainty = {
  id: Id;
  question: string;
  plan_consequence: string;
  related_evidence_ids: Id[];
  related_route_seed_ids: Id[];
  factors: UncertaintyFactors;
  priority: number;
  created_wave: number;
  status: "active" | "resolved" | "declined";
  resolution_evidence_ids?: Id[];
};

export type InsightVerdict = "accurate" | "partly_accurate" | "inaccurate";

export type InsightFeedback = {
  id: Id;
  wave_id: Id;
  verdict: InsightVerdict;
  correction?: string;
  next_interest?: string;
  created_at: string;
};

export type WorkingMemory = {
  schema_version: "wm.v1";
  session_id: Id;
  revision: number;
  evidence: EvidenceNote[];
  claims: Claim[];
  constraints: Constraint[];
  route_seeds: RouteSeed[];
  uncertainties: Uncertainty[];
  recent_feedback: InsightFeedback[];
  last_wave_index: number;
  updated_at: string;
};

export type ImmediateInsight = {
  observation: string;
  interpretation: string;
  uncertainty: string;
  evidence_ids: [Id, ...Id[]];
  confidence: Confidence;
  kind: "pattern" | "tension" | "constraint" | "possibility";
  feedback_prompt: string;
};

// A UI-facing display shape derived from an ImmediateInsight + WorkingMemory.
export type InsightView = {
  wave: number;
  facts: string[];
  evidence: string[];
  interpretation: string;
  uncertainty: string;
};

export type SensemakerWaveOutput = {
  schema_version: "sensemaker.wave.output.v1";
  expected_revision: number;
  operations: MemoryOperation[];
  insight: ImmediateInsight;
};

export type BurdenSignals = {
  median_answer_chars: number;
  skip_rate: number;
  elapsed_minutes: number;
  user_requested_shorter: boolean;
};

export type InterviewerInput = {
  schema_version: "interviewer.input.v1";
  session_id: Id;
  next_wave_id: Id;
  next_wave_index: number;
  selected_uncertainty_id: Id;
  ranked_active_uncertainty_ids: [Id, ...Id[]];
  selected_uncertainty: Uncertainty;
  relevant_evidence: EvidenceNote[];
  relevant_constraints: Constraint[];
  latest_feedback?: InsightFeedback;
  recent_question_texts: string[];
  burden: BurdenSignals;
  prompt_version: string;
};

export type InterviewerOutput = {
  schema_version: "interviewer.output.v1";
  focus_uncertainty_id: Id;
  focus_reason: string;
  questions: InterviewQuestion[];
};

export type SensemakerWaveInput = {
  schema_version: "sensemaker.wave.input.v1";
  session_id: Id;
  wave_id: Id;
  wave_index: number;
  focus_uncertainty_id?: Id;
  questions: InterviewQuestion[];
  answers: InterviewAnswer[];
  upload_chunks?: UploadChunk[];
  memory: WorkingMemory;
  expected_revision: number;
  prompt_version: string;
};

export type MemoryOperation =
  | { op: "add_evidence"; item: Omit<EvidenceNote, "id"> & { temp_id: string } }
  | { op: "invalidate_evidence"; evidence_id: Id; by: SourceRef }
  | { op: "upsert_claim"; target_id?: Id; item: Omit<Claim, "id"> & { temp_id?: string } }
  | { op: "invalidate_claim"; claim_id: Id; correction_note: string }
  | { op: "upsert_constraint"; target_id?: Id; item: Omit<Constraint, "id"> & { temp_id?: string } }
  | { op: "upsert_route_seed"; target_id?: Id; item: Omit<RouteSeed, "id"> & { temp_id?: string } }
  | { op: "upsert_uncertainty"; target_id?: Id; item: Omit<Uncertainty, "id" | "priority"> & { temp_id?: string } }
  | { op: "resolve_uncertainty"; uncertainty_id: Id; resolution_evidence_ids: Id[] };

export function makeEmptyWorkingMemory(sessionId: Id): WorkingMemory {
  return {
    schema_version: "wm.v1",
    session_id: sessionId,
    revision: 0,
    evidence: [],
    claims: [],
    constraints: [],
    route_seeds: [],
    uncertainties: [],
    recent_feedback: [],
    last_wave_index: 0,
    updated_at: new Date().toISOString(),
  };
}

export function recomputeUncertaintyPriority(factors: UncertaintyFactors): number {
  return (
    4 * factors.plan_impact +
    3 * factors.evidence_gap +
    2 * factors.user_salience +
    factors.reversibility_value -
    3 * factors.sensitivity_cost -
    2 * factors.repetition_cost
  );
}

export function isValidId(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

export type EvidenceLink = {
  evidence_id: Id;
  supports: string;
};

export type TrialStatus = "not_started" | "active" | "paused" | "completed" | "exited";

// A low-cost, reversible prototype. The UI may call it "试玩" or "最小原型".
export type Prototype = {
  hypothesis: string;
  today_action: string;
  what_to_observe: string;
  day_1: string;
  day_2: string;
  day_3: string;
  time_ceiling_hours: number;
  money_ceiling: string;
  reversible_because: string;
  feedback_source: string;
  continue_signal: string;
  pause_or_exit_note: string;
  safety_check: string;
};

// Sensemaker final output: exactly three equal, evidence-linked parallel lives.
// See .loom/design/insight-plan-contracts.md § ParallelLife v2
export type ParallelLife = {
  id: Id;
  title: string;
  core_experience: string;
  year_1: string;
  year_2: string;
  year_3: string;
  ordinary_day: string;
  attractions: string[];
  costs_and_tradeoffs: string[];
  evidence_for: EvidenceLink[];
  assumptions: string[];
  uncertainties: string[];
  risks: string[];
  trial: Prototype;
};

export type FinalPlan = {
  schema_version: "parallel-lives.v2";
  session_id: Id;
  memory_revision: number;
  provisional: boolean;
  framing: string;
  lives: [ParallelLife, ParallelLife, ParallelLife];
  shared_values: string[];
  real_tradeoff: string;
  open_questions: string[];
  generated_at: string;
  prompt_version: string;
  model_config_id: string;
};

export type SensemakerFinalInput = {
  schema_version: "sensemaker.final.input.v1";
  memory: WorkingMemory;
  stop_reason: "sufficient" | "user_requested" | "wave_limit" | "question_limit" | "degraded";
  provisional: boolean;
  final_user_note?: string;
  prompt_version: string;
};

export type ContractErrorCode =
  | "SCHEMA_INVALID"
  | "STALE_MEMORY_REVISION"
  | "UNKNOWN_OR_CROSS_TENANT_REF"
  | "FOCUS_MISMATCH"
  | "QUESTION_COUNT_OUT_OF_RANGE"
  | "MEMORY_LIMIT_EXCEEDED"
  | "UNSUPPORTED_CLAIM"
  | "PLAN_NOT_DISTINCT"
  | "PLAN_RANKING_DETECTED"
  | "TRIAL_NOT_REVERSIBLE"
  | "CONTEXT_REQUIRED_FIELD_TRUNCATED"
  | "CHAT_SCOPE_EXCEEDED";

export type ContractError = {
  code: ContractErrorCode;
  retryable: boolean;
  path?: string;
  safe_detail: string;
  trace_id: Id;
};
