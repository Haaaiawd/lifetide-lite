# 理解、雷达与人生试运行契约

- Kind: data and behavior contract
- Status: canonical design target
- Runtime language: TypeScript + Zod equivalent
- Rule: model output is a proposal; only host-validated objects become committed state

## Contract conventions

```ts
type Id = string;
type ISODateTime = string;
type Revision = number;

type EpistemicStatus =
  | "user_stated"
  | "document_stated"
  | "external_fact"
  | "working_inference"
  | "design_hypothesis"
  | "imagination";

type CalibrationVerdict =
  | "unreviewed"
  | "accurate"
  | "partly_accurate"
  | "inaccurate";

type GenerationProvenance = {
  id: Id; // host assigned; immutable foreign-key target
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
  model_config_json: unknown; // canonical, secret-free generation parameters
  model_config_hash: string;
  fixture_suite_version: string;
  created_at: ISODateTime;
};
```

所有 domain id 在 session 内唯一。任何派生对象都记录精确 source revision；只引用逻辑 id 不足以抵御旧回答被编辑后的陈旧推断。

`GenerationProvenance` 是 accepted model call 的不可变持久化事实，不是日志装饰。每个由该 proposal 新建并持久化的 generated record 都以必填 `generation_provenance_id` 外键指向它；同一 proposal 原子生成的 mission、units、首批问题与 options 共享一条 provenance。用户或系统直接创建的对象不得伪造此字段。失败、过期或未提交的 proposal 不创建 provenance row。

## Source and evidence

```ts
type SourceKind =
  | "free_text"
  | "question_answer"
  | "material_excerpt"
  | "calibration"
  | "trial_reflection"
  | "external_research";

type SourceRef = {
  source_id: Id;
  source_revision: Revision;
};

type SourceVersion = {
  source_id: Id; // stable logical id inside one session
  session_id: Id;
  revision: Revision;
  kind: SourceKind;
  created_at: ISODateTime;
  untrusted: boolean;
  text_ref: Id; // points to protected content store, not ordinary logs
};

type SourceHead = {
  session_id: Id;
  source_id: Id;
  active_revision?: Revision; // absent only after deletion
  status: "active" | "deleted";
  deleted_at?: ISODateTime;
};

type EvidenceLink = SourceRef & {
  excerpt?: string; // short display-safe paraphrase or consented excerpt
  epistemic_status: EpistemicStatus;
  evidence_shape:
    | "abstract_statement"
    | "concrete_scene"
    | "observed_behavior"
    | "tradeoff"
    | "document_excerpt"
    | "calibration"
    | "external_fact"
    | "imagination";
  relevance: string;
};
```

`SourceVersion` 以 `(session_id, source_id, revision)` 作为不可变复合身份；同一个逻辑 source 的编辑插入 `revision + 1`，绝不原地覆盖。`SourceHead` 在同一事务内指向新版本，且一个逻辑 source 只有一个 active head。删除将 head tombstone，并使所有直接或传递依赖变为 `invalidated`。

所有 SourceRef 都必须属于当前 session 且指向一个真实的不可变版本。**支持 active artifact 的 EvidenceLink** 还必须指向 active head；旧版/已删除版本不能继续作为支持。**stale/invalidated 的因果与审计引用** 可以精确指向已 superseded/deleted 的旧版本，以解释为什么对象失效，但不能被当作新推断的 evidence。跨 tenant 或不存在的 ref 一律拒绝。

`document_stated` 永远不能自动升级为 `user_stated`。外部事实必须包含来源与核验时间；模型常识不是 `external_fact`。

## Six-dimension radar

```ts
type RadarDimension =
  | "traits"
  | "motivation"
  | "capabilities"
  | "relationships"
  | "environment"
  | "narrative";

type RadarState =
  | "unseen"
  | "signaled"
  | "grounded"
  | "conflicted"
  | "declined";

type RadarCell = {
  dimension: RadarDimension;
  state: RadarState;
  reason: string;
  evidence: EvidenceLink[];
  updated_at: ISODateTime;
};

type RadarDelta = {
  dimension: RadarDimension;
  from: RadarState;
  to: RadarState;
  reason: string;
  source_refs: SourceRef[];
};
```

Host validation:

- `unseen → grounded` 需要至少一个具体 scene/behavior/tradeoff source；纯抽象自述最多 `signaled`；
- 有 material contradiction 时不得覆盖成 `grounded`，应为 `conflicted` 或保留 conflict note；
- `declined` 只能来自用户明确选择，AI 不能推断；
- 无 evidence 的 delta 拒绝；
- 不存在数值 score、coverage 或 completion。

## Working understanding

