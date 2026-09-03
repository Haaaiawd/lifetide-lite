// Runtime types for the WorkingMemory and Sensemaker contracts.
// WorkingMemory is the host-owned runtime view of the v3 WorkingUnderstanding,
// plus a small set of runtime-only fields not present in the v3 contract.
// See .loom/design/insight-plan-contracts.md

import type {
  Id,
  Revision,
  SourceRef,
  SourceVersion,
  SourceHead,
  EvidenceLink,
  RadarCell,
  Claim,
  Constraint,
  RouteIntent,
  WorkingUnderstanding,
  Question as ContractQuestion,
  QuestionResponseKind,
  Calibration,
  ParallelLivesPlan,
  ParallelLife as ContractParallelLife,
  Analysis as ContractAnalysis,
  Prototype as ContractPrototype,
  MemoryOperationProposal,
  ImmediateInsight as ContractImmediateInsight,
  ImmediateInsightProposal,
  WaveSensemakerProposal,
  InterviewerProposal,
  ChatScope,
  GenerationProvenance,
} from "@/lib/state/contracts";
import type { PersonaPortrait } from "@/lib/portrait/types";

// Re-export the small contract primitives used at runtime.
export type {
  Id,
  Revision,
  SourceRef,
  SourceVersion,
  SourceHead,
  EvidenceLink,
  RadarCell,
  Claim,
  Constraint,
  RouteIntent,
  WorkingUnderstanding,
  Question as ContractQuestion,
  QuestionResponseKind,
  Calibration,
  ParallelLivesPlan,
  ParallelLife as ContractParallelLife,
  Analysis as ContractAnalysis,
  Prototype as ContractPrototype,
  MemoryOperationProposal,
  ImmediateInsight as ContractImmediateInsight,
  ImmediateInsightProposal,
  WaveSensemakerProposal,
  InterviewerProposal,
  ChatScope,
  GenerationProvenance,
} from "@/lib/state/contracts";

// UI-facing response-kind subset. v3 prompt may also produce rank / anchored_scale /
// scene_text; we treat them as single or short for now until the UI supports them.
export type ResponseKind = "short_text" | "single_choice" | "multi_choice" | "scale";
export type Sensitivity = "normal" | "sensitive";

// Host-rendered question. Kept separate from the contract `Question` because the
// contract requires host-owned provenance fields the UI does not need.
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

// Runtime-only: feedback view used by the insight slip and host decision logic.
// Conceptually a `Calibration` plus the wave it belongs to.
export type InsightVerdict = "accurate" | "partly_accurate" | "inaccurate";
export type InsightFeedback = Calibration & {
  wave_id: Id;
  created_at: string;
};

// Runtime-only uncertainty used by focus selection and interviewer input.
// Not part of the v3 WorkingUnderstanding contract.
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
  related_evidence: EvidenceLink[];
  related_route_intent_ids: Id[];
  factors: UncertaintyFactors;
  priority: number;
  created_wave: number;
  status: "active" | "resolved" | "declined";
  resolution?: EvidenceLink[];
};

// Runtime WorkingMemory = v3 WorkingUnderstanding + host runtime fields.
export type WorkingMemory = WorkingUnderstanding & {
  schema_version: "wm.v3";
  last_wave_index: number;
  updated_at: string;
  // Uncertainties are a host runtime structure for focus selection and
  // interviewer input, not part of the v3 WorkingUnderstanding contract.
  uncertainties: Uncertainty[];
  // Feedback received on insights. Not part of the v3 WorkingUnderstanding contract,
  // but required for route-readiness and stop evaluation.
  recent_feedback: InsightFeedback[];
  // Last committed parallel-lives plan, if any.
  finalPlan?: ParallelLivesPlan;
  // Persona portrait generated before blueprint, if any.
  persona_portrait?: PersonaPortrait;
  // Last insight shown to the user, for resume after page refresh.
  // Cleared when the user calibrates (accurate/partly/inaccurate) or
  // moves to the next wave.
  last_insight?: ImmediateInsight;
};

// Immediate insight presented to the user. Uses the v3 contract (host-assigned
// id, status, etc.), not the model-facing proposal.
export type ImmediateInsight = ContractImmediateInsight;

export type InsightView = {
  wave: number;
  facts: string[];
  evidence: string[];
  interpretation: string;
  uncertainty: string;
};

export type SensemakerWaveOutput = WaveSensemakerProposal & {
  // Host-side revision expectation. Not part of the model-facing proposal.
  expected_revision: number;
};

export type BurdenSignals = {
  median_answer_chars: number;
  skip_rate: number;
  elapsed_minutes: number;
  user_requested_shorter: boolean;
};

