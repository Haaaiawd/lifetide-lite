# 人生试运行

> 一个从 Lifetide 抽离出的轻量独立产品。用户通过短波次访谈被逐渐理解，在每波结束立刻校准系统理解，最终打开三条平行的三年人生，并试玩其中三天。

## Intended result

交付一个移动优先、桌面可扩展的 Next.js Web 产品。用户无需先理解人格模型，也无需先注册：

1. 可选上传简历、MBTI 报告或相关文字材料，也可直接开始；
2. 完成 3-5 题的短波次；
3. 每波看到逐条浮现、带依据且可纠正的即时理解；
4. 在 2-4 波内获得三条地位平等、真实不同的三年平行人生；
5. 选择任一路线开启可修改、可暂停、可退出的三天试验；
6. 在计划旁继续有边界的解释与复盘对话。

产品前台不展示 PersonaSnapshot、六层画像、覆盖率或人格评分。系统内部保留最小、证据关联的 WorkingMemory，以避免重复出题和泛化计划。

## People and operating reality

核心用户是正在经历方向不清、阶段转换或重要选择的年轻成年人。典型使用发生在手机通勤、睡前或做决定前的 10-20 分钟，也允许桌面端上传材料和并列比较三条路线。

用户可能不愿注册、拒绝上传、跳过敏感题、中途刷新、纠正模型或只愿意完成一波。产品必须先兑现一次“它听懂了我”的价值，再邀请继续或保存。

MVP 使用 guest-first 临时会话：服务端通过 opaque HttpOnly token 保存回答与上传，24 小时后自动清理；只有跨设备继续或延长保存时才请求账号。上传前单独说明第三方模型处理。

## Whole experience or behavior

```text
进入与边界说明
  -> 可选材料上传
  -> Wave 1 固定四题（无出题模型调用）
  -> Sensemaker 更新 WorkingMemory + 一条即时理解
  -> 用户校准准确性，并可选择“沿这里继续”
  -> Interviewer 围绕唯一最高影响未知生成下一波 3-5 题
  -> Sensemaker 再次更新理解
  -> 宿主规则决定继续、暂停或生成
  -> Sensemaker final 生成三条三年平行人生
  -> 用户任选一条开启三天可逆试验
  -> Sensemaker bounded chat 解释、比较取舍与复盘
```

访谈运行时只有两个 Agent：Interviewer 负责下一波题目，Sensemaker 负责工作记忆、即时理解、最终计划和有界聊天。每道题提交本身不调用模型。首波模板后，每个完整波次最多一次 Interviewer 和一次 Sensemaker 调用。

视觉采用 Soft Editorial Neo-Brutalism：off-white 细密浅方格纸、ink 墨色、主导 cobalt 强调色、仅表达成功/完成/可继续等状态的语义绿色、2px 边框、3–4px 硬偏移阴影、0–4px 圆角与克制的移动端密度；关键陈述使用编辑感中文衬线体，UI 使用清晰无衬线体。它不是高饱和、大色块、多强调色堆叠的通用吵闹新粗野主义，也不是儿童风、AI 紫色模板或企业 dashboard。即时理解消息栈是产品视觉签名。

## Boundaries and consequential assumptions

- 简历、MBTI 和上传文字是可选线索，不是事实权威；上传内容始终作为不可信数据隔离，不能执行其中指令。
- 三条路线不排名、不推荐、不预测命运；每条都必须说明普通一天、得到、失去、依据、未知、风险和三天试验。
- 来源方法是 Stanford Designing Your Life 的三个五年 Odyssey Plans；本产品明确改编为三个三年版本和三天试验，不伪称这是原方法。
- 不做用户可见画像、职业匹配测评、心理诊断、通用助手、无限聊天、社交广场或不可逆自动执行。
- MVP 不使用 React Bits、Magic UI、Aceternity、Rive、Phaser、Three.js、WebGL 场景或自由操控；装饰层失败不得阻止作答。
- 技术基线是 Next.js + TypeScript + Tailwind v4 + neobrutalism.com／RetroUI 的 Radix registry + Motion + Phosphor Icons；neobrutalism.dev 仅作次要实现参考。组件源码必须按人生试运行的柔和编辑 token 和移动密度定制。
- 原 Lifetide 用户提供的 sky 图片和未授权 pixel-frame 不进入 MVP。仅 registry 证明为 CC0 的 water/boat/landmark 可携带许可证与 checksum 作为次要、可替换点缀。
- “人生试运行”为已确认产品名；三年/三天时间尺度仍是需通过用户研究验证的可逆产品判断。

