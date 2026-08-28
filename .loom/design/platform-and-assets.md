# 人生试运行：Next.js 平台、组件 registry 与素材治理

- Kind: system
- Status: shaped
- Product: 人生试运行

## Responsibility in the whole

本文定义人生试运行 MVP 的前端平台、组件来源、安装政策、动效边界、guest-first 状态、上传、性能、无障碍与素材权利。目标是支撑一个移动优先、可链接分发、桌面可扩展的 10–20 分钟访谈体验，并准确实现 **Soft Editorial Neo-Brutalism／柔化的编辑型新粗野主义**。

技术基线：

- Next.js + React + TypeScript strict；
- Tailwind CSS v4，品牌 token 由 CSS variables 驱动；
- `neobrutalism.com` 当前开源 shadcn registry 的 **Radix** 变体作为主要组件源码；
- Motion (`motion/react`) 仅用于克制的顺序显露、状态和 layout transition；
- Phosphor Icons，统一 regular／medium 线性家族。

组件 registry 提供的是可访问结构和本地可修改源码，不替代信息架构与品牌判断。MVP 不安装效果库，不引入游戏引擎、3D／WebGL、动画资产 runtime 或全套模板。

## Inputs, outputs, and boundaries

### Inputs

- 问题、答案草稿、波次进度、上传／扫描／解析状态；
- 即时理解 claim、来源摘要、不确定边界与用户校准；
- 三条地位平等的三年路线和三天试验；
- guest 会话、恢复位置、网络与异步状态；
- 系统和用户的 reduced-motion、高对比与字号偏好；
- 已核权、登记并校验的本地素材。

### Outputs

- 服务器优先渲染的 landing 与稳定页面壳层；
- 键盘、读屏和触控均可完成的问题、上传、校准、路线浏览与试验；
- 逐张加入文档流的 printed dialogue slips；
- 只在必要 client island 内运行的 Motion；
- 即使字体、背景、图片或动画失败也完整可用的语义界面；
- 可审计的组件来源、版本、本地修改和资产 provenance。

### Hard boundaries

- 不在 UI 暴露 persona dashboard、覆盖率、置信度仪表、人格评分或内部工作记忆字段。
- 不复制 registry 的整页模板、营销 blocks、dashboard blocks 或默认主题作为成品。
- 不使用 generic shadcn 组件加效果库拼装品牌；选定 registry 的 Radix 源码是统一起点。
- MVP 不使用 React Bits、Magic UI、Aceternity、Rive、Phaser、Three.js 或任何 effect library。
- 装饰层不驱动业务状态；关闭 JavaScript 增强、Motion 或图片时，内容仍可读且主流程有恢复路径。
- 外部素材不得成为 Logo、商标或不可替换的品牌核心。

## Route and rendering shape

建议按体验而不是后台模块拆分：

```text
app/
  page.tsx                    # editorial landing, Server Component
  play/page.tsx               # 当前波次壳层
  play/insights/page.tsx      # printed dialogue slip stack
  routes/page.tsx             # three-route comparison
  routes/[routeId]/page.tsx   # route statement + three-day trial
  settings/accessibility/...  # 用户覆盖项
components/
  interview/                  # QuestionFrame, ChoiceCard, Scale, ShortAnswer
  insight/                    # InsightSlip, EvidenceDisclosure, CalibrationRow
  routes/                     # RouteCarousel, RouteCover, TrialSheet
  upload/                     # UploadDropzone, FileRow, ParseStatus
  editorial/                  # GraphPaper, SectionRule, Statement, NumberMark
  ui/                         # 已审计并定制的 registry 源码
```

这只是实现边界，不要求现在创建目录。默认使用 Server Components；只有表单草稿、文件选择与上传、carousel 控制、显示偏好和 Motion 边界使用 client component。禁止根级 `"use client"` 把整站变成客户端应用。

### Control flow

