# 对话式六维决策 Harness

- Kind: system contract
- Status: canonical design target
- Applies to: interview, inline question cards, working understanding, route intent, ordinary-day simulation, three parallel lives, trial design
- Does not authorize: runtime implementation, visual redesign, clinical positioning

## 1. 这套系统真正要完成什么

人生试运行不是一份人格测验，也不是一位模型连续问满若干题后给出答案。它是一套受宿主管束的对话式人生设计 Harness：用户在一个持续的对话空间里逐渐说出自己；AI 决定此刻怎样问更自然、更有信息价值；宿主保证边界、状态、证据、停止和恢复不会随模型发挥而漂移。

系统的产物不是“完整画像”，而是足以支持下一次可逆探索的**决策理解**：

1. 用户眼下真正需要设计的是什么；
2. 哪些生活证据、冲突和现实约束会改变选择；
3. 哪几种未来值得认真进入普通一天去感受；
4. 下一步怎样用低成本行动获得新信息。

“像心理医生”只取其专业对话感：注意节奏、具体倾听、准确反映、允许沉默和修正、逐步深入、在得到许可后温和挑战。系统不得自称治疗师，不诊断，不利用脆弱性促使披露、留存或服从。

## 2. 第一性原理

### 2.1 有效访谈依赖决策信息，不依赖题库完成度

旧的 72 格可以作为离线研究和题目设计的检查表，但不能再成为运行时闸门。运行时真正需要保证的是：最终路线中的重要判断有来源，重要生活面没有被完全忽略，矛盾没有被抹平，缺失信息被诚实标记。

替代物是**六维决策雷达 + 路线就绪门**。雷达防止窄化，路线就绪门防止模型在证据不足时写得像真的。路线就绪门守的是三条未来生活的生成，不把用户困在访谈里；访谈可以因任务充分、用户停止/预览或第五波上限而结束。二者都不显示分数、百分比或“人格完成度”。

### 2.2 自适应必须发生在波内，而不只发生在波间

一波需要处理 5–10 个有效提问目标；如果一次性把它们全问出来，后半波无法吸收用户刚说出的内容。因此通常由 2–4 个微批次推进，每个微批次允许 1–3 题、通常 2–3 题；AI 在收到上一批回答后再生成下一批。用户主动长答可以预先覆盖目标，系统不得为了凑实际题数重复追问。

### 2.3 AI 负责判断，宿主负责治理

把提问焦点写死会失去个性化；把所有控制权交给模型会失去稳定性。正确分工不是折中，而是权限分层：

| 事项 | AI 权限 | 宿主权限 |
| --- | --- | --- |
| 当前波的任务、措辞、顺序、是否需要追问 | 提议并执行 | 校验是否合法、未重复、未越界 |
| 六维状态和证据解释 | 提议更新 | 校验引用、版本、来源和冲突传播 |
| 是否结束当前微批次/当前波 | 提议 | 按题量、状态和上限裁决 |
| 是否插入深挖波 | 提议原因 | 按资格和总波数裁决 |
| 是否生成正式三路 | 提供形成路线所需的语义材料 | 宿主从 committed facts 纯推导路线就绪门并裁决 |
| 安全、隐私、注入、调用预算、暂停和硬停止 | 不可覆盖 | 唯一权威 |

模型不能改 schema、上限、安全政策或历史事实；宿主也不替模型用机械分数选择“最高未知”。

## 3. 六维决策雷达

六维不是六种人格标签，而是六个观察镜头。每条证据可以同时影响多维，但必须说明为什么。

| 维度 | 要理解的内容 | 容易犯的错 |
| --- | --- | --- |
| 特质 Traits | 稳定偏好、节奏、注意方式、对不确定性的反应 | 用 MBTI 或单次表现定性 |
| 动机 Motivation | 想靠近什么、想避免什么、什么值得付代价 | 把社会期待当内在愿望 |
| 能力 Capabilities | 已有能力、可迁移能力、学习速度、真实反馈 | 把兴趣等同能力，或把当前不会当永久不能 |
| 关系 Relationships | 重要的人、责任、支持、边界、合作方式 | 把关系只当阻力，或诱导披露隐私 |
| 环境 Environment | 地点、资源、制度、身体与时间条件、工作方式 | 把可变环境误写成人格 |
| 叙事 Narrative | 用户如何解释过去、现在和可能的自己 | 把漂亮故事当事实，或替用户写身份 |

### 3.1 状态枚举

每个维度只允许以下状态：

