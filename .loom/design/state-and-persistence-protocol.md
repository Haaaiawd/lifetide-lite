# 状态与持久化协议

- Kind: canonical executable protocol
- Contract revision: 3
- Owner: host application, never the model
- Depends on: `conversational-six-dimension-harness.md`, `insight-plan-contracts.md`

本文件把 Harness 的自然语言阶段变成 TASK-008 可以直接实现和测试的协议。若其他文件对状态、revision、幂等或恢复的描述与此冲突，以本文件为准。

## 1. Chosen persistence shape

系统使用 **XState snapshot + append-only committed transition ledger + ordinary domain records**。这不是完整 event sourcing：业务对象不依赖从零回放才能读取。每次状态改变都在一个数据库事务中完成：

1. 在事务中对 session head 执行 `revision == base_revision` 的 compare-and-swap（数据库支持时可用等价行锁），并校验 tenant 与 idempotency；
2. 校验 source refs、当前状态、event guard 和 payload schema；
3. 写入/更新 domain records 与 dependency edges；
4. 写入一条 committed transition event；
5. 序列化新的 XState snapshot，session revision 恰好 `+1`；
6. 一次提交；任一步失败则全部回滚。

模型 proposal 不进入 committed ledger。可将其短暂保存用于调试，但必须脱敏、有 TTL，且从未通过宿主 guard 的 proposal 不能成为产品事实。

## 2. Event envelope

```ts
type ActorKind = "user" | "host" | "interviewer" | "sensemaker" | "system";

type EventEnvelope<TType extends string, TPayload> = {
  event_id: Id;                 // host assigned, unique in session
  event_type: TType;
  schema_version: 3;
  session_id: Id;
  actor: ActorKind;
  base_revision: Revision;      // must equal committed session head
  emitted_at: ISODateTime;
  idempotency_key: string;      // unique with session_id
  correlation_id: Id;           // one user intent / model call / workflow action
  causation_id?: Id;             // preceding committed event
  proposal_id?: Id;              // required for a model-derived commit
  safety_flag?: SafetyFlag;      // host-created only; forces target safety_stop
  payload_hash: string;          // canonical JSON hash; detects key reuse with new payload
  payload: TPayload;
};
```

Committed row additionally stores `committed_revision = base_revision + 1`, `from_state`, `to_state`, `created_at` and `snapshot_hash`. A duplicate `(session_id, idempotency_key)` with the same `payload_hash` returns the existing result; a different hash returns `IDEMPOTENCY_CONFLICT`. A stale revision returns `REVISION_CONFLICT` and the current public snapshot. Neither case writes anything.

```ts
type TransitionEventRow = {
  session_id: Id;
  event_id: Id;
  event_type: string;
  schema_version: 3;
  base_revision: Revision;
  committed_revision: Revision;
  idempotency_key: string;
  payload_hash: string;
  correlation_id: Id;
  causation_id?: Id;
  proposal_id?: Id;
  actor: ActorKind;
  from_state: string;
  to_state: string;
  event_metadata_json: unknown; // artifact ids, exact refs, enums and hashes only; no raw or generated prose
  state_snapshot_json: unknown; // redacted XState snapshot after this event
  snapshot_hash: string;
  committed_at: ISODateTime;
};

type SessionStateHead = {
  session_id: Id;
  revision: Revision;
  machine_version: 3;
  state_value_json: unknown;
  public_context_json: unknown;
  resume_state_json?: unknown;
  snapshot_hash: string;
  updated_at: ISODateTime;
};
```

`public_context_json` and `state_snapshot_json` contain only control data and opaque artifact/source refs: stage, counters, accepted ids, pending action, resume state and safe error metadata. They never embed answer text, upload excerpts, insight prose or route prose.

The ledger has unique keys on `(session_id,event_id)`, `(session_id,idempotency_key)` and, when present, `(session_id,proposal_id)`. `SessionStateHead` has one row per session. The in-transaction EventEnvelope may carry a validated domain object, but the persisted ledger projects it to ids, exact refs, enums and hashes; SourceVersion text and generated prose remain in their protected domain stores and are not duplicated into the ledger.