1. Server Component 根据 opaque HttpOnly guest token 获取会话／波次快照并输出语义壳层。
2. client question component 保存未提交草稿；本地校验后发送幂等请求。
3. 提交期间保留旧问题与输入，成功响应再显示下一题或波后理解，避免白屏和布局跳变。
4. `InsightSlip` 按服务端已验证顺序加入文档流；校准写入 server state，不是动画反馈事件。
5. 生成完成后进入三路线比较；carousel index 只是 view state，不能承载推荐语义。
6. 视觉状态从业务状态单向派生。动画结束、取消或失败都不能触发提交、确认或路线选择。

## Component source decision

### Library comparison

| Candidate | Current evidence | Fit | Decision |
| --- | --- | --- | --- |
| `neobrutalism.com` registry | 当前 shadcn CLI-compatible、open-source／open-code registry；Tailwind v4 tokens；研究盘点为 57+ components，并覆盖 Base UI、Radix 与 React Aria 变体方向；当前官方安装页明确给出 Base UI 与 Radix URL | 源码进入仓库，可逐个定制；现成边框、硬阴影和状态结构最接近目标，Radix 路径与既定 React 结构匹配 | **主要来源；MVP 只用 Radix 路径** |
| `neobrutalism.dev`（ekmas） | MIT、shadcn-based、可复制源码 | 可作为实现和状态处理的交叉参考，但不应形成第二套 token 或组件 API | **次要参考；不直接混装** |
| BRUT/UI | 提供 Soft／Solid／Loud 强度思路 | 强度旋钮有助于评审“是否太吵”，但组件覆盖、采用度和成熟度不足以承担 MVP 基线 | **概念参考，不安装** |
| generic shadcn + effects | 结构通用，但需要额外效果源码制造表面差异 | 容易得到不一致的 AI landing 拼装，增加许可、bundle、reduced-motion 和维护面 | **拒绝** |

当前官方安装页明确提供 Base UI 与 Radix URL；若未来 React Aria 变体在同一 registry 稳定发布，也不得在 MVP 中混用。一个应用只保留一套 primitive 行为模型，避免 focus、portal、event 与类型接口分裂。

邻近的装饰性复古、多原色几何、未来怀旧、黏土体积、透明玻璃和纯网格极简方案均不作为 foundation。可借鉴其局部构图，但不能引入第二套材质或 token。

### Why Radix

- 已确认产品基线选择 Radix，且 registry 为其提供稳定的独立 URL 命名空间；
- Dialog、Alert Dialog、Radio Group、Checkbox、Progress、Collapsible、Tooltip 等行为原语足以覆盖主流程；
- 源码所有权允许修正中文密度、2px 墨线、3–4px 硬阴影、0–4px 圆角和 focus ring；
- 不需要为了视觉风格安装另一套 runtime 包或 effect package。

此选择不授权提前安装所有 Radix primitives。每个组件仍按实际任务逐项引入，并检查 registry JSON 声明的 dependencies。

## Exact registry and install policy

### Registry namespace

若项目已有 `components.json`，只允许加入以下主要别名；不配置 Base UI 别名，以减少误装：

```json
{
  "registries": {
    "@neobrutalism": "https://neobrutalism.com/r/radix/{name}.json"
  }
}
```

完整 URL 是规范来源：

```text
https://neobrutalism.com/r/radix/<component>.json
```

例如 Button 的预览与安装命令为：

```bash
npx shadcn@latest view https://neobrutalism.com/r/radix/button.json
npx shadcn@latest add https://neobrutalism.com/r/radix/button.json
```

本文记录命令，但**不授权现在运行**。实现任务开始后遵循以下顺序：