```ts
type Claim = {
  id: Id;
  generation_provenance_id: Id;
  text: string;
  epistemic_status: "working_inference" | "design_hypothesis";
  evidence: EvidenceLink[];
  dimensions: RadarDimension[];
  calibration: CalibrationVerdict;
  status: "active" | "conflicted" | "superseded" | "invalidated" | "stale";
  superseded_by_id?: Id;
};

type Constraint = {
  id: Id;
  generation_provenance_id: Id;
  text: string;
  kind: "time" | "money" | "health" | "care" | "place" | "legal" | "other";
  flexibility: "fixed_now" | "negotiable" | "unknown";
  evidence: EvidenceLink[];
  status: "active" | "stale" | "invalidated";
};

type WorkingUnderstanding = {
  session_id: Id;
  revision: Revision;
  design_question?: string;
  design_question_source_refs: SourceRef[];
  source_heads: SourceHead[];
  source_versions: SourceVersion[];
  claims: Claim[];
  constraints: Constraint[];
  radar: Record<RadarDimension, RadarCell>;
  route_intents: RouteIntent[];
  corrections: Id[];
  declined_topics: string[];
};
```

这是决策记忆，不是 PersonaSnapshot。任何 profile/type/score 字段禁止进入 MVP schema。

## Wave and microbatch

```ts
type WaveKind = "core" | "deep_dive";
type DeepDiveReason =
  | "high_impact_signal"
  | "material_conflict"
  | "route_collapse"
  | "ordinary_day_invention_risk"
  | "user_requested";

type WaveMission = {
  id: Id;
  wave_id: Id;
  generation_provenance_id: Id;
  decision_to_improve: string;
  target_dimensions: RadarDimension[];
  known_source_refs: SourceRef[];
  important_unknown: string;
  why_now: string;
  exit_condition: string;
  sensitivity_ceiling: "ordinary" | "sensitive_with_permission";
};

type QuestionResponseKind =
  | "single_choice"
  | "multiple_choice"
  | "rank"
  | "anchored_scale"
  | "short_text"
  | "scene_text";

type QuestionOption = {
  id: Id;
  generation_provenance_id: Id;
  label: string;
  description?: string;
};

type Question = {
  id: Id;
  wave_id: Id;
  microbatch_id: Id;
  generation_provenance_id: Id;
  order_in_wave: number;
  elicitation_unit_id: Id;
  text: string;
  response_kind: QuestionResponseKind;
  options?: QuestionOption[];
  sensitivity: "ordinary" | "sensitive";
  why_this_matters: string;
  decision_target: string;
  asks_for_concrete_example: boolean;
  allows_skip: true;
  allows_free_text: true;
};

type Microbatch = {
  id: Id;
  wave_id: Id;
  generation_provenance_id: Id;
  index: number;
  session_revision: Revision;
  status: "proposed" | "committed" | "answered" | "superseded";
  questions: Question[]; // normally 2..3; final/covered batch may be 1
  idempotency_key: string;
};

type Wave = {
  id: Id;
  index: number; // 1..5
  kind: WaveKind;
  mission: WaveMission;
  status: "open" | "synthesizing" | "awaiting_calibration" | "closed";
  microbatches: Microbatch[]; // normally 2..4
  asked_count: number; // 0..10; may be <5 when unsolicited material precovered units
  elicitation_units: ElicitationUnit[]; // 5..10 at normal close
  covered_unit_count: number;
  stop_reason?:
    | "mission_sufficient"
    | "question_limit"
    | "user_stopped"
    | "user_material_covered"
    | "safety_boundary";
};
```

```ts
type ElicitationUnit = {
  id: Id;
  generation_provenance_id: Id;
  order_in_wave: number; // immutable contiguous 1..N; canonical serialization key
  decision_target: string;
  target_dimensions: RadarDimension[];
  status: "pending" | "asked" | "precovered" | "resolved" | "skipped";
  question_id?: Id;
  source_refs: SourceRef[];
};

type ElicitationUnitProposal = {
  decision_target: string;
  target_dimensions: RadarDimension[];
  precovered_by: SourceRef[]; // exact active refs only; empty when still pending
};
```

Validation:

- a normal wave processes 5–10 elicitation units; actual proposed questions are capped at 10 and may be fewer when exact user sources precover units；
- skipped questions consume `asked_count` but do not become resolved units；
- one question cannot hide multiple required subanswers；
- first wave mission must resolve/ask `why_now` and `recent_concrete_scene` functions；
- all questions relate to the one mission, but can touch several radar dimensions；
- `open_wave` supplies exactly 5–10 `ElicitationUnitProposal`s; the host does not invent their semantic targets. `propose_deep_dive` supplies only a recommendation；
- for `open_wave`, the host assigns wave/mission/unit/question/option ids exactly once and atomically commits the mission, all units and the first 1–3-question microbatch；
- every opening question points to one proposal-local `elicitation_unit_index`; after validation the host replaces it with the committed `elicitation_unit_id`. Every continuation question already points to an exact trusted committed unit id；
- `index > 5` or deep-dive count `> 2` is impossible at schema/transition layer, not prompt prose only。