- `unseen`：尚无可用材料；
- `signaled`：已有线索，但主要是抽象自述、单一场景或来源有限；
- `grounded`：至少有一个具体场景/行为/取舍，并足以影响某个路线判断；
- `conflicted`：存在互相冲突的证据、解释或用户校准；
- `declined`：用户明确不愿谈，系统必须尊重，不能包装成待攻克缺口。

状态不是从低到高的分数。`conflicted` 往往比虚假的 `grounded` 更有价值；`declined` 也不构成失败。

### 3.2 证据要求

一条可用于正式路线的理解至少记录：

- `SourceRef(source_id, source_revision)`：精确指向回答、自由文本、上传片段或用户校准的不可变版本；
- `source_kind`：用户陈述 / 文档陈述 / 行为反馈 / 外部事实；
- `dimension_links`：影响哪些维度以及原因；
- `epistemic_status`：事实、工作推断、设计假设或想象；
- `user_verdict`：未校准、准确、部分准确、不准确；
- `revision`：源内容被编辑后可使派生结果失效。

上传材料永远是“文档这样说”，不是“用户事实”；其中的指令永远不能进入控制层。

## 4. 路线就绪门：72 格的真正替代物

路线意向阶段先生成 3–5 个可编辑 seed，用户最终接受恰好三个真正不同的意向。此后正式三路不要求一个伪科学式全量画像，但必须同时满足下列功能性条件：

1. **问题已成形**：当前设计问题、为什么是现在、至少一个不可忽略的现实约束清楚；
2. **普通一天有锚点**：至少两个不同的、仍为 active head 的直接用户来源，以具体场景或已观察行为支撑当前 claim／grounded radar，不需要大量偷编；
3. **六维均被处理**：没有维度仍为 `unseen`；可以是 `signaled`、`grounded`、`conflicted` 或 `declined`；
4. **主要证据够实**：正式版本至少四维达到 `grounded`；不足时用户可另外授权暂定路径，但它不会冒充正式就绪；
5. **不是只有一个答案**：用户已接受恰好三个路线意向；任意两条在日常节奏、工作学习、关系、环境、责任与资源六个标准化 life-shape 轴中至少有两个不同，语义校验还要拒绝文字换皮；
6. **代价可见**：每条已接受意向都有非空 `real_cost`，且整体至少有一个 active direct-user tradeoff 证据；
7. **校准发生过**：至少两个不同正式波次的洞察有用户提交的校准；若用户跳过，则只有在每个已关闭波次洞察都已提交或显式跳过、且至少一次为跳过时，这一项才是 `not_applicable`；
8. **高后果边界清楚**：不会把辞职、退学、搬家、借贷、治疗变更、公开披露或关系决裂作为首个试验。

这不是给用户看的检查单，也不是让 AI 机械凑证据的目标。宿主的 `deriveRouteReadiness(snapshot)` 只读取同一 committed revision 的事实并确定性产生状态与 refs；模型不返回 gate 状态。它只回答一个问题：**在三个意向已经由用户塑形后，现在生成的三条生活是否有足够依据，而且不会靠幻觉补洞？** 它不决定用户有没有资格结束访谈。