1. 确认仓库实际 package manager、Next.js／React／Tailwind 版本和已有 `components.json`；不得默认使用 npm 或重跑 `shadcn init`。
2. 打开目标组件文档和 registry JSON，记录访问日期、URL、上游 commit／release、license、files 与 dependencies。
3. 先执行对应 package manager 的 `shadcn view`，审查依赖、文件覆盖、client boundary、Radix import、样式与可访问行为。
4. 仅在当前垂直切片需要时执行 `shadcn add`；一次一个组件，不安装全套 components、blocks、templates、MCP 或 Pro 内容。
5. CLI 提示覆盖现有文件时默认拒绝；先 diff，再人工合并。禁止用 registry 更新覆盖本地品牌与无障碍修正。
6. 安装后立即映射项目 token、中文文案密度、focus、loading、disabled、error、RTL／长文案和 reduced-motion；删除无用 variants 与 demo code。
7. 将 origin URL、检索日期、版本／commit、许可证和本地改动记录到组件 provenance；copy-paste 代码同样算第三方来源。
8. 运行 typecheck、lint、相关组件测试、键盘检查和 production build；评估 lockfile 与 bundle diff 后才提交。

版本治理：

- 生产变更中不得使用未经审查的浮动远端内容。`@latest` 仅用于人工执行 CLI；PR 必须保存所取 registry JSON 或可复现版本证据，并审查生成源码 diff。
- registry 组件进入 `components/ui/` 后成为本地维护源码，不做自动同步。
- 若 registry 组件新增 runtime dependency，先评估需求、许可证、维护、SSR/RSC、bundle、reduced-motion 与卸载路径；不能因 CLI 自动提出就接受。
- 当前文档不新增任何 dependency。实际安装必须属于后续明确的实现任务。

### Initial primitive allowlist

只在业务需要时从以下范围取用：

- Button、Label、Input、Textarea；
- Checkbox、Radio Group、Slider；
- Dialog／Alert Dialog、Drawer 或 Sheet（二选一满足同一场景，不重复）；
- Progress、Collapsible、Tooltip；
- Skeleton 或静态占位（二选一，loading 不使用连续 shimmer）；
- Toast／Sonner 仅作补充通知，错误与上传状态必须留在页面内。

不直接采用 registry Carousel：三路线优先原生 horizontal overflow + CSS scroll-snap + 明确按钮与键盘控制。只有经测试证明原生方案无法满足可访问性和惯性需求时才单独评估。

## Token adaptation

registry 默认字体、配色与大阴影只作为源码起点，不进入成品。Tailwind v4 使用语义 CSS variables：

```css
@theme inline {
  --color-background: var(--paper);
  --color-card: var(--paper-raised);
  --color-foreground: var(--ink);
  --color-primary: var(--cobalt);
  --color-success: var(--success);
  --color-destructive: var(--danger);
  --color-border: var(--ink);
  --radius-sm: 2px;
  --radius-md: 4px;
  --shadow-sm: 3px 3px 0 var(--ink);
  --shadow-md: 4px 4px 0 var(--ink);
}
```

要求：

- 不复制 registry 的默认黄色／多色主题、Archivo Black 或 Space Grotesk 作为品牌字体；
- 中文 major statement 使用经权利与性能验证的编辑衬线，UI 使用中性无衬线；
- 不把十六进制散落在 JSX，不建立第二套 `blue-500` 品牌映射；
- 默认边框 2px、硬阴影 3–4px、圆角 0–4px；避免上游更响亮的 6–16px 阴影；
- 绿色只映射 semantic success，不用于 CTA、路线区分或装饰。

## Motion policy

Motion 继续保留，但职责极窄：

- printed dialogue slips 的顺序加入；
- 问题切换、校准展开与错误恢复；
- 路线封面到详情的有限 layout continuity。

约束：

- 微交互 120–180ms，内容切换 180–280ms，页面 layout 最多 360ms；
- 默认 opacity + 8–12px 位移，无弹跳、视差、持续漂浮或自动轮播；
- 全局 `MotionConfig reducedMotion="user"`，业务层仍处理 CSS animation、scroll behavior 和任何自动变化；
- reduced motion 下取消 transform／layout，使用即时状态或 100–140ms opacity；
- 动画不能包裹提交逻辑，exit unmount 不能丢草稿；
- 不为任何效果增加新库。CSS 能完成的按压、focus、网格和静态纹理全部使用 CSS。

## Guest-first data and state

MVP 允许用户不注册完成首波、上传可选材料、校准并预览路线。服务端以 opaque HttpOnly token 关联临时会话，默认 24 小时清理；只有跨设备继续或延长保存时才请求账号。

