# TASK-008 迁移盘点

> 按 TASK-008 `done_when` 第一项要求，在修改 package.json、Prisma schema、API route 或运行逻辑之前，先逐项盘点 TASK-008 声明的 donor，标记为 `retained` / `migrated` / `retired`。

## 1. Prisma tables、migrations 与关系

| 表 / 迁移 | 现状 | 处置 | 目标责任 / 说明 |
| --- | --- | --- | --- |
| `Session` | 存在，`id`/`token`/`createdAt`/`expiresAt`；guest token 24h TTL | **migrated** | 保留为 guest session 根表；新增 `session_revision` 字段（或移入 `SessionStateHead`），用于乐观并发控制；保留 `token` 不透明哈希与 24h 过期清理 |
| `Consent` | 存在，`sessionId`/`type`/`required`/`given`/`givenAt`；`(sessionId, type)` 唯一 | **retained** | 原样保留，作为用户同意的 domain record；同意写入不直接产生 `revision +1` 事件，但在 `CONSENT_RECORDED` 后进入 `interviewing.orienting_wave` |
| `Answer` | 存在，`sessionId`/`questionId`/`value`/`skipped`/`createdAt` | **migrated** | 升级为 `SourceVersion` + `Answer` 视图：`value` 作为 protected 内容，新增 `(session_id, source_id, revision)` 标识；回答提交创建 `ANSWER_SUBMITTED` 事件和 `source_revision`；编辑产生新 revision 并传播 stale |
| `Upload` | 存在，含 `fileName`/`mimeType`/`size`/`status`/`error`/`rawBase64` | **retained** | 原样保留为不可信文件信封；解析后的 `UploadChunk` 作为 `material_excerpt` source 引用 |
| `UploadChunk` | 存在，`uploadId`/`index`/`source`/`text` | **retained** | 原样保留，作为 source 的 protected 正文来源；引用时使用 `(session_id, source_id, revision)` 抽象 |
| `DerivedContent` | 存在，`sessionId`/`uploadId?`/`kind`/`payload`/`supportStatus` | **retired** | 由扁平 JSON 容器替换为强类型的 `Claim`/`Constraint`/`ImmediateInsight`/`RouteIntent`/`ParallelLivesPlan`/`TrialInstance`/`Blueprint` 等 domain records；旧 `kind="insight" \| "route" \| "trial" \| "chat"` 的 JSON blob 不再写入；`supportStatus` 逻辑由 dependency edge + stale/invalidated 传播取代 |
| `WorkingMemory` | 存在，`sessionId`/`revision`/`payload` JSON blob | **migrated** | 保留单 session 一行，但 `payload` 从 v1 版本化 JSON 升级为 `WorkingUnderstanding v3`；新增或并用一组关系表来支持 exact source revision 引用和 dependency edges；`revision` 字段继续存在但语义与 `SessionStateHead.revision` 对齐 |
| `Wave` | 存在，`wave_id`/`wave_index`/`focus_uncertainty_id`/`questions` JSON/`status` | **migrated** | 升级为 `Wave` + `WaveMission` + `ElicitationUnit` + `Microbatch` + `Question` + `QuestionOption` 关系模型；`questions` JSON blob 拆成规范化行；`status` 扩展为 `open \| synthesizing \| awaiting_calibration \| closed` |
| `ModelCallLog` | 存在，审计日志表 | **retained** | 原样保留，但增加 `proposal_id`/`correlation_id` 字段，用于关联 `GenerationProvenance`；普通日志仍不写原文 |
| `prisma/migrations/20260827043638_init` | 初始 migration | **retained** | 作为 baseline，不修改 |
| `prisma/migrations/20260827065740_upload_chunks` | 上传 chunks migration | **retained** | 作为 baseline，不修改 |
| `prisma/migrations/20260827071743_working_memory` | WorkingMemory migration | **retained** | 作为 baseline，不修改 |
| 缺失表：`SourceVersion` / `SourceHead` | 无 | **新增** | 在 `Answer`/`Calibration`/`TrialReflection`/`ChatNote`/`DesignQuestion` 等之上建立不可变 source 版本和 active head 模型 |
| 缺失表：`TransitionEvent` / `SessionStateHead` | 无 | **新增** | 实现 XState snapshot + append-only ledger；`(session_id, idempotency_key)` 唯一，`base_revision` CAS |
| 缺失表：`GenerationProvenance` | 无 | **新增** | 每次 accepted model proposal 创建一条，所有生成 records 外键引用 |
| 缺失表：`DependencyEdge` | 无 | **新增** | 支持 stale/invalidated 闭包传播和 source edit/delete 影响追踪 |