正式门与暂定门是两个不同结果：waiver 永远不能把 `formal_ready` 变为 true；暂定三路至少要求设计问题已成形、三个路线意向已不同、安全清楚，并有用户显式请求。完整 gate truth table 见 [理解与计划契约](insight-plan-contracts.md#executable-readiness-truth-table)。

若到第五波仍未满足，常规访谈必须停止。用户可选择：

- 进入路线意向塑形；若之后恰好三个意向被用户接受、安全清楚且用户显式请求，可生成明确标注未知的“暂定三路”；
- 只保存当前理解和路线意向；
- 暂停，未来继续。

不得因为门未通过而制造第六波。

## 5. 波次系统

### 5.1 总体边界

- 默认目标：3 个正式波次；
- 硬上限：5 个正式波次；
- 每波：5–10 个单一决策目标的 `elicitation units`；通常对应 5–10 道实际问题，主动自由表达可预先覆盖其中若干；
- 每个微批次：允许 1–3 题，通常 2–3 题；通常共 2–4 批，预覆盖充分时可以更少；
- 最多 2 个深挖波，计入 5 波上限，可插入任何位置；
- 用户随时可以暂停、跳题、自由表达或请求先看一个暂定版本；
- “我已经够了”在任何时刻都应被尊重，不允许把用户锁到第五波。

`elicitation unit` 是一个会改变决策的单一提问目标。宿主区分 `covered_unit_count` 与 `asked_count`：用户主动自由文本可把目标标为 `precovered`，因此无需再问；系统实际提出的问题最多 10 道。被跳过的问题消耗实际问题预算，但不算 resolved；一个问题若包含多个必须分别作答的子问题，应拆开计数。普通情况下 5–10 个 unit 都由实际问题处理，只有已有用户材料能精确映射时才允许少问。

### 5.2 第一波的固定骨架，不固定台词

第一波只固定两个功能：

1. **为什么是现在**：此刻发生了什么，让用户愿意打开这次对话；
2. **最近的具体场景**：从真实的一天或一次事件获得可观察材料。

AI 根据用户开场、上传材料和语言风格决定具体措辞、顺序和其余 3–8 题。不得用固定四题模板冒充个性化。

### 5.3 每波生命周期

```text
orient
  → AI 提议 wave mission
  → host 校验
  → microbatch 1（1–3题，通常2–3题）
  → 用户用卡片或自由文本回答
  → contingent bridge（0–2句，不落正式结论）
  → microbatch 2/3/4（按信息变化自适应）
  → 处理满5个有效目标后 AI 可提议结束；实际第10题后 host 强制结束
  → Sensemaker wave synthesis
  → insight bubble + radar delta + route impact
  → 用户校准
  → host 决定下一波 / 深挖 / 进入路线意向 / 暂定种子预览 / 暂停
```

`contingent bridge` 只完成自然衔接，例如承认某个具体事实、指出接下来追问的理由。它不能写入持久 claim，不能制造“我已经看透你”的感觉，也不能每题都输出模板化赞美。

### 5.4 Wave mission 合同

每波必须只有一个可描述的主任务，但可以从多个维度取证。canonical committed mission 至少包含：

- `id` 与 `wave_id`（只由宿主分配，model proposal 不含）；
- `decision_to_improve`：这波会改善什么判断；
- `target_dimensions`；
- `known_source_refs`；
- `important_unknown`；
- `why_now`；
- `exit_condition`；
- `sensitivity_ceiling`。

开波 proposal 还必须提供 5–10 个无 domain id 的 `ElicitationUnitProposal`。每个 unit 是一个单一决策目标；宿主只校验并赋 id，不用固定题库或启发式去补齐语义内容。首批问题用 proposal-local index 指向 unit，提交时一次替换成宿主分配的 `elicitation_unit_id`。

合法 mission 的例子：厘清“自由”到底是时间自主、地点自主还是免于评价；比较用户在独立创造和协作交付中的能量差异；理解照护责任对未来普通一天的真实边界。

非法 mission：补全人格、覆盖六维、再多了解一点、验证用户属于某类型、说服用户选某路线。

### 5.5 深挖波资格

AI 只能因以下原因提议深挖波，并指出它会改变哪项路线判断：

- 一个高影响理解仍停留在 `signaled`，而正式路线会依赖它；
- `conflicted` 证据可能让普通一天或代价完全不同；
- 三个路线意向正在坍缩成同一路径换皮；
- 当前普通一天只能依靠未经允许的想象补全；
- 用户主动希望沿某处继续。

“还可以更懂用户”不是资格。宿主拒绝不合格深挖，不让模型以好奇心无限延长流程。

## 6. 对话界面合同

### 6.1 一个持续画布

产品保持单一对话时间线。阶段变化通过消息、轻量状态标签和内容展开表达，不切成向导式页面迷宫。路线比较和三日试验可以进入专注视图，但仍能回到原对话上下文。

### 6.2 两种同等有效的输入

每个提问回合都同时提供：

- **问答卡片**：适合单选、多选、排序、量尺、短文本和场景提示；
- **自由输入框**：用户可以不用卡片，直接告诉 Agent，也可以一次补充卡片没有覆盖的内容。

AI 选择卡片形式时必须说明结构带来的真实收益。不能把适合一句自由回答的问题硬塞成选项；不能用选项提前框定用户的人生。

### 6.3 回答折叠与编辑

卡片提交后折叠成普通用户气泡，保留简短“来自问答卡”标记和编辑入口。编辑旧回答时：

1. 新建 source revision，不静默覆盖历史；
2. 使依赖旧 revision 的 claim、洞察和路线片段失效；
3. 明确告诉用户哪些理解需要重新生成；
4. 不自动重跑高成本模型调用，等用户确认继续。

### 6.4 即时理解气泡

每波结束只有一个正式理解气泡，固定信息职责而不固定文学模板：

- **你告诉我的**：可追溯事实/场景；
- **我目前的理解**：暂定解释，避免“你其实”；
- **还不确定**：最可能改变下一步的未知；
- **雷达变化**：哪些维度为什么改变状态；
- **路线影响**：它会怎样打开、收窄或重写路线意向。

用户可选择 `准确`、`部分准确`、`不准确`，并可说明“继续沿这里”或“换个方向”。校准是证据，不是满意度按钮。

## 7. 从访谈到未来：路线意向与普通一天

系统不应从访谈直接跳到三篇漂亮故事。中间需要一个短暂、可校准的路线意向层：

1. Sensemaker 提出 3–5 个路线意向，每个只写核心生活变化与真实代价；
2. 用户可以合并、否定、改写或补充；
3. 用户明确接受恰好三个彼此真正不同且都值得认真对待的意向；AI/宿主只做差异与合同校验；
4. 对每个意向先进行**普通一天筛查**，再展开三年轨迹。

普通一天必须依次检查六个镜头：

- 特质：这个节奏与注意方式是否可持续；
- 动机：一天里什么真正提供意义或满足；
- 能力：用户在做什么、学习什么、接受什么反馈；
- 关系：与谁相处、承担什么、牺牲什么；
- 环境：地点、制度、资源、身体和时间怎样约束它；
- 叙事：用户会怎样理解“我正在成为谁”。

每一句重要内容必须标为：用户事实、工作推断、待验证假设或想象镜头。想象可以有画面，但不能伪装成预测。

正式三路必须地位平等，分别写明普通一天、三年形状、得到、失去、依据、未知、风险和三天试验。系统不排序、不推荐、不暗示第一条是正确答案。

## 8. 两个运行时角色

### 8.1 Interviewer

负责：波任务提议、微批次问题、卡片形式、自然衔接、深挖建议。

不负责：持久画像、最终解释、停止裁决、安全策略、路线生成。

### 8.2 Sensemaker

通过不同 mode 负责：波次理解与雷达更新、路线意向、普通一天筛查、三路生成、试验设计、蓝图和有界复盘。

不负责：再次采访、覆盖用户校准、替用户决策、改变宿主状态。

`Odyssey Generator`、`Prototype Designer`、`Blueprint Writer` 是 Sensemaker 的任务模式，不是额外 Agent。除非真实评测证明独立角色在质量上产生显著且稳定的收益，否则禁止新增 Planner、Auditor、Critic 或 Stop Agent。

## 9. 宿主状态机

使用 XState v5 表达唯一的确定性控制平面；AI 输出只是 proposal，不能直接跳状态。完整 EventEnvelope、合法 transition、原子事务、幂等、pause/degraded history 与 safety exit 由 [状态与持久化协议](state-and-persistence-protocol.md) 规定；本节只保留产品级总览。

顶层状态：

```text
entry
consent_and_optional_material
interviewing
  ├─ orienting_wave
  ├─ awaiting_answers
  ├─ synthesizing_wave
  └─ awaiting_calibration
route_intents
ordinary_day_screening
parallel_lives_ready
trial_active
bounded_reflection
paused
safety_stop
degraded
```

关键事件：

- `QUESTION_BATCH_PROPOSED / QUESTION_BATCH_COMMITTED`
- `ANSWER_SUBMITTED / ANSWER_REVISED / QUESTION_SKIPPED`
- `MICROBATCH_CONTINUE_PROPOSED`
- `WAVE_END_PROPOSED / WAVE_END_COMMITTED`
- `INSIGHT_PROPOSED / INSIGHT_COMMITTED`
- `CALIBRATION_SUBMITTED / CALIBRATION_SKIPPED`
- `DEEP_DIVE_PROPOSED / NEXT_WAVE_COMMITTED`
- `PROVISIONAL_PREVIEW_REQUESTED`
- `ROUTE_READINESS_EVALUATED`
- `READINESS_GATE_WAIVED`
- `ROUTE_PHASE_ENTERED / ROUTE_INTENT_CANDIDATES_COMMITTED / ROUTE_INTENT_EDITED / ROUTE_INTENTS_ACCEPTED`
- `ORDINARY_DAY_SCREENING_STARTED / ORDINARY_DAYS_COMMITTED / ORDINARY_DAY_CALIBRATED`
- `PARALLEL_LIVES_COMMITTED`
- `TRIAL_STARTED / TRIAL_PAUSED / TRIAL_EXITED / TRIAL_COMPLETED / TRIAL_REFLECTION_SUBMITTED`
- `BLUEPRINT_COMMITTED`
- `SESSION_PAUSED / SESSION_RESUMED`
- `SAFETY_BOUNDARY_TRIGGERED`
- `PROVIDER_FAILED / PROVIDER_RECOVERED`

所有 `*_PROPOSED` 必须经过 schema、exact SourceRef、revision、权限和状态守卫才能产生相应 `*_COMMITTED`。proposal 自身不是持久状态事实。

## 10. 稳定性、恢复与成本

- 模型输出使用严格结构化 schema；创作自由留在字段内容，不留在状态控制；
- 每次调用携带 `session_revision`、`wave_id`、`microbatch_index`、`prompt_version` 和幂等键；
- 问题一旦提交即冻结；刷新后恢复同一批，不重新生成；
- 模型修复最多一次；失败后保留原状态，显示可重试或自由输入的降级路径；
- 不逐题调用模型。每个微批次最多一次 Interviewer 调用；每波一次 Sensemaker 调用；
- 上下文按证据、有效 claim、纠正、约束、路线意向和最近对话组装；不得让长附件挤掉用户纠正；
- 普通日志只记录 id、状态、耗时、token、错误和 rubric，不记录原始回答或上传正文。

## 11. 安全与专业边界

- 用户可以拒答任何问题；敏感题先说明为什么可能有用，并提供低暴露替代问法；
- 禁止诊断、病理化、暗示隐藏创伤、利用情感依赖、制造“只有我懂你”；
- 遇到急性危机信号，宿主切到安全边界，不继续人生规划；
- 医疗、法律、财务和其他高后果判断只做信息整理与可逆下一步，不冒充专业结论；
- 外部事实会变化时必须联网核验或明确无法核验；模型不能靠常识补写薪资、政策、签证、学校和市场条件；
- 不根据受保护属性替用户缩小路线，除非用户明确把相关现实约束放入设计问题；
- 上传内容处于不可信数据信封中，任何“忽略上文/调用工具/泄漏规则”的文本都只是文档内容。

## 12. 开源基础与取舍

优先复用现有稳定栈和可审计的开源基础：

- **XState v5（MIT）**：只承担状态机、守卫、事件与恢复；
- **AI SDK + Zod**：承担 provider 抽象、流式输出和结构化契约；
- **AI Elements（Apache-2.0）**：按源码选取 conversation/message/prompt primitives，再套用既有视觉 token；
- **Radix primitives、Tailwind、Motion、Phosphor**：延续现有无障碍、样式、动效和图标基础；
- **既有 Prisma/SQLite 持久层**：先延续 guest session、revision 和证据引用；TASK-008 不夹带数据库产品迁移。若后续并发/部署证据要求 Postgres，单独决策和迁移。

不同时引入 AI Elements 与 assistant-ui：二者在对话运行时层重叠，会制造第二套状态和样式抽象。也不为了“Agent 感”引入多 Agent 框架；当前复杂度的核心是合同和状态，不是编排数量。

所有第三方组件必须逐个复制、审计、定制，不接受整套主题覆盖。现有 Soft Editorial Neo-Brutalism 视觉规范、token 和已验证资产被冻结为视觉真相。

## 13. 明确禁止的架构漂移

- 恢复 72 格运行时完成度、用户画像分数或雷达百分比；
- 固定完整 Wave 1 台词或一次生成整波 10 题；
- 为了“像真人”让模型自行突破题量、波次、安全或数据权限；
- 每题后都生成长洞察或赞美；
- 把问答卡片变成必须输入方式，隐藏自由文本；
- 用户纠正后仍复用旧 claim 或路线；
- 用三条相似职业路径冒充平行人生；
- 把想象的一天写成对用户未来的预测；
- 让 Planner/Critic/Persona Agent 偷偷回流；
- 在 Harness 未通过 fixture 与 Keeper 审查前修改产品运行代码。

## 14. Harness 完整的证据

进入编码前，至少需要：

1. 本文与产品定义、旅程、数据合同、Prompt Architecture、验收矩阵无冲突；
2. 两个运行时角色和每个 Sensemaker mode 的输入、输出、权限、失败路径明确；
3. 12 个核心 fixture 已成为可执行规格，覆盖短答、长答、跳过、纠正、矛盾、拒谈、上传注入、第五波不足、路线坍缩和危机边界；
4. state/event/source/readiness 的 table 与 property 测试规格完整，可由 TASK-008 直接实现；
5. 新 Agent 仅从磁盘文档即可说明：何时问、问多少、为什么追问、何时停、怎样生成、怎样撤回错误；
6. 最新独立 Keeper 的 material findings 已逐项进入合同、fixture 或实施任务，确定性 lint 通过，且实现者无需再发明关键规则后，才把 TASK-008 交给代码 Agent。没有新矛盾或失败证据时不继续开放式审查；真实模型多次运行必须在 TASK-008/009 提供匹配 schema、context builder 与交互外壳后、Prompt v3 激活前完成。