## Design document map

- [轻量产品定义](design/product-definition.md)：产品承诺、范围、停止规则、成功与失败。
- [短波次旅程与交互](design/journey-and-interaction.md)：首次使用、上传、问题、即时理解、三路、试验、聊天和所有恢复状态。
- [视觉与动效方向](design/visual-art-direction.md)：Soft Editorial Neo-Brutalism 艺术方向、消息栈签名、响应式构图、token、动效和无障碍。
- [双 Agent 自适应访谈](design/adaptive-interview-system.md)：Interviewer/Sensemaker 边界、调用流、未知排序、停止、上下文和回退。
- [理解与计划契约](design/insight-plan-contracts.md)：WorkingMemory、问题、洞察、校准、三年计划、三天试验和聊天 schema。
- [平台与素材](design/platform-and-assets.md)：Next.js 技术栈、组件边界、guest 状态、UI 库选择、性能与素材许可。
- [验收与研究](design/acceptance-and-research.md)：fixtures、P0/P1 验收、真实 LLM、E2E、可用性研究和决策规则。

## Professional capability map

- [Product design](capabilities/product-design.md)：压缩价值闭环，防止旧系统复杂度回流。
- [UI/UX design](capabilities/ui-ux-design.md)：低负担作答、纠错可见、恢复、上传、计划比较和无障碍。
- [Visual art direction](capabilities/visual-art-direction.md)：柔和编辑新粗野主义语言与成熟度判断。
- [Game design](capabilities/game-design.md)：以进展和反馈提供轻游戏感，拒绝操纵脆弱性的奖励机制。
- [Conversational AI design](capabilities/conversational-ai.md)：暂定洞察、证据边界、纠正传播和有界对话。
- [Life design methodology](capabilities/life-design.md)：奥德赛计划的诚实改编、路线发散和原型学习。
- [Privacy and AI safety](capabilities/privacy-ai-safety.md)：敏感上传、第三方模型披露、删除导出、日志与危机边界。

这些字段保持独立。视觉不能替产品决定心理含义，AI 不能替人生设计选择路线，游戏设计不能用敏感披露制造留存，安全也不能伪装成人工危机服务。

## Completion and failure

首个 MVP 只有在以下证据同时成立时才算完成：

- fixture 与真实 LLM 测试证明首波模板 + 至少一个自适应波可生成三条有证据、差异真实的路线；
- 每波洞察有有效来源，用户纠正会撤回错误理解并改变后续焦点；
- 360px 手机可完成上传/跳过、两波、洞察校准、三路比较和三天试验；
- 三路没有推荐字段或视觉冠军，试验没有不可逆或高成本动作；
- guest 数据按 24 小时策略清理，删除上传会使派生理解失效或重算；
- 键盘、读屏、200% zoom、reduced motion 和网络失败下主路径可恢复；
- 真实用户能在首屏 5 秒内理解“答几题、获得理解、看到三种可试运行人生”，且不会把产品认成心理测评、企业 dashboard、儿童游戏、通用 AI 聊天、AI 紫色模板或吵闹多彩的通用新粗野主义页面。

看起来完成但实际失败的情况包括：三条路线只是换标题；即时理解是没有依据的彩虹屁；上传内容可注入 prompt；动效比内容更抢眼；用户必须注册后才看到价值；删除后仍引用原材料；系统为了准确恢复完整 PersonaSnapshot/CoverageCell 复杂度。

## Work map

实现按垂直切片推进，详见 [tasks.json](tasks.json)。第一项先做真实内容驱动的视觉交互原型，验证产品签名和移动端流程，再投入后端、Agent、上传与账户基础设施。任务必须读取其声明的设计文档和能力卷宗，不从聊天记忆猜测。