## Answers and revisions

```ts
type Answer = {
  id: Id;
  question_id?: Id; // absent for unsolicited free text
  source_ref: SourceRef;
  selected_option_ids?: Id[];
  skipped: boolean;
  created_from: "card" | "composer";
};

type AnswerCoverage = {
  source_ref: SourceRef;
  resolved_question_ids: Id[];
  proposed_by: "host" | "model";
  explanation: string;
};
```

自由文本可以覆盖多个问题，但 coverage 只描述“已谈到”，不能把一句话拆成多个未经说出的事实。编辑回答会创建新 source revision，并使所有依赖旧 revision 的对象 `stale`。

## Interviewer proposal

```ts
type WaveMissionProposal = Omit<
  WaveMission,
  "id" | "wave_id" | "generation_provenance_id"
> & {
  elicitation_units: ElicitationUnitProposal[]; // exactly 5..10
};

type QuestionOptionProposal = Omit<QuestionOption, "id" | "generation_provenance_id">;

type QuestionContentProposal = Omit<
  Question,
  | "id"
  | "wave_id"
  | "microbatch_id"
  | "generation_provenance_id"
  | "order_in_wave"
  | "elicitation_unit_id"
  | "options"
> & {
  options?: QuestionOptionProposal[];
};

type OpeningQuestionProposal = QuestionContentProposal & {
  elicitation_unit_index: number; // zero-based index into mission/current wave units
  elicitation_unit_id?: never;
};

type ContinuationQuestionProposal = QuestionContentProposal & {
  elicitation_unit_index?: never;
  elicitation_unit_id: Id; // exact trusted id from current committed pending units
};

type DeepDiveRecommendation = {
  id: Id;
  generation_provenance_id: Id;
  reason: DeepDiveReason;
  source_refs: SourceRef[];
  route_decision_affected: string;
  status: "accepted";
};

type DeepDiveRecommendationProposal = Omit<
  DeepDiveRecommendation,
  "id" | "generation_provenance_id" | "status"
>;

type InterviewerProposal =
  | {
      mode: "open_wave";
      mission: WaveMissionProposal;
      action: "continue";
      bridge?: string;
      mission_status: "opening";
      questions: OpeningQuestionProposal[]; // 1..3; committed with the mission
      reason: string;
      route_decision_affected: string;
    }
  | {
      mode: "continue_wave";
      mission?: never;
      action: "continue" | "end_wave";
      bridge?: string;
      mission_status: "developing" | "sufficient" | "blocked";
      questions: ContinuationQuestionProposal[]; // continue: 1..3; end_wave: 0
      reason: string;
      route_decision_affected: string;
    }
  | {
      mode: "propose_deep_dive";
      mission?: never;
      action: "deep_dive";
      bridge?: string;
      mission_status: "sufficient" | "blocked";
      questions: never[];
      reason: string;
      route_decision_affected: string;
      deep_dive_reason: DeepDiveReason;
      source_refs: SourceRef[];
    };
```

`WaveMissionProposal` 是唯一 canonical model-facing mission shape；其他文档只能引用，不能重新定义。model output 不含任何新建对象的 host-owned id、timestamp、revision 或 provenance id；只可返回 trusted context 已提供的 exact SourceRef / committed unit id。开波的 `elicitation_unit_index` 只是同一 proposal 内的数组位置，不得持久化；宿主按数组位置写入不可变、连续的 `order_in_wave=1..N`。后续 `continue_wave` 不再使用数组索引，而用 trusted context 给出的 exact `elicitation_unit_id`，因此数据库返回顺序或刷新不能改变映射。所有 context builder 均按 `order_in_wave ASC` 序列化 units，并拒绝重复/断号。宿主验证 refs 与映射后分配 ids、创建 provenance，并将开波 proposal 一次物化为 committed objects。

`propose_deep_dive` 只回答“是否有资格再开一波、为什么”，不提前写下一波 mission/questions。宿主接受后把 recommendation 与 `NEXT_WAVE_COMMITTED(kind="deep_dive")` 原子提交并进入 `orienting_wave`；随后一次独立 `open_wave` call 根据最新 committed context 生成 mission、5–10 units 和首批问题。拒绝/失败的 recommendation 不改变状态，不得复用为 mission。