## 2. wave / answer / session / consent / upload API

| 文件 | 现状 | 处置 | 目标责任 / 说明 |
| --- | --- | --- | --- |
| `app/api/session/route.ts` | `GET/POST` 创建/恢复 guest session，返回 consent catalog | **migrated** | 保留创建/恢复逻辑；新增 `SESSION_STARTED` 事件写入和 `SessionStateHead` 初始化；返回的 public context 从 state machine snapshot 派生 |
| `app/api/session/consent/route.ts` | `POST` 更新 consent | **migrated** | 保留同意写入；只有在 `ai=true` 时才允许进入 `interviewing.orienting_wave`；产生 `CONSENT_RECORDED` 事件 |
| `app/api/session/cleanup/route.ts` | `POST` 删除过期 session | **retained** | 原样保留为 cron 清理入口；按 24h TTL 删除，不引入新行为 |
| `app/api/wave/route.ts` | `GET` 取当前/下一波，`POST` 提交答案并触发 Sensemaker | **migrated** | 重写为 XState 事件驱动：`GET` 返回当前 committed microbatch 或停止状态；`POST` 处理 `ANSWER_SUBMITTED` / `ANSWER_REVISED` / `QUESTION_SKIPPED` / `MICROBATCH_CONTINUE_PROPOSED` → `QUESTION_BATCH_COMMITTED`；拆出 `app/api/wave/[id]/continue`、`app/api/wave/[id]/insight`、`app/api/wave/[id]/calibration` 等细粒度路由；不再在 API 中直接调用 `runSensemakerWave` 写记忆，改为通过 state machine commit |
| `app/api/answer/route.ts` | 独立提交单个 answer | **retired** | 功能并入 `app/api/wave/route.ts` 或 `app/api/wave/[id]/answer`；旧路由保留兜底但不再扩展，避免双入口 |
| `app/api/uploads/route.ts` | `POST` 上传解析 | **retained** | 原样保留，解析后的 chunks 作为 `material_excerpt` source 创建；`MATERIAL_ATTACHED` 事件由宿主在必要时触发 |
| `app/api/uploads/[id]/route.ts` | `GET/DELETE` 单上传 | **retained** | 原样保留 `GET` 所有权校验；`DELETE` 触发 source deletion 和下游 invalidation 传播 |
| `app/api/uploads/[id]/retry/route.ts` | `POST` 重新解析 | **retained** | 原样保留；若解析内容变化，按新 source revision 处理并传播 stale |
| 缺失路由：`app/api/wave/[id]/calibration` | 无 | **新增** | `CALIBRATION_SUBMITTED / CALIBRATION_SKIPPED` 事件提交 |
| 缺失路由：`app/api/route-intents/*` | 无 | **新增** | `ROUTE_INTENT_CANDIDATES_COMMITTED` / `ROUTE_INTENT_EDITED` / `ROUTE_INTENTS_ACCEPTED` |
| 缺失路由：`app/api/ordinary-day/*` | 无 | **新增** | `ORDINARY_DAYS_COMMITTED` / `ORDINARY_DAY_CALIBRATED` |
| 缺失路由：`app/api/final` | 无（旧 `app/api/final` 可能存在于 donor） | **新增** | `PARALLEL_LIVES_COMMITTED` 事件；`deriveRouteReadiness`  gate 验证 |

## 3. Interviewer 与 Sensemaker runtime

