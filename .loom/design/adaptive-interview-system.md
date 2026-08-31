# 双角色自适应访谈系统

- Kind: AI system
- Status: canonical design target
- Prompt authority: `prompts/PROMPT-ARCHITECTURE.md`
- Host authority: [对话式六维决策 Harness](./conversational-six-dimension-harness.md)

## Architecture in one sentence

Interviewer 用已校准状态决定下一小批最值得问的问题；Sensemaker 在波末更新证据化理解并在后续模式中生成路线。所有模型输出先成为 proposal，再由确定性宿主校验、提交或拒绝。

## Runtime roles

### Interviewer

输入：当前用户目标、最近对话、已提交问题、active evidence/claims/corrections、六维状态、路线意向、当前波计数、敏感边界和负担信号。

输出模式：

- `open_wave`：提议 wave mission 和首个微批次；
- `continue_wave`：吸收新回答，生成下一微批次或提议结束；
- `propose_deep_dive`：说明为何需要额外波及它会改变的路线判断。

不写持久结论，不生成正式路线，不决定安全或最终停止。

### Sensemaker

输入：已提交回答、有效 Working Understanding、用户校准、源 revision、宿主状态和当前 mode 所需的最小上下文。

模式：

- `wave`：证据/claim/雷达 patch + 一个正式 insight；
- `route_intents`：3–5 个路线意向；
- `ordinary_day`：某路线的六维普通一天；
- `parallel_lives`：三条正式三年生活；
- `prototype`：某路线的三天试验；
- `blueprint`：版本化当前总结；
- `bounded_chat`：只读解释、比较和复盘。

这些是一个角色的不同 schema，不是自治 Agent。

## Control plane and model plane

### Host owns

- 会话、波次、微批次、revision 和幂等状态；
- 每波 5–10 个有效提问目标、实际出题最多 10 道；默认 3 波、最多 5 波、深挖最多 2 波；
- 用户 pause/stop/preview 权利；
- schema、枚举、source ownership、引用完整性；
- route-readiness、safety、privacy、prompt injection 和外部工具许可；
- 模型版本、重试、超时、缓存、降级和日志；
- proposal 到 committed event 的唯一转换。

### Model owns

- 当前波最值得改善的决策判断；
- 问题的自然措辞、顺序、形式和深度；
- 是否需要从抽象转场景、从模式找反例、从矛盾到取舍；
- 基于新回答继续还是结束当前波的建议；
- 理解、路线和试验的语义内容。

宿主不使用固定加权 argmax 冒充专业访谈；模型也不能用“更懂用户”绕过宿主上限。

## Session flow

### 1. Start

宿主创建 guest session，记录 consent、语言、optional material 状态和空雷达。上传被放入 `<untrusted_material>` 数据区，解析内容不得与 system/developer 指令拼接。

### 2. Open Wave 1

Interviewer `open_wave` 必须满足两个 mandatory intent：`why_now` 和 `recent_concrete_scene`。若用户开场已覆盖某 intent，不重复提问，只在 mission 中标记 resolved source。其余问题由 AI 根据当前决策生成。

### 3. Commit microbatch

宿主校验：

- 当前状态允许出题；
- batch 1–3 题，波累计不超过 10；
- id/order/wave/revision 唯一；
- 每题一个 decision target；
- 无已回答重复、诱导、诊断或越权敏感问题；
- response kind 与 options 合法，始终 allows free text/skip；
- 每题能说明怎样改变 mission 或路线。

通过后原子提交并返回 UI。刷新只恢复，不重新生成。

### 4. Receive answers

回答先成为 source，不立即触发 Sensemaker。自由文本可以映射到多个 question target；映射是可审计的 proposal，不能拆出用户未说的事实。

若源被编辑，宿主增加 revision，并将依赖旧 revision 的派生对象标记 stale。

### 5. Continue or end

Interviewer `continue_wave` 看到本波所有已提交问答后，输出：

- 0–2 句 contingent bridge；
- `continue` + 下一批问题，或 `end_wave` + 理由；
- mission 当前解决情况和仍缺信息。

宿主规则：

- `covered_unit_count < 5` 时一般不能结束，除非用户停止或安全边界；
- `covered_unit_count` 为 5–10 且 mission 已足够时可接受 `end_wave`；precovered unit 必须有精确 source mapping；
- `asked_count = 10` 后强制结束，即使有效目标尚不足；
- skipped 计入题量，不能通过重问绕过；
- 用户自由文本已覆盖目标时，不为了凑满问法而重复。

