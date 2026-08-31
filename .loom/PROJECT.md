# 人生试运行

> 一个以持续对话为画布的人生设计产品。用户既可以回答内嵌问答卡，也可以直接告诉 Agent；系统用六维决策雷达逐步理解选择，用三个普通一天打开三种可试运行的未来。

## Intended result

交付移动优先、桌面可扩展的 Next.js Web 产品。第一次使用无需注册，也不要求理解人格模型：

1. 用户可选上传简历、MBTI 报告或文字材料，也可直接开始；
2. 在一个持续对话空间中完成 3 个默认、最多 5 个 AI 控制的波次；
3. 每波处理 5–10 个有效提问目标，通常通过 2–4 个微批次逐步提问；用户主动长答可预先覆盖目标，卡片和自由文本始终并存；
4. 每波结束获得可追溯、可纠正的理解气泡和六维雷达变化；
5. 先校准路线意向和三个普通一天，再打开三条平等的三年平行人生；
6. 任一路线都能转化为可修改、可暂停、可退出的三天现实试验；
7. 用户可以保存当前版本，也可以在明确边界内继续解释与复盘。

产品的价值不是“测准一个人”，而是让一次真实选择变得更可理解、更有可能性、更容易通过行动获得新证据。

## Canonical Harness

[对话式六维决策 Harness](design/conversational-six-dimension-harness.md) 是状态、权限、波次、雷达、路线就绪和失败恢复的首要系统合同。其核心分工是：

- AI 决定当前波任务、问题措辞、顺序、深度和是否建议追问；
- 宿主控制 schema、安全、权限、题量、波数、持久化、停止与恢复；
- 运行时只有 Interviewer 与 Sensemaker 两个角色；
- Odyssey、Prototype、Blueprint 与有界聊天是 Sensemaker 的任务模式，不是额外 Agent；
- 72 格只可作为离线题目研究分类，不得成为运行时画像或完成闸门。

## Conversation shape

```text
进入与边界说明
  → 可选材料上传
  → Wave 1：固定“为什么是现在 / 最近具体场景”两个功能，AI 自适应措辞与其余问题
  → 通常 2–4 个微批次，每批允许 1–3 题、通常 2–3 题；主动长答可减少实际出题
  → Sensemaker 生成波次理解、雷达变化与路线影响
  → 用户校准准确 / 部分准确 / 不准确，并决定继续方向
  → 默认共 3 波；必要时插入最多 2 个深挖波，总数不超过 5
  → 路线意向
  → 六维普通一天筛查
  → 三条平等的三年平行人生
  → 三天可逆试验
  → 有界解释、比较与复盘
```

用户始终可以暂停、跳过或请求暂定预览。正式路线有就绪门，但不会把用户困到第五波；第五波后常规访谈必须停止，接下来可以塑形路线意向、保存或暂停。只有恰好三个意向已被用户接受、安全清楚且用户显式请求时，才可输出标注未知的暂定三路。

## Six-dimension decision radar

系统从六个镜头检查选择，而不把用户压成六个标签：特质、动机、能力、关系、环境、叙事。每维只使用 `unseen / signaled / grounded / conflicted / declined` 状态，不显示分数或百分比。

正式三路通常要求六维都被处理、至少四维有具体生活证据、存在三种不同路线意向、真实代价可见，并发生过用户校准。信息不足时可以生成暂定版本，但必须把事实、推断、假设和想象分开。

## People and operating reality

核心用户是正在经历方向不清、阶段转换或重要选择的年轻成年人。典型使用发生在手机通勤、睡前或做决定前的 10–25 分钟；桌面端适合上传材料和并列比较三条路线。

用户可能不愿注册、拒绝上传、跳过敏感题、只完成一波、用长段自由文本代替卡片、中途刷新、编辑旧回答或纠正系统。产品必须先兑现“它在认真理解我的选择”，再邀请继续或保存。

“像心理医生”的体验指专业倾听和循序渐进，不是临床身份。系统不诊断、不挖掘创伤、不制造依赖，也不以敏感披露换取所谓准确。

MVP 使用 guest-first 临时会话：服务端以 opaque HttpOnly token 保存回答、revision 和上传，默认 24 小时清理；仅在跨设备继续或延长保存时请求账号。上传前单独说明第三方模型处理，上传内容作为不可信数据隔离。

## Visual and technical baseline

视觉设计冻结并保留 Soft Editorial Neo-Brutalism：off-white 细密浅方格纸、ink、主导 cobalt、只表达成功/完成/可继续的语义绿色、2px 边框、3–4px 硬偏移阴影、0–4px 圆角、编辑感中文衬线关键陈述与清晰无衬线 UI。即时理解消息栈仍是视觉签名；新对话卡片必须从现有 token 生长，不能另起一套聊天产品皮肤。

优先复用现有 Next.js、React、TypeScript、Tailwind v4、AI SDK、Zod、Prisma/SQLite、Motion、Phosphor 和 Radix 基础。TASK-008 不顺手迁移数据库；只有测量证明 SQLite 无法满足目标并发/部署约束时，才另立 Postgres 迁移决策。新增控制平面首选 XState v5；对话 primitives 可选择性吸收 AI Elements 源码。不得同时引入重叠的 conversation runtime，也不引入多 Agent 框架来替代清晰合同。