Model flow is always `request/model proposal -> host validation -> *_COMMITTED event`. `proposal_id` is unique per session and has at most one committed event. Provider retry retains correlation/idempotency identity; a semantic repair creates a new proposal id but the same correlation id.

```ts
type ProposalEnvelope<TMode extends string, TPayload> = {
  proposal_id: Id;
  mode: TMode;
  schema_version: 3;
  session_id: Id;
  base_revision: Revision;
  correlation_id: Id;
  attempt: 1 | 2; // second attempt is the single semantic repair
  provenance: Omit<
    GenerationProvenance,
    "id" | "session_id" | "proposal_id" | "correlation_id" | "created_at"
  >;
  payload_hash: string;
  generated_at: ISODateTime;
  payload: TPayload;
};
```

ProposalEnvelope has a short TTL and is not a domain fact. Its `provenance` contains `prompt_contract_revision`, `prompt_file_hash`, `schema_hash`, `context_builder_version`, `context_hash`, `provider`, `model`, secret-free canonical `model_config_json`, `model_config_hash` and `fixture_suite_version`; none may be reconstructed later from deployment defaults. Retry of the same provider request keeps proposal/correlation identity; semantic repair has a new proposal id with `attempt=2`. Commit validation rechecks current revision and all exact refs rather than trusting prior validation.

On an accepted model commit, the transaction creates exactly one immutable `GenerationProvenance` from the envelope plus host-owned id/session/proposal/correlation/created time, then sets that id on every generated record materialized by the event, including mission, units, batch, questions and options at wave open. `EventEnvelope.proposal_id`, `ModelCommitMeta.proposal_id` and `GenerationProvenance.proposal_id` must be identical; every artifact foreign key must equal `generation_provenance.id`. The event metadata retains only that provenance id, not raw config/context. The provenance insert, artifact writes, transition row and state head are one transaction; any failure rolls all of them back. Rejected/expired proposals and provider failures create no provenance. Replaying an idempotent commit returns the existing provenance and artifacts rather than duplicating either.

## 3. Canonical states

```text
entry
consent_and_optional_material
interviewing
  orienting_wave
  awaiting_answers
  synthesizing_wave
  awaiting_calibration
route_intents
ordinary_day_screening
parallel_lives_ready
trial_active
bounded_reflection
paused
degraded
safety_stop
```

`paused` and `degraded` carry `resume_state`, which must be one of the previously committed non-terminal states. `safety_stop` carries no automatic history return.

## 4. Transition table

`same` means the durable state does not change, though revision does because a durable domain fact changed. Pure read/evaluation requests do not emit a committed event and do not increment revision.