export type InterviewerInput = {
  schema_version: "interviewer.input.v3";
  session_id: Id;
  next_wave_id: Id;
  next_wave_index: number;
  selected_uncertainty_id: Id;
  ranked_active_uncertainty_ids: [Id, ...Id[]];
  selected_uncertainty: Uncertainty;
  relevant_evidence: SourceVersion[];
  relevant_constraints: Constraint[];
  latest_feedback?: InsightFeedback;
  recent_question_texts: string[];
  upload_chunks?: UploadChunk[];
  burden: BurdenSignals;
  prompt_version: string;
};

export type InterviewerOutput = {
  schema_version: "interviewer.output.v3";
  focus_uncertainty_id: Id;
  focus_reason: string;
  questions: InterviewQuestion[];
  // Full v3 proposal, kept for ledger / provenance.
  proposal: InterviewerProposal;
};

export type SensemakerWaveInput = {
  schema_version: "sensemaker.wave.input.v3";
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

// v3 memory operation type. The host owns ID assignment and status transitions.
export type MemoryOperation = MemoryOperationProposal;

export type Confidence = "low" | "medium" | "high";
export type TrialStatus = "not_started" | "active" | "paused" | "completed" | "exited";

export function makeEmptyWorkingMemory(sessionId: Id): WorkingMemory {
  const now = new Date().toISOString();
  return {
    schema_version: "wm.v3",
    session_id: sessionId,
    revision: 0,
    design_question: undefined,
    design_question_source_refs: [],
    source_heads: [],
    source_versions: [],
    claims: [],
    constraints: [],
    radar: {
      traits: { dimension: "traits", state: "unseen", reason: "该维度尚无活跃证据", evidence: [], updated_at: now },
      motivation: { dimension: "motivation", state: "unseen", reason: "该维度尚无活跃证据", evidence: [], updated_at: now },
      capabilities: { dimension: "capabilities", state: "unseen", reason: "该维度尚无活跃证据", evidence: [], updated_at: now },
      relationships: { dimension: "relationships", state: "unseen", reason: "该维度尚无活跃证据", evidence: [], updated_at: now },
      environment: { dimension: "environment", state: "unseen", reason: "该维度尚无活跃证据", evidence: [], updated_at: now },
      narrative: { dimension: "narrative", state: "unseen", reason: "该维度尚无活跃证据", evidence: [], updated_at: now },
    },
    route_intents: [],
    corrections: [],
    declined_topics: [],
    uncertainties: [],
    recent_feedback: [],
    last_wave_index: 0,
    updated_at: now,
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

// UI-facing legacy shape for the final plan. It is derived from the v3
// ParallelLivesPlan + embedded prototypes so the existing RouteCarousel keeps
// working while the rest of the runtime moves to v3.
export type Prototype = ContractPrototype;

export type ParallelLife = ContractParallelLife & {
  // Runtime convenience: embed the full Prototype for backwards compat.
  trial: Prototype;
};

export type FinalPlan = {
  schema_version: "parallel-lives.v3.ui";
  id: Id;
  session_id: Id;
  generation_provenance_id: Id;
  provisional: boolean;
  framing: string;
  blueprint: {
    current_coordinate: string;
    key_tensions: string[];
    recurring_elements: string[];
  };
  analysis: ContractAnalysis;
  lives: [ParallelLife, ParallelLife, ParallelLife];
  shared_values: string[];
  real_tradeoff: string;
  open_questions: string[];
  created_at: string;
  prompt_version: string;
  model_config_id: string;
  // Host-only revision so chat threads can detect stale plans.
  memory_revision?: number;
};

export type SensemakerFinalInput = {
  schema_version: "sensemaker.final.input.v3";
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

export type ChatMessage = {
  id: Id;
  role: "user" | "assistant";
  text: string;
  scope?: ChatScope;
  cited_evidence_ids?: Id[];
  local_note?: string;
  created_at: string;
};

export type BoundedChatThread = {
  id: Id;
  session_id: Id;
  final_plan_revision: number;
  turns_used: number;
  status: "active" | "closed_limit" | "closed_user" | "closed_safety";
  local_notes: string[];
  messages: ChatMessage[];
};

export type SensemakerChatInput = {
  schema_version: "sensemaker.chat.input.v3";
  scope: ChatScope;
  message: string;
  plan: FinalPlan;
  memory_summary: string;
  recent_messages: Array<{ role: "user" | "assistant"; text: string }>;
  turns_remaining: number;
  prompt_version: string;
};

export type SensemakerChatOutput = {
  schema_version: "sensemaker.chat.output.v3";
  scope: ChatScope;
  response: string;
  cited_evidence_ids: Id[];
  local_note?: string;
  offer_reinterview: boolean;
  close_thread: boolean;
  suggested_blueprint?: boolean;
};