### 6. Wave sensemaking

Sensemaker `wave` 只接收已提交 sources、有效 memory 和 correction。输出 patch 和一个 insight。宿主先验证整笔 patch，再事务提交；任何悬空引用、越权状态或无来源 current fact 导致整笔拒绝。

### 7. Calibration

用户反馈成为一等 source：

- `accurate`：可增强，但不自动把 inference 升为事实；
- `partly_accurate`：相关 claim 先变 stale；若要拆分/改写，由后续 Sensemaker 以 `supersede_claim` 创建新 id/provenance，旧内容不原地改写；
- `inaccurate`：相关 claim 失效，后续 context 不得继续引用；
- 文本纠正：新增 confirmed user source，并传播 stale/invalidated。

### 8. Next-state proposal

Interviewer/Sensemaker 可建议下一常规波、深挖、进入路线意向或暂定预览。宿主先以 mission sufficiency、波数/deep-dive 上限、用户选择和安全状态决定“继续访谈还是进入路线塑形”；三个 intents 被用户接受后，再用 route readiness 决定“生成正式三路、暂定三路，还是只保存/暂停”。两个门不得合并。

## Context builder

上下文按优先顺序组装：

1. system prompt + 当前 mode contract；
2. host policy and immutable limits；
3. current session/wave state；
4. user corrections and declined boundaries；
5. active constraints and safety-relevant evidence；
6. current mission / route intent；
7. active evidence and claims with exact `SourceRef(source_id, source_revision)`；
8. radar states and reason；
9. recent relevant transcript；
10. untrusted material excerpts in isolated envelope。

截断从低优先、已总结、非当前相关 transcript 开始。不得截断 correction、declined、fixed constraint、source attribution 或高后果风险。附件永远不能高于用户直接校准。

## Model proposal contracts

### WaveMissionProposal

只使用 `insight-plan-contracts.md` 的 canonical `WaveMissionProposal`，不得在此重定义。`open_wave` 无论普通/深挖 kind 都同时提出 5–10 个 `ElicitationUnitProposal`：每个包含一个单一 `decision_target`、相关 dimensions 与可为空的 exact `precovered_by` refs。它不输出新建对象的 wave/mission/unit/question/option id；宿主校验后一次分配并提交。committed unit 必须无损保存 `target_dimensions` 与不可变连续 `order_in_wave=1..N`，刷新/重载后统一按该序号序列化。首批问题用 proposal-local `elicitation_unit_index`；后续 `continue_wave` 问题不用 index，而引用 trusted context 中 exact committed pending `elicitation_unit_id`。

### Interviewer turn

只使用 canonical `InterviewerProposal` discriminated union：open questions 是 `OpeningQuestionProposal`；continue questions 是 `ContinuationQuestionProposal`。不得在本文件创建近似 schema。

宿主单独维护 `covered_unit_count`：一个问题目标被用户直接回答或被既有主动材料精确覆盖时计入；skipped 不计入 resolved unit，但消耗 `asked_count` 上限。宿主不凭启发式补写 5–10 个语义目标；它只验证、赋 id、映射 proposal index 与推进 lifecycle。

### Deep-dive lifecycle

只使用 canonical `InterviewerProposal(mode="propose_deep_dive")`，不定义第二套 schema。该 call 只返回 eligible `deep_dive_reason`、exact active `source_refs` 与 `route_decision_affected`，questions 为空且不含 mission。宿主可接受或拒绝：接受时将 `DeepDiveRecommendation` 与 `NEXT_WAVE_COMMITTED(kind="deep_dive")` 原子提交，进入 `orienting_wave`；之后才以独立 `open_wave` call 生成 mission、5–10 units 和首批问题。两个 calls 有不同 proposal/provenance/idempotency identity，校准后的新 evidence 由第二次 call 读取。

## Question quality gate

结构 gate 之后还需语义 gate。问题应满足：

- `specificity`：用户知道从什么经历开始答；
- `decision_relevance`：答案会改变 mission、路线或试验；
- `non_redundancy`：没有被现有 source 充分回答；
- `non_leading`：不预设人格、愿望或正确答案；
- `answerability`：一次问题的认知负担合理；
- `pacing_fit`：深度与当前信任/疲劳/敏感度相称；
- `modality_fit`：卡片类型确实比纯文本更轻；
- `epistemic_fit`：不会把文档、推断或想象包装成用户事实。