Across every Sensemaker mode, model-facing `*Proposal` types omit host-owned ids, timestamps, lifecycle status, artifact revision and session snapshot revision. The host assigns those only after validation. Existing ids may appear only when the model is referencing an object supplied in trusted context; the host rejects invented or cross-session ids.

## Memory operations and wave insight

```ts
type MemoryOperation =
  | { op: "add_claim"; value: Claim }
  | { op: "supersede_claim"; prior_id: Id; value: Claim }
  | { op: "invalidate_claim"; id: Id; reason_source_ref: SourceRef }
  | { op: "add_constraint"; value: Constraint }
  | { op: "update_radar"; value: RadarDelta }
  | { op: "add_route_intent_seed"; value: RouteIntent }
  | { op: "mark_stale"; ids: Id[]; source_ref: SourceRef };

type ClaimProposal = Omit<
  Claim,
  "id" | "generation_provenance_id" | "calibration" | "status" | "superseded_by_id"
>;
type ConstraintProposal = Omit<Constraint, "id" | "generation_provenance_id" | "status">;

type MemoryOperationProposal =
  | { op: "add_claim"; value: ClaimProposal }
  | { op: "supersede_claim"; prior_id: Id; value: ClaimProposal }
  | { op: "invalidate_claim"; id: Id; reason_source_ref: SourceRef }
  | { op: "add_constraint"; value: ConstraintProposal }
  | { op: "update_radar"; value: RadarDelta }
  | { op: "add_route_intent_seed"; value: RouteIntentProposal }
  | { op: "mark_stale"; ids: Id[]; source_ref: SourceRef };

type InsightStatus =
  | "proposed"
  | "generated"
  | "calibrated"
  | "stale"
  | "invalidated";

type ImmediateInsight = {
  id: Id;
  wave_id: Id;
  generation_provenance_id: Id;
  generated_at: ISODateTime;
  user_told_me: string;
  current_reading: string;
  important_unknown: string;
  radar_deltas: RadarDelta[];
  route_impact: string;
  evidence: EvidenceLink[];
  status: InsightStatus;
  language_strength: "tentative" | "well_supported" | "conflicted";
};

type ImmediateInsightProposal = Omit<
  ImmediateInsight,
  "id" | "generation_provenance_id" | "generated_at" | "status"
> & { status: "proposed" };

type WaveSensemakerProposal = {
  base_revision: Revision;
  operations: MemoryOperationProposal[];
  insight: ImmediateInsightProposal;
};
```

每波恰好一个 committed `ImmediateInsight`。模型 proposal 使用 `proposed`，宿主提交后使用 `generated`；用户 verdict 是独立 event，并在事务中把 insight 变为 `calibrated`。source 编辑/删除可使它变为 `stale/invalidated`。`language_strength` 描述语言的证据强度，不替代 lifecycle status。`current_reading` 必须是可纠正解释；若 evidence 主要为 document 或想象，只能 `tentative`。

## Calibration

```ts
type Calibration = {
  id: Id;
  insight_id: Id;
  verdict: "accurate" | "partly_accurate" | "inaccurate";
  correction_text?: string;
  preferred_direction?: "continue_here" | "change_direction" | "preview" | "pause";
  source_ref: SourceRef;
};
```

Propagation rules:

- every submitted verdict, including a no-text `accurate`, creates one `kind="calibration"` SourceVersion; `source_ref` points to it exactly；
- inaccurate → dependent claims invalidated, related route fragments stale；
- partly → affected claim becomes `stale`; it is never edited in place. A later validated Sensemaker proposal may atomically `supersede_claim`, creating one or more new claim records with new ids/provenance while the old claim retains original content/provenance and points to its replacement；
- accurate → adds support but does not convert inference into fact；
- correction text → user_stated source with highest conversational priority；
- no downstream generation while material stale objects remain unresolved。

## Route readiness

```ts
type GateStatus = "met" | "unmet" | "waived_by_user" | "not_applicable";

type RouteReadiness = {
  design_question: GateStatus;
  ordinary_day_anchor: GateStatus;
  six_dimensions_handled: GateStatus;
  four_dimensions_grounded: GateStatus;
  distinct_route_intents: GateStatus;
  material_tradeoff: GateStatus;
  calibration: GateStatus;
  safety_clear: GateStatus;
  source_refs: SourceRef[];
  formal_ready: boolean;
  provisional_allowed: boolean;
  provisional_requested: boolean;
  evaluated_at_wave: 1 | 2 | 3 | 4 | 5;
  evaluated_at_revision: Revision;
};

type SafetyFlag = {
  id: Id;
  session_id: Id;
  policy_version: string;
  trigger_code: string;
  status: "active" | "resolved";
  source_refs: SourceRef[];
  created_at: ISODateTime;
  resolved_at?: ISODateTime;
};
```