| 文件 | 现状 | 处置 | 目标责任 / 说明 |
| --- | --- | --- | --- |
| `lib/ai/interviewer.ts` | `runInterviewer` 调用模型生成 3-5 题，validate 后返回 | **migrated** | 保留为 proposal generator，但输出改为 canonical `InterviewerProposal`（`open_wave \| continue_wave \| propose_deep_dive`）；不再由它分配 `id`/`wave_id`；宿主在 `WAVE_MISSION_COMMITTED`/`QUESTION_BATCH_COMMITTED` 中分配并持久化；`propose_deep_dive` 只返回 `DeepDiveRecommendationProposal` |
| `lib/ai/sensemaker/wave.ts` | `runSensemakerWave` 调用模型输出 insight | **migrated** | 保留为 `WaveSensemakerProposal` 生成器；输出 `MemoryOperationProposal[] + ImmediateInsightProposal`；宿主在 `INSIGHT_COMMITTED` 中验证并提交；不再直接调用 `applyMemoryOperations` 写 `WorkingMemory` |
| `lib/ai/sensemaker/build-wave-patch.ts` | 从 answer 构建 `MemoryOperation[]` | **migrated** | 保留确定性 patch builder 逻辑，但调整为生成 canonical `MemoryOperationProposal`（`add_claim` 替代 `upsert_claim`，新增 `supersede_claim`/`mark_stale`/`update_radar`）；不再原地修改 claim |
| `lib/ai/sensemaker/final.ts` | `runSensemakerFinal` 生成三路 | **migrated** | 保留为 `ParallelLivesPlan` proposal 生成器，但增加 `deriveRouteReadiness` 前置 gate；输出 `RouteIntentCandidatesProposal` / `OrdinaryDaysProposal` / `ParallelLivesPlanProposal` 分阶段；不再直接写 `DerivedContent` JSON |
| `lib/ai/client.ts` | `generateStructured` + `logModelCall` | **migrated** | 保留 provider 抽象与 fixture 模式；增强 `GenerateProvenance` 收集：prompt file hash、schema hash、context builder version/hash、model config hash、fixture suite version；`proposal_id`/`correlation_id` 由调用方传入并记录 |
| `lib/interview/templates.ts` | Wave 1 固定模板 4 题 | **retired** | 旧固定 4 题模板不符合新 Harness（5-10 units、微批次、why_now + recent_concrete_scene 功能而非固定台词）；Wave 1 改由 `open_wave` proposal 生成，宿主仅校验两个 mandatory function 是否已覆盖 |
| `lib/interview/uncertainty.ts`（donor） | 选择/排序 uncertainty | **retired** | uncertainty 驱动模型被 elicitation unit + mission 模型替代；相关逻辑退役 |
| `lib/interview/fallback.ts`（donor） | fallback 问题 | **migrated** | 作为 fixture/降级问题来源，用于 `fixture` provider 或 repair 失败后的降级 |

## 4. working-memory types / schema / store / operations

| 文件 | 现状 | 处置 | 目标责任 / 说明 |
| --- | --- | --- | --- |
| `lib/working-memory/types.ts` | v1 类型：WorkingMemory、EvidenceNote、Claim、Constraint、RouteSeed、Uncertainty 等 | **migrated** | 全面升级为 canonical `WorkingUnderstanding v3`：引入 `SourceVersion`/`SourceHead`/`SourceRef`/`EvidenceLink`/`RadarCell`/`RadarDelta`/`WaveMission`/`ElicitationUnit`/`Microbatch`/`Question`/`QuestionOption`/`Answer`/`ImmediateInsight`/`Calibration`/`RouteIntent`/`ParallelLivesPlan`/`TrialInstance`/`Prototype`/`SafetyFlag`/`RouteReadiness` 等；移除旧 `SourceRef` discriminated union（answer/insight_feedback/user_correction/upload_chunk/chat_note），统一为 `(source_id, source_revision)`；移除 `Confidence`/`SupportStatus` 等 v1 字段 |
| `lib/working-memory/schema.ts` | v1 Zod schema | **migrated** | 替换为 canonical Zod contracts，覆盖上述 v3 类型；`WorkingUnderstanding` schema 不再允许 `upsert_claim` 等原地修改操作 |
| `lib/working-memory/store.ts` | `loadWorkingMemory`/`saveWorkingMemory` JSON blob | **migrated** | 保留 JSON 快照能力，但写入前需经过 state machine commit；新增 `loadSessionSnapshot`/`commitEvent` 等持久化入口 |
| `lib/working-memory/operations.ts` | `applyMemoryOperations`/`applyInsightFeedback` | **migrated** | 重写为纯函数 `applyMemoryOperationProposals`：支持 `add_claim` / `supersede_claim` / `invalidate_claim` / `add_constraint` / `update_radar` / `add_route_intent_seed` / `mark_stale`；`upsert_claim` 替换为 `add_claim` 或 `supersede_claim`；claim 不再原地修改；calibration 创建 source 并传播 stale/invalidated |