低于门槛可进行一次结构化 repair，给出失败项而非让模型自由重写整个会话。

## Parallel-life readiness evaluator

宿主只用 [理解与计划契约](insight-plan-contracts.md#gate-derivation-from-committed-facts) 的 `deriveRouteReadiness(snapshot)` 从 committed records 计算每个 GateStatus；本文件不维护第二套阈值。其关键事实映射是：design question 有 active direct-user ref；两个 distinct concrete scene/behavior refs 构成 current-day anchor；六维 handled、四维 grounded；恰好三个 accepted intent 的六轴 `life_shape` 每对至少两轴不同；每条 intent 的 real cost 有 active direct-user tradeoff evidence；至少两次 insight calibration，或所有 insight 已处理且存在 explicit skip；无 active SafetyFlag 且不在 safety_stop。

暂定路径不是正式门的宽松写法。waiver 永远不能令 `formal_ready=true`，`not_applicable` 只允许表示 calibration 已完整处理且有显式 skip。完整 status derivation、布尔函数与第五波 truth table 均由 canonical contract 定义。

评估输出每项 `met / unmet / waived_by_user / not_applicable`、exact source refs、`formal_ready` 与 `provisional_allowed`。UI 只显示与用户有用的未知，不显示总完成率。

## Call budget

业务调用按实际微批次而非固定 `2W` 计算：

- 每个新 microbatch：最多 1 次 Interviewer；
- 每波 synthesis：1 次 Sensemaker；
- route intents：1 次 Sensemaker；
- ordinary day：可一次生成三路草图，或按路线并发 3 次，需评测后选择；
- final parallel lives：1 次 Sensemaker；
- focused prototype：最多 1 次；
- bounded chat：每条用户消息最多 1 次。

常见三波、每波三个微批次约为 9 次 Interviewer + 3 次 wave Sensemaker，再加路线阶段。预算是产品成本事实，不能伪装成原来四次调用；优化优先使用早停、缓存和较小 Interviewer 模型，不牺牲波内适应。

每次调用记录首尝试、repair、provider retry 和 fallback，不能把 retry 记作新业务动作。

## Determinism and stability

稳定不等于逐字相同：

- host state、limits、permissions、committed ids 和 readiness 必须确定；
- 相同输入下 mission 的决策目的和目标维度应稳定，措辞可变；
- question batch 提交后永久幂等；
- temperature、seed、model config 固定并版本化；
- prompt、schema、model、context builder 和 fixture 都有 hash；
- provider silent upgrade 通过周期性真实模型 suite 检测。

## Failure and fallback

| Failure | Host behavior | User experience |
| --- | --- | --- |
| invalid schema | 一次 repair；仍失败不提交 | 保留 composer，可重试 |
| semantic question failure | 带 rubric 失败项 repair | 不展示坏问题 |
| timeout/429/5xx | 有限 retry/fallback，幂等键不变 | 显示“还没生成出来”，回答不丢 |
| stale revision | 拒绝 proposal | 基于最新回答重新生成 |
| invalid evidence ref | 整笔 patch 回滚 | 不展示半洞察 |
| route collapse | 允许一次 targeted repair；仍失败回到 intents | 请用户校准意向，不输出换皮三路 |
| fifth wave not ready | 禁止继续采访 | 暂定三路 / 保存 / 暂停 |
| safety trigger | 进入 `safety_stop` | 停止规划，提供现实支持边界 |

## Security

- system、policy、schema 与 user/untrusted material 分区；
- 输入中的角色指令、工具请求、链接和 prompt 泄漏要求全部视为数据；
- Interviewer 和 Sensemaker 在访谈模式无外部工具权限；
- 若路线依赖时效性外部事实，进入单独经许可的 research action，不允许上传材料触发；
- tenant 与每个 exact SourceRef 在模型调用前后双重校验；
- 日志和 analytics 不写原文。

## Evidence required before implementation

- 结构 schema 与状态守卫的 property/table tests；
- 12 个 core fixtures × 多次真实模型运行；
- Interviewer 的 progressive depth、重复避免、长答吸收和敏感度人工 rubric；
- Sensemaker 的引用、校准传播、雷达状态和非诊断 rubric；
- 第五波停止、编辑旧回答、刷新、route collapse、注入和 provider failure E2E；
- prompt 组合测试证明两个角色不会互相越权；
- 最新 Keeper material findings 均有 canonical disposition，且结构检查能从磁盘验证唯一调用流。