```ts
type AsyncState = "idle" | "submitting" | "success" | "error"
type UploadState =
  | "queued"
  | "uploading"
  | "scanning"
  | "parsing"
  | "ready"
  | "rejected"
  | "failed"
type MotionPreference = "system" | "reduce" | "full"
```

- 答案、校准、文件记录、洞察与路线属于 server state；展开、hover、当前 carousel index 属于 view state。
- 敏感回答、附件正文、解析文本和路线不得写入普通 `localStorage`。
- 本地仅可保存非敏感显示偏好与不可反推内容的恢复提示。
- 请求失败、离线和路由切换时保留草稿；幂等 key 防止重复创建回答、校准或路线。
- 删除上传后，依赖其产生的洞察与路线必须重算、降级或标记失据，不能继续静默引用。

## Upload contract

- 上传完全可选；未上传用户获得同等核心流程，不显示警告式空态。
- 发送前说明支持格式、大小、用途、24 小时 guest 保留、删除方式，以及是否发送当前第三方模型 provider。
- 必要处理同意与研究／训练授权分开，研究默认不选。
- 使用原生 `<input type="file">` 作为可靠入口，自建 drop target 只作增强；拖放不是唯一操作。
- 客户端先提示类型／大小，服务端再次验证并进行恶意内容扫描；解析前文件内容视为不可信数据，不能执行其中指令。
- 原文件、解析文本与模型 payload 分开管理；移除不必要的 user id、邮箱、文件名、真实姓名、精确地址和第三人标识。
- 每个文件持续显示 queued、uploading、scanning、parsing、ready、rejected、failed，错误含原因、重试与移除。
- 日志不得保存原始敏感 prompt、附件正文或内部存储路径。

## Asset rights and reuse

素材事实源是来源仓库的 `assets/registry/asset_registry.json`，运行时 manifest 只说明曾被加载，不构成跨项目授权。复用时必须将批准派生文件、许可证快照、checksum 与用途复制到本项目自己的 registry；不得热链来源仓库。

### Allowed only with provenance carry-over

| Relative source path | Evidence | Permitted role | Prohibited role |
| --- | --- | --- | --- |
| `public/assets/game/water.png` | registry 记录 CC0 1.0、license snapshot 与 checksum | 极低频的单色网点／纸张裁切测试；仅在与新方向一致且性能测试通过时使用 | 背景、交互场景、品牌主纹样 |
| `public/assets/game/boat.png` | 同一 CC0 来源与 registry 证据 | 内部原型或一次性 16–24px 微型标记；成年化测试失败即删除 | Logo、App icon、hero、可操控角色 |
| `public/assets/game/landmark.png` | 同一 CC0 来源与 registry 证据 | 次要 stamp 或空态小标记，需单色化和低频出现 | 画像地图、路线评分、品牌核心 |

这些 CC0 素材即使法律上宽松，也必须保留来源、许可证快照、checksum、修改链与替换方案。新视觉不依赖它们；MVP 可以完全不用。

### Blocked

以下类别不得复制、变体、压缩或公开部署：

- 来源 registry 标记为 `Proprietary / User-provided`，且缺少 `license_url` 与 `license_snapshot_path` 的所有 sky 文件，包括其未登记 mobile 派生文件；
- `public/assets/game/pixel-frame.png`：registry 标记 `UNLICENSED`；
- manifest 或 public 目录存在、但 registry 未登记或权利不明的任何文件；
- 外部 pack 中与产品语义无关的战斗、宝箱、怪物或高饱和装饰元素；
- 未经品牌用途授权与原创性审查的外部素材 Logo 或营销主视觉。

只有权利人书面确认本独立产品的商业／公开使用、修改、营销传播与再部署范围，并补齐来源、license snapshot、checksum 和用途，才可重新评估 blocked 素材。

### New asset policy

MVP 优先使用 CSS／SVG：方格纸背景、结构线、编号、切角、钴蓝网点与简单 stamp。它们必须静态可降级、不可承载业务语义。