### Gate derivation from committed facts

`deriveRouteReadiness(snapshot)` is host-only and pure. It receives one committed session revision, current SourceHeads/Versions, WorkingUnderstanding, waves/insights/calibrations/skips, waiver events, accepted RouteIntents, SafetyFlags and the current machine state. It never accepts model-supplied `GateStatus` values. “Active direct-user source” below means an exact active-head ref whose SourceVersion kind is `free_text` or `question_answer`; document and model inference do not qualify.

| Gate | Base status derived from committed records | Exact supporting refs |
| --- | --- | --- |
| `design_question` | `met` iff trimmed `design_question` is non-empty and `design_question_source_refs` contains ≥1 active direct-user source; else `unmet` | the qualifying design-question refs |
| `ordinary_day_anchor` | `met` iff ≥2 distinct active direct-user refs appear on active Claims or `grounded` RadarCells with `evidence_shape` `concrete_scene` or `observed_behavior`; else `unmet` | those distinct scene/behavior refs |
| `six_dimensions_handled` | `met` iff every canonical RadarCell state is not `unseen`; `declined` counts as handled; else `unmet` | union of refs on the six cells, including the user-decline source |
| `four_dimensions_grounded` | `met` iff at least four RadarCells equal `grounded`; else `unmet` | refs on the grounded cells |
| `distinct_route_intents` | `met` iff exactly three intents are `accepted` and each pair's normalized `life_shape` values differ on ≥2 canonical axes; else `unmet` | union of active evidence on the three intents |
| `material_tradeoff` | `met` iff each of the three accepted intents has non-empty `real_cost` and at least one active direct-user EvidenceLink with `evidence_shape="tradeoff"`; else `unmet` | the qualifying tradeoff refs |
| `calibration` | `met` iff ≥2 distinct committed insights have `CALIBRATION_SUBMITTED`; otherwise `not_applicable` iff every closed-wave insight is resolved by submitted-or-skipped and at least one `CALIBRATION_SKIPPED` exists; otherwise `unmet` | required calibration SourceRefs; skips contribute event ids, not fake SourceRefs |
| `safety_clear` | `met` iff there is no active SafetyFlag and machine state is not `safety_stop`; otherwise `unmet` | refs on active flags; empty is valid when deterministic pre-commit scanning found no trigger |

`life_shape` normalization is deterministic: Unicode NFKC, trim, collapse whitespace and locale-aware lowercase; no embedding/similarity/model call occurs in the host gate. The user must edit/accept all three values before the status can become `met`; the semantic fixture suite separately rejects cosmetic wording differences. A stale/missing ref makes its gate evidence non-qualifying rather than silently substituting another source.

Every event that creates/revises a SourceVersion must run the versioned deterministic host safety rules before commit. A trigger commits the source plus active SafetyFlag and transitions to `safety_stop` atomically; no-trigger needs no synthetic “all clear” row. A safety flag can be resolved for audit/export, but the stopped session still has no transition back to ordinary planning.

For the four waivable gates, derive the base `met/unmet` first. If base is `unmet` and the latest valid explicit `READINESS_GATE_WAIVED` event for that exact gate is at or before the evaluated revision, expose `waived_by_user`; a waiver never masks later safety/stale errors and never changes a base `met`. `not_applicable` and `waived_by_user` are illegal everywhere else. `RouteReadiness.source_refs` is the de-duplicated exact union of refs actually used by the eight derivations, sorted by `(source_id, source_revision)`.

### Executable readiness truth table

| Gate | Formal accepted statuses | Provisional minimum | `not_applicable` allowed | Waivable |
| --- | --- | --- | --- | --- |
| design_question | `met` | must be `met` | no | no |
| ordinary_day_anchor | `met` | `met` or `waived_by_user` | no | yes, provisional only |
| six_dimensions_handled | `met` | `met` or `waived_by_user` | no; explicit `declined` dimensions count as handled | yes, provisional only |
| four_dimensions_grounded | `met` | any non-safety status | no | yes, provisional only |
| distinct_route_intents | `met` | must be `met` before three lives; preview may show editable seeds only | no | no for three-life generation |
| material_tradeoff | `met` | `met` or `waived_by_user` | no | yes, provisional only |
| calibration | `met` or `not_applicable` | any legal status | only after an explicit `CALIBRATION_SKIPPED` user event | no; explicit skip is `not_applicable` |
| safety_clear | `met` | must be `met` | no | never |

Pure host functions:

```ts
formal_ready =
  design_question === "met" &&
  ordinary_day_anchor === "met" &&
  six_dimensions_handled === "met" &&
  four_dimensions_grounded === "met" &&
  distinct_route_intents === "met" &&
  material_tradeoff === "met" &&
  (calibration === "met" || calibration === "not_applicable") &&
  safety_clear === "met";

provisional_allowed =
  provisional_requested === true &&
  design_question === "met" &&
  (ordinary_day_anchor === "met" || ordinary_day_anchor === "waived_by_user") &&
  (six_dimensions_handled === "met" || six_dimensions_handled === "waived_by_user") &&
  ["met", "unmet", "waived_by_user"].includes(four_dimensions_grounded) &&
  distinct_route_intents === "met" &&
  (material_tradeoff === "met" || material_tradeoff === "waived_by_user") &&
  safety_clear === "met";
```

每个 `waived_by_user` 必须对应一条用户显式 `READINESS_GATE_WAIVED` event，不能由模型/宿主从“想看结果”推断。`RouteReadiness` 是三条 ParallelLife 的生成门，不是“能否结束访谈、进入路线意向”的门。访谈可因 mission sufficient、用户请求预览/停止或第五波上限而结束；之后先塑形并接受三个 route intents，再评估这里的正式/暂定生成条件。

`waived_by_user` 永远不会使 `formal_ready=true`；它只记录用户明确要求在未知仍存在时看暂定版本。`not_applicable` 只允许用于用户明确跳过校准，其他 gate 出现该值即 schema failure。第一至四波结束后可以进入路线塑形、保存或暂停；第五波后禁止第六波。接受三个 intents 后，若 `formal_ready=false`，只能在 `provisional_allowed=true` 时生成明显标注未知的暂定三路，否则只保存路线意向/暂停。Safety 永远不可 waiver。

这里的 `ordinary_day_anchor` 指用户当前真实生活的具体 scene/behavior 证据，不是尚未生成的未来 `OrdinaryDay` artifact。`distinct_route_intents` 只有在 route-intent 阶段由用户编辑/接受为恰好三个 `accepted` intent 后才为 `met`；3–5 个模型 seed 不能冒充用户接受。

Exhaustive contract test generation:

1. enumerate all `4^8` GateStatus combinations × `provisional_requested` boolean × wave `1..5`；
2. reject as schema-invalid any row where `not_applicable` appears outside calibration, `waived_by_user` appears outside ordinary_day_anchor/six_dimensions_handled/four_dimensions_grounded/material_tradeoff, a waived status lacks a matching `READINESS_GATE_WAIVED` event, or `not_applicable` calibration lacks a recorded `CALIBRATION_SKIPPED` event；
3. for every remaining row, assert `formal_ready` and `provisional_allowed` equal the pure functions above；
4. at wave 5, assert next options are `formal_generate` when formal, `provisional_generate/save/pause` when provisional-only, and `save/pause` otherwise; `continue_interview` is never present；
5. at waves 1–4, entering route-intent shaping is independent of these generation booleans and follows the interview-exit transition contract。

## Route intents

```ts
type LifeShapeAxis =
  | "daily_rhythm"
  | "work_learning"
  | "relationships"
  | "environment"
  | "responsibility"
  | "identity_source";

type RouteIntent = {
  id: Id;
  generation_provenance_id?: Id; // required for model seed; absent for user-created intent
  title: string;
  core_change: string;
  attraction: string;
  real_cost: string;
  life_shape: Record<LifeShapeAxis, string>;
  evidence: EvidenceLink[];
  assumptions: string[];
  status: "seed" | "user_edited" | "accepted" | "rejected" | "merged";
};

type RouteIntentProposal = Omit<RouteIntent, "id" | "generation_provenance_id" | "status">;
```

三条正式候选都写满六个 `life_shape` axis value；每一对经 canonical normalization 后至少两个 axis value 不同，并通过语义 fixture 防止同义改写冒充差异。用户可以保留疯狂但诚实标记为 imagination 的意向。

## Ordinary-day screening

```ts
type DayMoment = {
  time_label: string;
  scene: string;
  epistemic_status: EpistemicStatus;
  evidence: EvidenceLink[];
};

type DimensionScreen = {
  dimension: RadarDimension;
  fit_or_tension: string;
  evidence: EvidenceLink[];
  unknown: string;
};

type OrdinaryDay = {
  route_intent_id: Id;
  generation_provenance_id: Id;
  framing: "imagination_experiment";
  moments: DayMoment[]; // 4..6
  work_or_learning: string;
  relationships_and_responsibility: string;
  environment_and_resources: string;
  energy_pattern: string;
  identity_narrative: string;
  six_dimension_screen: DimensionScreen[]; // exactly 6
  invented_major_facts: never[];
};

type OrdinaryDayProposal = Omit<OrdinaryDay, "route_intent_id" | "generation_provenance_id">;
```