## 5. guest token、tenant ownership、consent、upload boundary

| 能力 | 现状 | 处置 | 目标责任 / 说明 |
| --- | --- | --- | --- |
| guest token | `lib/auth/session.ts` 生成 32B hex，HttpOnly cookie | **retained** | 原样保留；24h TTL 不变；不迁移到账号系统 |
| tenant ownership | API 通过 cookie 取 session，所有查询带 `sessionId` | **migrated** | 在事务中增加 `base_revision` 与幂等校验，防止跨租户/跨 revision 写；`SourceRef` 跨 session 校验作为 guard |
| consent | `lib/privacy/consent.ts` 三层同意 | **retained** | 原样保留；`ai`/`upload`/`research` 语义不变；研究默认不选 |
| upload boundary | 类型/大小/解析器校验，chunks 非执行 | **retained** | 原样保留；解析文本视为 `document_stated` source，不能升级为 `user_stated`；删除上传触发 source invalidation |
| 24h cleanup | `app/api/session/cleanup/route.ts` | **retained** | 原样保留；删除后按级联清理所有 records |

## 6. 现有 integration tests

| 文件 | 现状 | 处置 | 目标责任 / 说明 |
| --- | --- | --- | --- |
| `tests/integration/global.setup.ts` | 清理全部测试数据 | **retained** | 原样保留，作为集成测试前置 |
| `tests/integration/guest-session.test.ts` | guest、consent、tenant、cleanup | **retained** | 原样保留为 donor 回归测试；验证 guest token、consent、跨租户、cleanup |
| `tests/integration/upload-boundary.test.ts` | 上传边界测试 | **retained** | 原样保留为 donor 回归测试；验证类型、大小、解析、删除、跨租户 |
| `tests/integration/wave-one.test.ts` | Wave 1 行为 | **migrated** | 更新为验证 `open_wave` 返回 5-10 units、首批 1-3 题、why_now + recent_concrete_scene 功能覆盖；不再固定 4 题 |
| `tests/integration/adaptive-waves.test.ts` | 多波、修复、停止 | **migrated** | 更新为验证微批次 continue、idempotency、5 波上限、deep-dive 上限、calibration 传播 |
| `tests/integration/parallel-lives.test.ts` | 最终三路 | **migrated** | 更新为验证 `deriveRouteReadiness`、3 个 accepted intents、六轴差异、ordinary day、trial 安全、provisional vs formal |
| 新增测试：`tests/contracts/` | 无 | **新增** | Zod contract tests：SourceRef、WaveMission、ElicitationUnit、Question、Answer、Radar、RouteReadiness、GateStatus truth table |
| 新增测试：`tests/unit/` | 无 | **新增** | XState statechart table tests、idempotency property tests、stale propagation tests、`deriveRouteReadiness` fixtures |
| 新增测试：`tests/integration/harness-state.test.ts` | 无 | **新增** | XState + Prisma 集成：暂停/恢复、provider 失败、safety stop、source edit/delete 传播 |

## 7. 新增核心依赖

| 依赖 | 现状 | 处置 | 说明 |
| --- | --- | --- | --- |
| `xstate` v5 | 未安装 | **新增** | 唯一控制平面；statechart、events、guards、snapshot |
| `vitest` | 未安装 | **新增** | contract/unit/property/fault tests |
| `fast-check` | 未安装 | **新增** | property-based tests |
| `prisma` CLI 6.6.0 | 未安装 | **新增** | devDependency，与 `@prisma/client` 版本匹配 |

## 8. 删除或退役项汇总

- `lib/interview/templates.ts` 中 Wave 1 固定 4 题模板（功能由 `open_wave` proposal + host 校验替代）
- `lib/interview/uncertainty.ts`（uncertainty 驱动 interview 模型退役；uncertainty 转为 `WorkingUnderstanding` 中可由 Sensemaker 维护的对象，不再作为问题生成主驱动）
- `DerivedContent` JSON blob 模型（替换为强类型 domain records + dependency edges）
- 旧 `SourceRef` discriminated union（替换为精确 `(source_id, source_revision)` + `SourceKind`）
- `upsert_claim` / `update_claim` 原地修改语义（替换为 `add_claim` / `supersede_claim`）
- `app/api/answer/route.ts` 独立单题入口（功能并入 wave 事件提交）