若未来委托字体、插画或图形，合同需覆盖：源文件、商业使用、修改、营销传播、品牌用途、地域／期限、AI 使用披露、第三方训练数据声明和替换权。生成式样张只能进入内部 mood board；未经来源和商用审查不得进入 production。

## Font policy

- 主要洞察与路线陈述需要中文编辑衬线，但当前不在本文指定未经验证的具体字体包。
- 候选必须核验 Web embedding、商业使用、subset／修改权限、中文字形覆盖和 CDN 条款；保存许可证快照与版本。
- 字体最多一个中文编辑衬线角色和一个 UI 无衬线角色；优先系统无衬线，避免重复下载。
- 中文 Web 字体按实际文案做受许可的 subset 或采用性能经过真机验证的策略；`font-display: swap`，fallback 尺寸需控制 CLS。
- 字体失败不能破坏层级：CSS stack 必须分别保留 serif statement 与 sans UI 的角色差异。

## Performance budget

- LCP ≤ 2.5s、CLS ≤ 0.1、INP ≤ 200ms，以真实移动网络 p75 为目标。
- 首路由产品 JS gzip 预算尽量 ≤ 170KB；Server Components 优先，Motion 和上传逻辑只进入需要的 client chunk。
- 首屏品牌图片合计 ≤ 250KB；优先无图片的 CSS 方格与排版。若使用图片，固定尺寸、正确 `sizes`、AVIF／WebP。
- 不使用 autoplay video、全屏 blur、动画噪声、多重滤镜、大面积渐变或持续环境动画。
- registry 组件逐个 tree-shake；Phosphor 图标逐个 import，不从 barrel 引入整套。
- 中文字体不得以数 MB 阻塞首屏；以真实低端 Android 和 4G throttling 验证，不以桌面 60fps 替代。
- 任何装饰或依赖导致预算明显上涨，默认删除或延迟，而不是提高预算。

## Accessibility contract

- 语义 HTML 先行：题组使用 `fieldset/legend`，字段错误用 `aria-describedby`，异步洞察用克制 live region。
- 所有动作键盘可达，focus 顺序与 DOM／视觉顺序一致；纸条进入不抢焦点。
- Dialog／Drawer 打开后正确聚焦，关闭后归还触发器；避免 nested interactive controls。
- 触控目标至少 44 × 44 CSS px；支持 200% zoom、系统字号与 viewport 缩放。
- 选择、上传、成功、错误与路线差异都有文字／图形冗余；绿色只用于成功且从不单独表达状态。
- carousel 有上一张／下一张、路线名称、位置文本和非拖拽入口。
- focus-visible 在纸色与钴蓝表面都达到至少 3:1，不能被 2px 边框或 overflow 裁切。
- forced colors 下隐藏无语义方格与硬阴影，保留边框、焦点、层级和状态。
- WCAG AA 是最低线；视觉方向不能豁免暖灰小字、长访谈疲劳或动态内容控制。

## Failure, safety, and recovery

- **JavaScript 迟到／失败**：landing 与当前内容可读；客户端接管前不显示假可点击控件。表单提供服务端提交兜底或明确恢复路径。
- **请求失败**：保留草稿和焦点；字段／动作旁显示 error，toast 仅补充；重试幂等。
- **Motion 失败**：纸条和页面直接显示最终状态，不能卡在 `opacity: 0`。
- **上传失败**：逐文件恢复，扫描／解析未完成时不展示内容摘要，不在错误中泄露文件内容或存储路径。
- **素材权利不清**：build 或发布审查阻止 unknown／blocked asset，不能上线后补证。
- **低性能／省电**：关闭非必要 transform、背景网格增强和图片，保留纸／墨／钴蓝静态界面。
- **敏感情境**：停止普通规划动画，以稳定版式呈现经审核边界和资源；不庆祝危机披露，不承诺实时监控或人工回访。

## Dependency governance