| From | Event | Required payload / guard | To |
| --- | --- | --- | --- |
| entry | `SESSION_STARTED` | guest/session ownership established | consent_and_optional_material |
| consent_and_optional_material | `CONSENT_RECORDED` | current consent version accepted; upload choice may be none | interviewing.orienting_wave |
| consent_and_optional_material | `MATERIAL_ATTACHED` | consent permits processing; same tenant; safe file boundary | same |
| interviewing.orienting_wave | `WAVE_MISSION_COMMITTED` | `open_wave` proposal valid for committed core/deep kind; wave index 1..5; deep dives <=2; exactly 5..10 ID-free unit proposals; host preserves target_dimensions, writes contiguous immutable order 1..N, assigns ids and commits mission/units/first 1..3-question batch atomically | interviewing.awaiting_answers |
| interviewing.awaiting_answers | `QUESTION_BATCH_COMMITTED` | continue-wave proposal valid; 1..3 questions; every exact trusted elicitation_unit_id resolves to a committed pending unit in this wave; atomically increment asked_count by batch size; wave asked total <=10; no repeated resolved target | same |
| interviewing.awaiting_answers | `ANSWER_SUBMITTED` | exact question or unsolicited source; immutable SourceVersion inserted | same |
| interviewing.awaiting_answers | `ANSWER_REVISED` | active SourceRef exists; insert next version; stale closure succeeds atomically | same |
| interviewing.* or route_intents | `DESIGN_QUESTION_SET` | explicit user accept/edit; required active direct-user SourceVersion; replaces text/refs atomically and stales dependent routes if changed | same |
| interviewing.awaiting_answers | `QUESTION_SKIPPED` | pending committed question; asked_count already consumed at batch commit; mark unit skipped and do not increment resolved count | same |
| interviewing.* | `PROVISIONAL_PREVIEW_REQUESTED` | explicit user intent; safety clear; store request and show only current seeds/unknowns. If user then ends interviewing mid-wave, close/synthesize that wave before route phase | same |
| interviewing.awaiting_answers | `WAVE_END_COMMITTED` | normal close has 5..10 units handled; early close requires user explicitly asking to close this wave and see its synthesis, or the ten-question hard limit. Plain pause/leave uses SESSION_PAUSED; safety uses SAFETY_BOUNDARY_TRIGGERED | interviewing.synthesizing_wave |
| interviewing.synthesizing_wave | `INSIGHT_COMMITTED` | exactly one insight; exact active refs; operations and radar delta valid | interviewing.awaiting_calibration |
| interviewing.awaiting_calibration | `CALIBRATION_SUBMITTED` | valid insight; every verdict atomically creates a calibration SourceVersion; correction additionally triggers stale closure | same |
| interviewing.awaiting_calibration | `CALIBRATION_SKIPPED` | explicit user action for this insight; no verdict inferred | same |
| interviewing.awaiting_calibration | `NEXT_WAVE_COMMITTED` | total waves <5; user has not stopped; burden/safety allow. Core is host-selected; deep dive additionally requires one accepted canonical recommendation with eligible reason/exact refs and deep-dive count <2 | interviewing.orienting_wave |
| interviewing.awaiting_calibration | `ROUTE_PHASE_ENTERED` | closed wave plus host mission-sufficient decision, explicit `end_and_shape_routes`, user stop, or wave 5 cap; safety clear | route_intents |
| route_intents | `ROUTE_INTENT_CANDIDATES_COMMITTED` | Sensemaker proposal valid; 3..5 seed intents with exact refs/assumptions | same |
| route_intents | `ROUTE_INTENT_EDITED` | user edit/merge/reject/add; no silent acceptance | same |
| route_intents | `ROUTE_INTENTS_ACCEPTED` | exactly 3 accepted intents; all six life_shape values present; each normalized pair differs on >=2 axes and semantic distinctness validation passes | same |
| route_intents or ordinary_day_screening | `READINESS_GATE_WAIVED` | explicit user action; gate is ordinary_day_anchor, six_dimensions_handled, four_dimensions_grounded or material_tradeoff only | same |
| route_intents | `ORDINARY_DAY_SCREENING_STARTED` | exactly 3 accepted intents | ordinary_day_screening |
| ordinary_day_screening | `ORDINARY_DAYS_COMMITTED` | exactly 3; 4..6 moments each; six screens each; no invented major fact | same |
| ordinary_day_screening | `ORDINARY_DAY_CALIBRATED` | every verdict creates a calibration SourceVersion; correction and stale propagation valid | same |
| ordinary_day_screening | `PARALLEL_LIVES_COMMITTED` | `formal_ready` or `provisional_allowed`; exactly 3 equal lives; source refs valid; route-distinctness and safety pass | parallel_lives_ready |
| parallel_lives_ready | `TRIAL_STARTED` | one route; reversible prototype; no prohibited first action | trial_active |
| parallel_lives_ready | `BOUNDED_REFLECTION_OPENED` | explain/compare/adjust/blueprint; `reflect_on_trial` only when an exited or completed TrialInstance exists | bounded_reflection |
| parallel_lives_ready | `BLUEPRINT_COMMITTED` | explicit user request; current non-stale snapshot | same |
| trial_active | `TRIAL_PAUSED` | optional user note | parallel_lives_ready |
| parallel_lives_ready | `TRIAL_RESUMED` | existing paused TrialInstance; prototype still valid and safe | trial_active |
| trial_active | `TRIAL_EXITED` | optional user note; never styled as failure | parallel_lives_ready |
| trial_active | `TRIAL_COMPLETED` | user declares completion; no score | bounded_reflection |
| trial_active | `TRIAL_REFLECTION_SUBMITTED` | reflection SourceVersion valid | bounded_reflection |
| bounded_reflection | `CHAT_NOTE_COMMITTED` | allowed bounded scope; does not mutate plan without revision workflow | same |
| bounded_reflection | `TRIAL_REFLECTION_SUBMITTED` | completed/exited trial; reflection SourceVersion valid | same |
| bounded_reflection | `BLUEPRINT_COMMITTED` | explicit user request; current non-stale snapshot | same |
| bounded_reflection | `TRIAL_STARTED` | another valid route/prototype | trial_active |
| bounded_reflection | `REFLECTION_CLOSED` | no pending explicit revision workflow | parallel_lives_ready |
| any non-safety state | `SESSION_PAUSED` | store exact current state as `resume_state` | paused |
| paused | `SESSION_RESUMED` | session valid; no current safety block; stored state still legal | `resume_state` |
| any model-waiting state | `PROVIDER_FAILED` | no partial domain commit; retry budget exhausted | degraded |
| degraded | `PROVIDER_RECOVERED` | same correlation safely retried or user abandons action; snapshot validates | `resume_state` |
| any live state | `SAFETY_BOUNDARY_TRIGGERED` | deterministic host safety rule or validated high-confidence trigger | safety_stop |
| any live state | `SESSION_DELETED` | ownership confirmed; deletion/invalidation transaction completes | terminal deleted session |