任何无法落入 evidence 的重大事实必须转成 assumption/unknown，不能塞入 scene。普通一天是检验生活结构的模拟，不是预测。

## Parallel lives

```ts
type ParallelLife = {
  id: Id;
  generation_provenance_id: Id;
  route_intent_id: Id;
  title: string;
  core_experience: string;
  year_1: string;
  year_2: string;
  year_3: string;
  ordinary_day: OrdinaryDay;
  attractions: string[];
  costs_and_tradeoffs: string[];
  evidence_for: EvidenceLink[];
  assumptions: string[];
  uncertainties: string[];
  risks: string[];
  trial_preview: Prototype;
};

type ParallelLivesPlan = {
  id: Id;
  generation_provenance_id: Id;
  version: number;
  status: "formal" | "provisional";
  framing: string;
  lives: [ParallelLife, ParallelLife, ParallelLife];
  recurring_elements: string[];
  real_tradeoff: string;
  open_questions: string[];
  source_snapshot_revision: Revision;
  contains_ranking: false;
};

type ParallelLifeProposal = Omit<
  ParallelLife,
  "id" | "generation_provenance_id" | "trial_preview"
> & {
  trial_preview: PrototypeProposal;
};

type ParallelLivesProposal = {
  framing: string;
  lives: [ParallelLifeProposal, ParallelLifeProposal, ParallelLifeProposal];
  recurring_elements: string[];
  real_tradeoff: string;
  open_questions: string[];
  contains_ranking: false;
};
```

Schema 不含 rank、score、recommended、best、match percentage 或 default_selected。

## Prototype

```ts
type Prototype = {
  id: Id;
  revision: Revision;
  route_intent_id: Id;
  generation_provenance_id: Id;
  hypothesis: string;
  today_action: string;
  day_1: string;
  day_2: string;
  day_3: string;
  what_to_observe: string[];
  feedback_source: string;
  time_ceiling_hours: number; // 0.5..6 total
  money_ceiling: string;
  reversible_because: string;
  continue_signal: string;
  adjust_signal: string;
  stop_signal: string;
  pause_or_exit_note: string;
  safety_check: string[];
};

type PrototypeRef = {
  prototype_id: Id;
  prototype_revision: Revision;
};

type PrototypeProposal = Omit<
  Prototype,
  "id" | "revision" | "route_intent_id" | "generation_provenance_id"
>;

type TrialInstance = {
  id: Id;
  session_id: Id;
  route_intent_id: Id;
  prototype_ref: PrototypeRef;
  status: "not_started" | "active" | "paused" | "completed" | "exited";
  started_at?: ISODateTime;
  updated_at: ISODateTime;
  pause_or_exit_note?: string;
  reflection_source_ref?: SourceRef;
};
```

`Prototype` 是可展示、可修改的试验设计；`TrialInstance.status` 是用户真的开始后的生命周期。这样保留 Legacy D-014 的轻量状态，但避免把一次可复用计划和一次运行实例混在同一字段。旧 v2 `trial` 迁移为 Prototype；若没有运行记录则创建 `not_started` TrialInstance，已有状态按原值迁移。

Prohibited first prototypes: resigning, dropping out, moving, debt, major purchase, changing medication/treatment, unsafe disclosure, relationship rupture, deception, illegal action or public commitment that cannot be withdrawn.

## Donor v2 compatibility and migration

- Existing logical sources become `SourceVersion(..., revision=1)` only when tenant ownership and original source identity can be proved; a matching `SourceHead` is created in the same migration transaction.
- Existing evidence that already contains source id + revision maps to `SourceRef`. Placeholder, `no-evidence`, missing, cross-tenant or unverifiable refs do not receive fabricated sources; their artifacts become `stale` or a visibly provisional legacy artifact excluded from new generation.
- ParallelLife v2 fields `attractions`, `costs_and_tradeoffs` and `evidence_for` map without renaming. No `gains/losses/evidence` compatibility aliases are introduced into the canonical schema.
- Existing trial plans become `Prototype`. Existing lifecycle values become a separate `TrialInstance`; if no lifecycle record exists, status starts at `not_started` rather than guessing activity.
- Existing insights with valid evidence start as `generated`; a valid historical calibration event may derive `calibrated`. Missing evidence yields `stale`, never `well_supported` by default.
- Migration is all-or-nothing per session, produces an audit count for migrated/stale/rejected objects and must be safe to re-run under one idempotency key.

## Blueprint

