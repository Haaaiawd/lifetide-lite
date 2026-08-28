# 人生试运行

这是从 Lifetide 抽离出的轻量独立产品工作区。

用户完成若干个 3-5 题的短波次，每波结束立即看到一条带依据、可纠正的理解。理解足够后，系统生成三条地位平等的三年平行人生，并让用户选择其中一条进行三天可逆试验。简历、MBTI 和其他材料仍可上传，但全部可选，只作为追问线索。

## 产品压缩

保留：

- 首波模板题和后续自适应波次；
- Interviewer + Sensemaker 双 Agent；
- 每波即时理解与用户校准；
- 可选简历、MBTI 和文本材料；
- 三条三年平行人生；
- 三天可逆试验；
- 围绕计划的有边界对话；
- 年轻、现代、克制且可触摸的 Soft Editorial Neo-Brutalism 视觉，以即时理解消息栈作为视觉签名。

移除：

- 用户可见的人格画像和六层模型；
- CoverageCell、PersonaSnapshot 和复杂假设图运行时；
- 强制游戏场景和 Phaser 游戏容器；
- 长问卷、人格分数、路线排名；
- 一开始就要求注册。

## 文档入口

LOOM 负责项目连续性与可施工文档：

- [项目全貌与文档地图](.loom/PROJECT.md)
- [产品定义](.loom/design/product-definition.md)
- [端到端旅程与交互](.loom/design/journey-and-interaction.md)
- [视觉与动效方向](.loom/design/visual-art-direction.md)
- [双 Agent 自适应访谈](.loom/design/adaptive-interview-system.md)
- [理解、计划与聊天契约](.loom/design/insight-plan-contracts.md)
- [Next.js 平台、UI 技术栈与素材](.loom/design/platform-and-assets.md)
- [验收与用户研究](.loom/design/acceptance-and-research.md)

## 当前技术方向

- Next.js + TypeScript
- Tailwind CSS v4
- neobrutalism.com／RetroUI 的 Radix registry（主要组件来源）
- neobrutalism.dev（次要实现参考）
- Motion (`motion/react`)
- Phosphor Icons

视觉方向为 **Soft Editorial Neo-Brutalism**：off-white 细密浅方格纸、ink 墨色、主导 cobalt 强调色、仅用于成功/可继续等语义状态的绿色、2px 边框、3–4px 硬偏移阴影、0–4px 圆角和克制的移动端密度；关键陈述使用编辑感中文衬线体，UI 使用清晰无衬线体。它明确拒绝 dashboard、儿童风、AI 紫色模板，以及高饱和、大色块、多强调色堆叠的通用吵闹新粗野主义。MVP 不使用 React Bits、Magic UI、Aceternity、Rive、Phaser 或 Three.js。组件 registry 提供可访问的结构原语，不能替代品牌判断。

## 素材复用边界

原 Lifetide 中 registry 证明为 CC0 的 `water.png`、`boat.png`、`landmark.png` 可在复制许可证快照和 checksum 后作为次要、可替换点缀。

用户提供但缺少跨项目授权记录的 sky 图片，以及 `UNLICENSED` 的 `pixel-frame.png`，不进入本产品 MVP。