Illegal transitions are rejected before any database write. `MICROBATCH_CONTINUE_PROPOSED`, `WAVE_END_PROPOSED`, `DEEP_DIVE_PROPOSED` and `ROUTE_READINESS_EVALUATED` are proposals/evaluations, not durable state-changing events; their accepted effects use the committed events above.

Cross-cutting safety override: any event that creates/revises a SourceVersion first runs deterministic host rules inside the transaction. With no trigger it follows the table target. With a trigger, the same original event/payload also carries host-only `safety_flag`, persists its ordinary domain fact plus that flag, and targets `safety_stop` instead. It does not emit a second event/revision. `SAFETY_BOUNDARY_TRIGGERED` is reserved for host triggers not attached to a source mutation.

## 5. Event payloads

```ts
type SessionStarted = { guest_token_hash: string; expires_at: ISODateTime };
type ConsentRecorded = { consent_version: string; ai: true; upload: boolean };
type MaterialAttached = { upload_id: Id; source_refs: SourceRef[] };
type ModelCommitMeta = {
  proposal_id: Id;
  generation_provenance: GenerationProvenance;
};
type WaveMissionCommitted = ModelCommitMeta & {
  wave: Wave; // contains mission, 5..10 units and first committed microbatch
};
type QuestionBatchCommitted = ModelCommitMeta & { wave_id: Id; batch: Microbatch };
type AnswerSubmitted = { answer: Answer; source: SourceVersion; coverage: AnswerCoverage[] };
type AnswerRevised = { prior: SourceRef; next: SourceVersion; stale_artifact_ids: Id[] };
type DesignQuestionSet = { text: string; source: SourceVersion };
type QuestionSkipped = { wave_id: Id; question_id: Id; elicitation_unit_id: Id };
type WaveEndCommitted = ModelCommitMeta & {
  wave_id: Id;
  stop_reason: Wave["stop_reason"];
};
type InsightCommitted = ModelCommitMeta & {
  proposal: WaveSensemakerProposal;
  insight_status: InsightStatus;
};
type CalibrationSubmitted = { calibration: Calibration; source: SourceVersion };
type CalibrationSkipped = { insight_id: Id; explicitly_skipped: true };
type NextWaveCommitted =
  | { kind: "core" }
  | (ModelCommitMeta & {
      kind: "deep_dive";
      recommendation: DeepDiveRecommendation;
    });
type ProvisionalPreviewRequested = {
  requested_at_wave: 1 | 2 | 3 | 4 | 5;
  user_intent: "preview_only" | "end_and_shape_routes";
};
type RoutePhaseEntered = {
  reason: "mission_sufficient" | "user_preview" | "user_stopped" | "wave_cap";
  interview_snapshot_revision: Revision;
};
type RouteIntentCandidatesCommitted = ModelCommitMeta & { intents: RouteIntent[] /* 3..5 */ };
type RouteIntentEdited = {
  intent_id?: Id; // absent only when user adds a new intent
  action: "edit" | "merge" | "reject" | "add";
  patch: Partial<Omit<RouteIntent, "id" | "generation_provenance_id" | "status">>;
  edit_source: SourceVersion;
};
type RouteIntentsAccepted = { intents: [RouteIntent, RouteIntent, RouteIntent] };
type ReadinessGateWaived = {
  gate:
    | "ordinary_day_anchor"
    | "six_dimensions_handled"
    | "four_dimensions_grounded"
    | "material_tradeoff";
  acknowledged_unknown: string;
  explicit: true;
};
type OrdinaryDaysCommitted = ModelCommitMeta & {
  days: [OrdinaryDay, OrdinaryDay, OrdinaryDay];
};
type OrdinaryDayScreeningStarted = { accepted_intent_ids: [Id, Id, Id] };
type OrdinaryDayCalibrated = {
  route_intent_id: Id;
  verdict: "like_me" | "not_like_me" | "unknown";
  target_ref: string;
  source: SourceVersion;
};
type ParallelLivesCommitted = ModelCommitMeta & { plan: ParallelLivesPlan };
type TrialStarted = { trial: TrialInstance; prototype: Prototype };
type TrialStatusChanged = { trial_id: Id; note?: string };
type TrialResumed = { trial_id: Id; prototype_ref: PrototypeRef };
type TrialReflectionSubmitted = { trial_id: Id; source: SourceVersion };
type BoundedReflectionOpened = { scope: ChatScope };
type ChatNoteCommitted = { scope: ChatScope; note_source: SourceVersion; mutates_plan: false };
type BlueprintCommitted = ModelCommitMeta & { blueprint: Blueprint };
type ReflectionClosed = { return_to: "parallel_lives_ready" };
type SessionPaused = { resume_state: string; reason: "user" | "navigation" | "expiry_warning" };
type SessionResumed = { explicit: true };
type ProviderFailed = {
  action: string;
  public_error_code: "timeout" | "rate_limited" | "provider_5xx" | "invalid_schema" | "repair_failed";
  correlation_id: Id;
  retry_count: number;
};
type ProviderRecovered = { correlation_id: Id; outcome: "retry_succeeded" | "user_abandoned" };
type SafetyBoundaryTriggered = { flag: SafetyFlag; locale?: string };
type SessionDeleted = { scope: "session"; ownership_confirmed: true };
```