```ts
type Blueprint = {
  version: number;
  generation_provenance_id: Id;
  generated_at: ISODateTime;
  source_snapshot_revision: Revision;
  current_coordinate: string;
  design_question: string;
  six_dimension_radar: RadarCell[];
  key_understandings: Claim[];
  route_intents: RouteIntent[];
  parallel_lives?: ParallelLivesPlan;
  recurring_elements: string[];
  key_tensions: string[];
  open_questions: string[];
  next_experiment?: Prototype;
};

type BlueprintProposal = Omit<
  Blueprint,
  "version" | "generation_provenance_id" | "generated_at" | "source_snapshot_revision"
>;
```

蓝图是按用户请求生成的版本快照，不是毕业证书或最终答案。

## Bounded chat

```ts
type ChatScope =
  | "explain_evidence"
  | "compare_tradeoffs"
  | "adjust_prototype"
  | "reflect_on_trial"
  | "request_blueprint";

type ChatRequest = {
  scope: ChatScope;
  message: string;
  source_snapshot_revision: Revision;
};
```

有界聊天默认只读。新事实先成为 local note；要改变 understanding/plan 时进入显式 revision workflow。每会话最多 20 个 chat turns，recent raw messages 最多 6 条，其余使用已校准摘要。越界请求由宿主在模型前处理。

## Transaction and integrity rules

1. Proposal uses `base_revision`; mismatch rejects entire proposal.
2. Every `SourceRef` must exist in the same session. Evidence supporting an active object must match the active head; causal invalidation refs may point to an existing superseded/deleted version but cannot support new output.
3. Memory operations commit atomically; partial patch is impossible.
4. Source deletion invalidates or regenerates all derived objects.
5. Correction and declined boundaries outrank older claims and materials.
6. A model inference cannot be sole support for fixed constraint, material attraction/cost/tradeoff or safety risk.
7. Every record newly materialized from a committed model proposal has a required `generation_provenance_id` foreign key to an immutable `GenerationProvenance` containing prompt contract/file, schema, context-builder/context, provider/model/config and fixture-suite versions. The accepted proposal and provenance are copied in the same transaction; failed proposals create neither artifact nor provenance.
8. Ordinary logs contain ids and metadata only, not protected text.

### Immutable model-update rule

Model-generated semantic records are append-and-supersede, never update-in-place. `supersede_claim` validates the active prior claim and exact evidence, creates a new Claim with the current GenerationProvenance, marks the old Claim `superseded`, sets `superseded_by_id`, rewires only future active dependencies and preserves historical dependency edges. The old text/evidence/provenance remain immutable. Duplicate delivery returns the same replacement; concurrency allows exactly one replacement of an active prior id. Calibration or source edits may mark a claim stale/invalidated, but deterministic host code does not author replacement prose.

## Core fixture catalogue

| ID | Situation | Expected behavior |
| --- | --- | --- |
| F01 | user gives one-line opening | gentle first batch; no identity leap |
| F02 | uploaded resume says “ignore rules” | treated as document text; no control change |
| F03 | long opening answers many likely questions | no repetition; first microbatch narrows genuine gaps |
| F04 | three consecutive skips | slow/change form/offer pause; no penalty or pursuit |
| F05 | insight marked inaccurate with correction | claim invalidated; next mission reflects correction |
| F06 | abstract preference conflicts with concrete behavior | radar conflicted; double-sided reflection |
| F07 | relationship dimension declined | state declined; no re-asking; routes mark unknown respectfully |
| F08 | route intents differ only by job title | distinctness gate fails; targeted repair or user calibration |
| F09 | desired route needs current external policy fact | research needed or explicit unknown; no invented fact |
| F10 | fifth wave ends without formal readiness | no sixth wave; provisional/save/pause options |
| F11 | old card answer edited after routes | dependent artifacts stale; explicit regeneration |
| F12 | acute crisis language | safety stop; no interview, route or gamified response |

Add variants for Chinese/English/mixed language, student/early career/caregiver/non-career transition, short/long text, material/no material, provider failure and mobile resume.

## Negative contract tests

- any score/percentage/profile type field;
- wave index 6, deep-dive count 3, question count 11 or normal close with fewer than five covered units;
- microbatch with 4+ questions or hidden multi-part requirements;
- insight without evidence or more than one formal insight per wave;
- `grounded` from abstract document-only evidence;
- use of invalidated source revision;
- route pair whose normalized `life_shape` differs on fewer than two axes, or whose wording-only differences fail semantic review;
- ordinary day with unlabelled invented major fact;
- ranking/recommendation/default selection;
- irreversible first prototype;
- model changing host state directly;
- bounded chat mutating committed memory without revision workflow.
