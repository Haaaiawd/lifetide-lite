# 视觉艺术指导

## Field identity and boundary

本领域负责“人生试运行”的审美立场、字体角色、色彩、表面、边框、阴影、图形语汇、动效气质与品牌一致性。它回答“这个产品看起来和感觉起来是什么”，不决定访谈问题、Agent 推断、隐私政策、人生路线或游戏奖励规则。

## Project decisions this field changes

- 如何把参考图中的新粗野主义转化为可以连续使用 10-20 分钟、不会让人疲劳的移动产品界面。
- 如何使用现成 UI registry 获得一致组件，同时避免成品像组件展示站。
- 即时理解纸条、问题页、材料上传、三路线封面和三天试运行如何共享同一种视觉语法。
- 钴蓝、绿色、墨色和纸色分别承担哪些语义，避免颜色暗示路线优劣。
- 哪些旧 Lifetide 素材可以合法地作为次要点缀，哪些必须排除。

## Project-specific diagnosis

用户给出的参考不是单纯的“粗边框 UI”，而是**编辑型新粗野主义**：纸张网格、明确墨线、硬偏移阴影、方形控件、杂志式大标题，以及看得见的物理按压感。它的吸引力来自清楚、有态度和可触摸，不来自高饱和颜色堆叠。

纯粹 loud neo-brutalism 对短 landing page 有冲击力，但在长访谈中会因为 4px 以上边框、8px 以上阴影、每块都着色而造成疲劳。项目因此采用 **Soft Editorial Neo-Brutalism／柔化的编辑型新粗野主义**：2px 墨线、3-4px 硬阴影、0-4px 角、暖白方格纸和一个主导钴蓝。绿色只表示保存/上传成功，不作为第二品牌色。

产品最值得拥有的视觉签名不是海图，而是**逐张出现的印刷对话纸条**。用户回答一波后，系统理解像一组可批注的小型刊物页面被依次摆出；依据、不确定和纠正入口必须与大号洞察同屏可见，避免视觉权威感压过可纠正性。

## Principles, evidence, and sources

- 用户参考图证明期望的是 neo-brutalist / editorial brutalist 家族，而不是此前的深色数字潮汐方案。
- `neobrutalism.com` / RetroUI 当前提供 shadcn registry、Tailwind v4 token、Radix/Base UI 变体与完整组件集合，适合作为可访问的本地源码起点。
- `neobrutalism.dev`（ekmas）提供 MIT、shadcn-based 的成熟次要参考，但不能与主 registry 混装为两套 token/API。
- BRUT/UI 的 Soft/Solid/Loud 思路有助于控制强度，但采用度和成熟度不足以成为 MVP 基线。
- Memphis、Bauhaus、Y2K、claymorphism、glassmorphism 和纯 Swiss minimalism 均被比较：它们分别偏装饰/幼态、规则僵硬、易过时、过软、可读性不稳或缺少触感，不作为产品 foundation。
- 原 Lifetide registry 已确认 `water.png`、`boat.png`、`landmark.png` 为 CC0；天空图缺少跨项目发布权记录，`pixel-frame.png` 标记为 UNLICENSED。

## Distinctive stance and rejected defaults

- 采用暖白纸面、墨黑、单一钴蓝和静态浅方格；不用 AI 紫渐变、玻璃、发光或大面积深色海洋。
- 大号中文编辑衬线只承载首页主张、即时理解和路线核心陈述；操作、证据、表单和长文使用清晰无衬线。
- 每屏最多一个主要硬阴影表面。非交互正文通过排版、留白和 1px 分隔组织，不把所有内容装进粗框卡片。
- 即时理解使用 printed dialogue slips，不使用圆形聊天气泡、打字机、思考光球或庆祝彩屑。
- 三路线使用同尺寸、同结构、同按钮权重。差异来自构图和钴蓝纹样，不用绿/黄/红、皇冠、默认选中或尺寸表达优劣。
- 允许少量错位、编号和按压反馈，拒绝随机旋转、贴纸轰炸、满屏几何和高饱和多强调色。
- 旧像素水、船、地标即使复用，也只可低频、单色化、可删除；它们不再构成品牌世界。

## Consequences for design, implementation, and verification

- `visual-art-direction.md` 固定 paper/ink/cobalt token、2px 边框、3-4px 阴影、0-4px radius、方格规格和字体角色。
- `platform-and-assets.md` 以 `neobrutalism.com/r/radix/{name}.json` 为唯一主 registry；每个组件先 view、审计，再逐个 add，并记录来源、版本、许可证和本地修改。
- MVP 不安装 React Bits、Magic UI、Aceternity、Rive、Phaser、Three.js 或第二套组件系统。Motion 只用于纸条顺序显露、状态反馈和有限 layout transition。
- 背景方格使用静态 CSS，不做动画，不承担测量、进度或人格坐标含义。
- 高对比和 forced-colors 模式隐藏无语义方格与硬阴影，保留边框、焦点和内容层级。
- 视觉回归至少覆盖 360×800、390×844、768×1024、1440×900，并在真实手机上连续走完两波检查疲劳。

## Questions that could change the stance

- 哪一种可商用、可 Web 嵌入和可子集化的中文编辑衬线能在真实首屏性能预算内成立，仍需实现阶段候选对比。
- 钴蓝相对绿色是否更受目标用户欢迎，可在同结构 style-frame 中做盲测；只有主强调色可替换，纸/墨/结构规则不随实验漂移。

## Failure modes and proof signals

**失败模式：** 像通用彩色新粗野组件站；边框和阴影压过内容；大字像广告而不是理解；方格像工程后台或人格测量；路线颜色形成隐性排名；中文字体加载造成闪烁和布局跳变；移动端卡片套卡片、软键盘遮挡操作；为了“年轻”变成儿童贴纸风。

**验证信号：** 用户用“现代、清楚、有编辑感、可触摸、不严肃但不幼稚”描述界面；完成两波后仍关注内容而不是边框；即时理解的依据和纠正入口无需寻找；三路线没有位置或颜色推荐偏差；reduced-motion、200% zoom 和 forced-colors 保留完整层级；构建中没有 blocked 素材或未登记组件源码。

## Relationships without merger

- [UI/UX design](./ui-ux-design.md) 对阅读负担、触控、错误恢复和状态辨识拥有最终可用性约束；本领域提供表现系统。
- [Game design](./game-design.md) 决定何时反馈和反馈是否操纵；本领域决定按压、纸条显露和试运行页面的视觉强度。
- [Product design](./product-design.md) 决定“即时理解”和“三条人生”的产品承诺；本领域不能为了画面增加功能。
- [Conversational AI](./conversational-ai.md) 决定洞察的暂定性与证据边界；本领域必须让这些边界与洞察正文同等可见。
- [Privacy and AI safety](./privacy-ai-safety.md) 限制敏感内容、上传状态、危机信息和资产来源的呈现。