`TRIAL_PAUSED/TRIAL_EXITED/TRIAL_COMPLETED` use `TrialStatusChanged` with the event type determining the target status. All here-referenced domain types come from `insight-plan-contracts.md`; implementation must define one discriminated `EventPayloadMap` from these types and may not duplicate a second similar schema.

For `CALIBRATION_SUBMITTED`, `source.kind` is always `calibration`, `untrusted=false`, and `calibration.source_ref` must exactly equal the inserted `(source_id, revision)`. Even a verdict with no correction text writes protected structured content containing the verdict and optional preferred direction; `correction_text`, when present, is stored in that protected content. The SourceVersion, Calibration, deterministic stale/invalidation markers, dependency changes, event and snapshot commit atomically. Any later semantic replacement is a separate accepted Sensemaker proposal using `supersede_claim`. No alternate out-of-band calibration write is legal.

`ORDINARY_DAY_CALIBRATED` follows the same source rule: its required `source.kind="calibration"` stores the verdict and optional correction as protected content. It cannot create a source only for negative feedback while discarding positive/unknown calibration provenance.

Model semantic content is immutable. A committed `supersede_claim` creates a new Claim/new provenance and marks the old row `superseded` with `superseded_by_id`; it never overwrites old text, evidence or provenance. Stale/inaccurate calibration first blocks downstream generation; any semantic replacement arrives in a later Sensemaker proposal. The replacement, old-status update, dependency edges, event and snapshot are one transaction.

Deep-dive call sequence is exact: from `awaiting_calibration`, an ephemeral `propose_deep_dive` call returns recommendation-only; rejection/invalid/retry-exhaustion commits no next-wave event. Acceptance uses one `NEXT_WAVE_COMMITTED(kind="deep_dive")` transaction to persist recommendation/provenance and move to `orienting_wave`. A new `open_wave` call then creates the mission/units/first batch from the latest revision. The recommendation proposal id is never reused for wave open. Refresh between the two committed events resumes at `orienting_wave` and makes exactly one idempotent open call.

## 6. Pause, degraded and safety semantics

