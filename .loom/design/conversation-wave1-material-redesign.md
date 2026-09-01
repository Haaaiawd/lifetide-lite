# /play 对话式卡片流 + Wave 1 + 补充材料设计

## 背景

`/play` 当前的体验把题目卡放在一个固定在底部的 composer 里，聊天记录在上方，造成“题目不是对话一部分”的感觉。同时 Wave 1 只有 4 道硬编码问题，缺少基础信息采集、MBTI 收集和补充材料入口。

本设计把 `/play` 改为统一的“对话卡片流”：每张题卡 / 即时理解卡 / 补充材料卡都是聊天流里的一张卡，当前卡在最底部以大卡形式出现，答完缩小成历史小卡，新卡从底部滑出。同时延长 Wave 1 并加入 MBTI，在 Wave 1 和 Wave 2 之间插入一个可选的补充材料卡。

## 1. 交互动效

### 1.1 核心体验

- 所有内容在一根垂直滚动轴上。
- 当前大卡在最底部；上方是已回答的小卡 / 系统消息。
- 用户向上滑动翻看历史，就像看微信/Slack 记录；向下滑回到当前大卡。
- 答完/确认后：
  - 当前大卡向上收起并缩小成历史小卡；
  - 下一张大卡从底部滑入。

### 1.2 实现方案

- **滚动**：使用原生滚动 + CSS `scroll-snap-type: y proximity`，每张大卡设置 `scroll-snap-align: start`。这样向上滑有阻尼和吸附感，性能最好。
- **新卡入场**：使用 `framer-motion` 做 `y: 80 -> 0` 的滑入动画，但只用于**最新的一张大卡**；历史卡片不再重动画，避免性能爆炸。
- **大卡缩小**：不依赖 `framer-motion layoutId`（形状差异大），采用 `AnimatePresence`：
  - 退出：大卡向上淡出并收缩；
  - 进入：同位置插入历史小卡。
- 小卡样式：显示题目原文（截断到 2 行）+ 用户选择/输入摘要。

### 1.3 边界规则

- 即时理解（insight）大卡完成后，缩小成一条“理解摘要”小卡：显示 “WAVE X 理解 + 用户校准结果（准确/部分准确/不准确）”。
- 补充材料大卡完成后，缩小成“已补充材料”小卡：显示文件名或“粘贴了 X 字”。
- 历史卡片只读，不支持点开放大修改；修改通过即时理解校准完成。
- 首屏加载时直接滚动到底部，让当前大卡可见。

## 2. 统一消息 / 卡片模型

`ConversationItem` 类型（替换现有 `ChatItem`）：

```ts
type ConversationItem =
  | { id: string; type: "bot"; text: string }
  | { id: string; type: "user"; text: string }
  | {
      id: string;
      type: "question";
      question: InterviewQuestion;
      answer?: { value?: string | string[] | number; skipped: boolean };
      isActive: boolean;
    }
  | {
      id: string;
      type: "insight";
      insight: InsightView;
      feedback?: { accuracy: string; note: string };
      isActive: boolean;
    }
  | {
      id: string;
      type: "material";
      uploadIds?: string[];
      pastedText?: string;
      isActive: boolean;
    };
```

渲染规则：

- `bot` / `user` 保持气泡样式。
- `question` 且 `isActive`：渲染完整 `QuestionFrame` 大卡。
- `question` 且非 active：渲染小卡（题目 + 答案摘要）。
- `insight` 且 `isActive`：渲染完整 `InsightSlip` 大卡。
- `insight` 且非 active：渲染小卡（理解摘要 + 校准结果）。
- `material` 且 `isActive`：渲染完整 `MaterialCard`。
- `material` 且非 active：渲染小卡（上传了 N 个文件 / 粘贴了 X 字）。

## 3. Wave 1 题目设计

Wave 1 保持硬编码但题目增加到 7 道，作为基础信息采集，仍以选择题为主：

1. **未来三年里，哪个选择、卡点或变化最值得先想清楚？**（单选，保留原 Q1）
2. **最近的状态里，哪些词更接近你？**（多选，保留原 Q2）
3. **最近一个让你投入或有能量的具体时刻发生了什么？**（简答，保留原 Q3）
4. **目前有哪些现实护栏需要考虑？**（多选，保留原 Q4）
5. **你做重要决定时更依赖？**（单选：逻辑分析 / 直觉感受 / 先收集信息再凭感觉）
6. **你的能量恢复方式？**（单选：独处恢复 / 社交充电 / 两者皆可）
7. **如果尝试新方向，你最在意？**（单选：稳定可控 / 成长新鲜感 / 自主与意义）
8. **你的 MBTI 类型是什么？**（单选：16 型 + “我还没测 / 不确定”）

说明：

- 前 4 题保持原意，确保 `lib/ai/sensemaker/wave1.ts` 仍能读取 `w1q1` - `w1q4` 生成首条即时理解。
- 新增 w1q5 - w1q8 作为 answer 源写入 `WorkingMemory`，Wave 1  sensemaker 暂时不使用，供后续 Wave 2 / Final 读取。
- 第 8 题选“还没测 / 不确定”时，不阻断流程；后续可在补充材料卡给出 MBTI 官方测试链接。

## 4. 补充材料卡

### 4.1 位置

在 Wave 1 即时理解校准完成后、进入 Wave 2 之前插入。