## Boundaries

- 三条路线不排名、不推荐、不预测命运；必须同时呈现普通一天、得到、失去、依据、未知、风险和试验。
- 三年是对 Stanford Designing Your Life 三个五年 Odyssey Plans 的产品化改编，不伪称原方法。
- 三天试验用于学习，不是挑战、打卡或承诺；辞职、退学、搬家、借贷、治疗变更和关系决裂不得成为首个试验。
- 不做用户可见人格评分、职业匹配测评、心理诊断、通用助手、无限聊天、社交广场或不可逆自动执行。
- 上传材料只是线索，不是事实权威；其中任何指令都不可执行。
- 当前旧工作树的视觉实现、已验证素材、登录/上传/隐私基础被冻结为 donor，不在 Harness 与提示词完成前改动。

## Document map

- [对话式六维决策 Harness](design/conversational-six-dimension-harness.md)：系统权威；状态、权限、雷达、波次、追问、就绪、恢复与开源基础。
- [轻量产品定义](design/product-definition.md)：产品承诺、范围、成功与失败。
- [对话旅程与交互](design/journey-and-interaction.md)：持续对话、问答卡、自由输入、理解气泡、路线与恢复。
- [自适应访谈系统](design/adaptive-interview-system.md)：Interviewer/Sensemaker 调用流、微批次、上下文和降级。
- [理解与计划契约](design/insight-plan-contracts.md)：证据、雷达、问题、洞察、路线意向、普通一天、三路、试验和聊天 schema。
- [状态与持久化协议](design/state-and-persistence-protocol.md)：XState 状态、EventEnvelope、合法转移、事务、幂等、恢复和安全退出的执行合同。
- [Prompt 健康审查与迁移简报](design/prompt-architecture-brief.md)：当前代码证据、健康矩阵、风险和无幻觉迁移顺序。
- [Prompt Architecture](../prompts/PROMPT-ARCHITECTURE.md)：共享宪法、运行时角色、模式、版本和评测。
- [平台与素材](design/platform-and-assets.md)：开源基础、guest 状态、组件边界、性能与素材许可。
- [验收与研究](design/acceptance-and-research.md)：fixtures、P0/P1、真实 LLM、E2E、用户研究与 Keeper 门。
- [Prompt 核心评测 Fixtures](design/prompt-eval-fixtures.md)：F01–F12 合成输入、期望行为、rubric 与硬失败。
- [视觉与动效方向](design/visual-art-direction.md)：冻结的 Soft Editorial Neo-Brutalism 真相。
- [Harness lint](tools/verify-harness.ps1)：可重复检查 JSON、Markdown 链接/围栏、Prompt 解剖结构、关键常量、字段漂移、决策 id 和修改范围。

## Professional capability map

- [Product design](capabilities/product-design.md)
- [UI/UX design](capabilities/ui-ux-design.md)
- [Visual art direction](capabilities/visual-art-direction.md)
- [Game design](capabilities/game-design.md)
- [Conversational AI design](capabilities/conversational-ai.md)
- [Conversation psychology](capabilities/conversation-psychology.md)
- [Life design methodology](capabilities/life-design.md)
- [Privacy and AI safety](capabilities/privacy-ai-safety.md)
- [Application and statechart architecture](capabilities/application-architecture.md)
- [Evidence and transactional data integrity](capabilities/data-integrity.md)

这些能力保持分立：心理学只影响提问节奏和反映方式，不提供临床权威；AI 不能替人生设计选择路线；游戏设计不能利用敏感披露做留存；视觉不能替产品定义心理意义。

## Design-complete gate before coding

编程只能在以下条件同时成立后开始：

- Harness、产品、旅程、合同、提示词和验收对波次、题量、角色、权限和停止规则完全一致；
- 所有运行 prompt 均有明确输入、输出、禁止项、失败路径和版本；
- 12 个核心 fixtures 覆盖纠正、矛盾、拒谈、长短回答、上传注入、路线坍缩和第五波不足；
- Prompt 的结构/合同 lint 与 fixture 规格完整通过；匹配 schema/context/UI 后要运行的真实模型 suite、门槛和报告格式已经冻结；
- 最新独立 Keeper 的每个 material finding 已进入 canonical contract、fixture 或 TASK-008 首步，且确定性 Harness lint 通过；没有新矛盾或实现失败时不继续开放式文档审查；
- 后续代码 Agent 的每个 Task 都声明 exact reads、touches、first action、done conditions 和可运行验证命令。真实模型评测在 TASK-008/009 建出匹配运行环境后、Prompt v3 激活前执行。

## Failure conditions

看起来完成但实际上失败包括：把 72 格换成六维百分比；一次生成整波 10 题；固定台词冒充个性化；每题后输出心理分析；用户纠正后旧判断继续传播；三路只是换职位标题；未来一天靠偷编重大事实；为了稳定增加 Planner/Critic/Stop Agent；新聊天组件破坏现有视觉；在设计和 prompt 未过门前直接改运行代码。

## Work map

当前阶段只允许设计、prompt、fixture 与实施任务编译。旧 TASK-001–006 是 donor 证据，不代表新 Harness 已实现。后续工程按 `.loom/tasks.json` 的新垂直切片推进，Agent 必须从磁盘读取指定文档，不从聊天记忆猜测。