- 不为 CSS／SVG 能完成的效果新增包。
- 引入前记录需求、替代方案、bundle、许可证、维护活跃度、SSR/RSC、React 兼容、reduced-motion 和卸载路径。
- registry 与 copy-paste 源码同样是第三方代码，必须记录 origin、版本／commit、license 和本地修改。
- 组件更新通过人工 diff，不自动覆盖；Radix、Base UI 和 React Aria 变体不得混用。
- `motion/react` 只沿用已批准能力，不引入第二动画库。
- lockfile 中不得出现效果库、游戏引擎、3D／WebGL 或动画资产 runtime 的新增依赖。
- 本文是架构政策，不授权执行安装命令或修改 dependency manifest。

## Verification strategy

1. **Registry provenance**：每个 `components/ui` 文件可追溯到 Radix registry URL、检索日期、版本／commit、license 和本地 diff；无 Base UI／React Aria 混入。
2. **Dependency audit**：lockfile 无禁用库；每次组件引入均有 bundle 与 transitive dependency diff。
3. **Visual regression**：360×800、390×844、768×1024、1440×900，覆盖 landing、题型、上传全状态、纸条栈、三路线与试验。
4. **Brand conformance**：纸／墨／单一钴蓝、2px 边框、3–4px 硬阴影、0–4px 圆角；成功以外不出现绿色品牌使用。
5. **Keyboard and screen reader**：无鼠标完成一波、校准、上传移除和三路线切换；至少 VoiceOver+iOS Safari 与 NVDA/Windows Chromium。
6. **Motion matrix**：系统 full、系统 reduce、手动 reduce；无自动漂浮／轮播／视差，关闭 Motion 后无隐藏内容。
7. **Performance**：低端 Android 与 4G throttling，记录 p75 Web Vitals；禁用图片、字体与 JavaScript 增强后验证恢复。
8. **Asset audit**：构建产物中每个视觉文件均有 registry、checksum、license snapshot 与用途；blocked 文件零引用。
9. **Upload and guest lifecycle**：无上传可完成；24 小时 guest 清理可验证；第三方模型同意发生在发送前；删除会处理派生内容。
10. **Content resilience**：长中文、英文、无证据、3 个 evidence items、长文件名、失败重试与路线标题换行不溢出。
11. **Acceptance signal**：真实用户 5 秒内理解短波次→即时理解→三条试玩路线，并在 10–20 分钟内认为界面现代、清楚、有触感而不吵闹。

## Evidence opened

- neobrutalism.com Installation：registry 无单独组件包，shadcn CLI 复制源码；Radix URL 为 `https://neobrutalism.com/r/radix/<component>.json`；提供 Tailwind v4 token 与 namespace 配置：<https://neobrutalism.com/docs/installation>。
- neobrutalism.com Components：研究盘点为 57+ components，并覆盖 Base UI、Radix 与 React Aria 变体方向；实现前以 registry `list` 和目标组件页重新确认：<https://neobrutalism.com/components>。
- neobrutalism.dev：MIT、shadcn-based 次要参考；不与主要 registry 混装：<https://neobrutalism.dev/>。
- Motion React 与 accessibility：`MotionConfig reducedMotion="user"` 与 `useReducedMotion`：<https://motion.dev/docs/react>、<https://motion.dev/docs/react-accessibility>。

以上是当前研究快照。实现前锁定实际检索日期、上游版本／commit 与仓库许可证；网页摘要不能替代随代码保存的许可证证据。

## Related documents and capabilities

- `.loom/design/visual-art-direction.md`：token、排版、printed dialogue slips、响应式和动效语法。
- `.loom/design/journey-and-interaction.md`：guest、上传、即时理解、三路线与恢复状态。
- `.loom/design/adaptive-interview-system.md`、`.loom/design/insight-plan-contracts.md`：server state 和数据合同。
- `.loom/DECISIONS.md`：D-001、D-002、D-003、D-005、D-006、D-007、D-008。
- `.loom/capabilities/ui-ux-design.md`、`.loom/capabilities/privacy-ai-safety.md`、`.loom/capabilities/visual-art-direction.md`：可用性、数据与权利、视觉一致性边界。