### Pause

暂停是用户控制，不是失败。暂停前如果模型 proposal 尚未 commit，该 proposal 丢弃；已提交回答永不丢。恢复读取数据库 snapshot，不信任浏览器缓存。若原状态因 source 删除已不合法，进入最接近的校准/路线意向状态并显示原因，不能静默跳过。

### Degraded

`degraded` 只表示当前外部/模型动作未完成。它保存失败动作、correlation id、retry count、公开错误码和 `resume_state`，不保存敏感正文。恢复成功后执行原本的单次 commit；用户取消则回到 `resume_state`，不伪造 fallback artifact。完整三路不得由通用占位文案补齐。

恢复算法固定为：读取 `SessionStateHead` → 校验 snapshot hash/machine version → 若无效，读取最高连续 revision 的有效 `TransitionEventRow.state_snapshot_json`（revision、machine version 与 hash 必须匹配）并修复 head → 得到唯一 snapshot。若无法得到唯一合法状态，进入只读恢复页，允许导出/删除/联系支持；不得猜一个默认状态或继续模型调用。

### Safety stop

进入 `safety_stop` 后取消访谈/路线/试验 actor，禁止自动继续和营销式挽留。界面提供清晰边界、现实支持建议、导出/删除和退出。该 session 没有回到普通规划的 transition；用户日后若要继续，必须显式新建 session 并重新进入边界说明，旧 session 只能作为用户可控的历史材料导入。安全门不可 waiver、不可被模型输出覆盖。

所有 SourceVersion create/revise event 在同一事务内先跑 versioned deterministic host rules；命中时仍保存用户 source，但原 event 通过 host-only `safety_flag` 直接原子写 active flag 和 `safety_stop` snapshot，不会先短暂进入普通下一状态，也不会多加一次 revision。无命中不写伪造的 clear record。MVP 不把外部模型分类器作为 `safety_clear` 的必要依赖。

## 7. Required tests generated from this protocol

1. transition table：每一行合法；每个未列出的 `(state,event)` 非法；
2. revision：成功 mutation 恰好 `+1`，失败/重复/读取为 `+0`；
3. proposal correlation：一个 proposal 最多一个 commit；repair 与 retry 语义不同；
4. concurrency：同 base revision 并发命令恰好一个成功；
5. atomicity：在 domain/event/snapshot 每个写点注入失败均整体回滚；
6. source lifecycle：`s@1 -> s@2`、delete、cross-tenant、stale closure；
7. design question：explicit set/edit owns one active direct-user ref; edit stales dependent route artifacts and changes derived readiness；
8. history：每个可暂停状态均恢复到原状态；degraded 不制造 artifact；
9. hard limits：wave 1..5、deep dive 0..2、units 5..10、actual questions <=10、microbatch 1..3；
10. interviewer ownership：`open_wave` 含 5..10 ID-free units 与无新 domain id 的 questions/options；宿主无损保存 target_dimensions/连续 order 并恰好一次赋 id，非法 index 整体拒绝；continue uses exact unit id, and reordered DB reads/refresh preserve mapping；
11. calibration：无文本 verdict、带 correction、重复 delivery 与任一写点失败，均验证 required SourceVersion、exact source_ref、幂等和整体回滚；
12. readiness derivation：从实际 sources/radar/calibration/waiver/intents/safety facts 构造每个 GateStatus，不可注入预计算状态；
13. provenance：accepted proposal 原子持久化完整 GenerationProvenance 并被所有生成 records 引用；replay 不重复，失败 proposal 不留 provenance；
14. claim history：call A creates claim A; call B supersedes it with claim B/new provenance; A remains immutable, replay returns B, concurrent second supersede fails；
15. deep dive：recommendation accepted/rejected/retried/refreshed；accepted recommendation 与 later open-wave 使用不同 proposal/provenance identity，且 cap=2；
16. route lifecycle：三 intents、三 ordinary days、三 lives、trial pause/exit/complete；特别覆盖 `exit -> BOUNDED_REFLECTION_OPENED(reflect_on_trial) -> TRIAL_REFLECTION_SUBMITTED`；
17. safety：从每个 live 状态可进入 safety_stop；source mutation + safety flag still commits once；该 session 不存在回到普通规划的 transition。