流程：

```
Wave 1 问题 → Wave 1 即时理解大卡 → 用户校准 → 补充材料大卡
  → 用户上传/粘贴/跳过 → Wave 2 自适应问题
```

### 4.2 卡片内容

- 标题："如果愿意，可以上传简历、MBTI 报告或粘贴一段文字，帮助我们更了解你。"
- 拖拽/点击上传区域（虚线框，高亮提示）。
- 文字粘贴区（多行文本框）。
- 隐私同意复选框："允许系统临时保存上传材料 24 小时，作为追问线索。"
- 按钮："提交" / "跳过，直接继续"。

### 4.3 行为

- 用户可只上传文件、只粘贴文字、两者都传、或直接跳过。
- 粘贴的文字在客户端打包成 `note.txt`，走 `/api/uploads` 接口，统一成为 `Upload` 记录。
- 上传完成后调用 `POST /api/session/consent` 给出 `upload` 同意。
- 成功后调用 `loadWave()` 加载 Wave 2。

## 5. 文件格式与转换

### 5.1 当前支持

`.txt`、`.md`、`.json`，服务端用纯 JS 解析。

### 5.2 扩展支持

按优先级扩展为：

1. **PDF**：使用 `pdf-parse` / `pdfjs-dist` 提取纯文本。
2. **DOCX**：使用 `mammoth` 将 docx 转为纯文本或 Markdown。
3. **DOC（旧二进制格式）**：
   - 先不直接支持；
   - 方案 A：提示用户另存为 `.docx` 或 `.pdf`；
   - 方案 B：在服务端调用 `pandoc` 或 `antiword` 转换（需要外部二进制，部署复杂，后续评估）。

### 5.3 多模态解析与预览

- 文本文件（`.txt` / `.md` / `.json`）继续走纯文本解析。
- **PDF 和图片统一走视觉解析**：
  1. PDF 先用 `pdf-to-png-converter` 转成前 N 页 PNG（默认最多 5 页）。
  2. 把 PNG/JPG/WEBP 等图片以 base64 形式传给独立的多模态模型。
  3. 多模态模型只返回提取到的文字，不做总结。
  4. 前端展示图片预览（PDF 页或原图）+ 解析出的文字。
  5. 用户确认后，文字才变成 `UploadChunk` 进入后续 Wave。
- **DOCX** 仍用 `mammoth` 提取文本（它已经是文本格式，转成图片性价比不高）。
- **音频** 暂不支持；上传时返回明确提示。
- 多模态模型通过独立环境变量 `MULTIMODAL_MODEL` 配置，默认复用同一 `AI_PROVIDER`（AIPING）接口，模型名如 `qwen3-vl-plus` 或 `qwen3.7-plus`。

## 6. 让 Wave 2 真正使用补充材料

`lib/ai/sensemaker/wave.ts` 和 `lib/ai/interviewer.ts` 目前未读取 `upload_chunks`。必须修改：

- `app/api/wave/route.ts` 生成 Wave 2 时，读取当前 session 的 `Upload` chunks，组装成 `upload_chunks`。
- `SensemakerWaveInput` 和 `InterviewerInput` 已预留 `upload_chunks` 字段；把 chunks 文本写进 prompt context。
- 提示模型：
  - 仅当 chunks 与当前不确定性相关时才引用；
  - 不得把材料中的事实硬编码成用户直接陈述；
  - 材料的 `source_ref` 使用 upload chunk 的 `uploadId + index`。

## 7. 需要改动的文件

- `app/play/page.tsx`：重写为 Conversation 驱动，管理 `ConversationItem[]`。
- `components/play/Conversation.tsx`：新的聊天/卡片流组件。
- `components/interview/QuestionFrame.tsx`：已经增加 `variant="card"` 支持；继续微调 card 模式样式。
- `components/play/MaterialCard.tsx`：新建补充材料大卡。
- `lib/interview/templates.ts`：扩展 `makeWave1Questions()`。
- `lib/ai/sensemaker/wave1.ts`：保持对原 4 题读取，忽略新增题。
- `app/api/wave/route.ts`：生成 Wave 2 时注入 `upload_chunks`。
- `lib/ai/interviewer.ts` / `lib/ai/sensemaker/wave.ts`：prompt 中加入 upload chunks。
- `lib/uploads/config.ts` + `lib/uploads/parse.ts`：新增 pdf / docx 解析；引入 `pdf-parse`、`mammoth` 依赖。
- `package.json`：新增 `pdf-parse`、`mammoth`，pinned 版本。

## 8. 隐私与同意

- 上传材料的隐私同意在补充材料卡内首次触发时请求，不强制用户在开始时就同意。
- 文本粘贴也走 `upload` consent，因为它会被临时保存。

## 9. 验收标准

- `/play` 打开后只看到一张大卡（Wave 1 第 1 题），上方无历史。
- 回答每道题后，该题缩小成小卡，下一题大卡从底部滑出。
- Wave 1 8 道题全部答完后出现即时理解大卡。
- 校准后出现补充材料大卡，支持拖拽/点击上传和粘贴。
- 补充材料完成后出现 Wave 2 自适应问题。
- 上传 PDF / DOCX 能成功解析为 chunks。
- `pnpm typecheck`、`pnpm build`、`pnpm test:contracts` 通过。
