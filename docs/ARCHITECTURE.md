# 架构概览

## 系统边界

```
用户
  │
  ▼
┌──────────────────────────────────┐
│  Next.js App Router              │
│  ├── /play        核心产品流程    │
│  ├── /account     个人中心       │
│  ├── /admin       管理员后台     │
│  └── /api/*       API 路由       │
├──────────────────────────────────┤
│  Session / Auth 层               │
│  ├── resolveSession()            │
│  ├── JWT (jose) + bcrypt         │
│  └── 邀请码 + Consent            │
├──────────────────────────────────┤
│  双 Agent 层                     │
│  ├── Interviewer  (提问)         │
│  └── Sensemaker   (理解)         │
├──────────────────────────────────┤
│  Working Memory                  │
│  ├── answers / claims            │
│  ├── sources / source_heads      │
│  ├── uncertainties               │
│  ├── route_intents               │
│  ├── persona_portrait            │
│  └── finalPlan                   │
├──────────────────────────────────┤
│  持久化                           │
│  ├── Prisma + SQLite             │
│  └── XState ledger (事件溯源)     │
└──────────────────────────────────┘
```

## 核心数据流

### 访谈流程

```
GET /api/wave
  → resolveSession()
  → loadOrCreateWorkingMemory()
  → 判断 XState 状态
  → 返回当前 wave 的问题（或 stop）

POST /api/wave
  → resolveSession()
  → 保存答案到 Prisma
  → 提交 ANSWER_SUBMITTED 事件到 ledger
  → 调用 Sensemaker 生成 insight (SSE 流式)
  → applyMemoryOperations() 更新 WorkingMemory
  → saveWorkingMemory()
  → 提交 WAVE_END_COMMITTED + INSIGHT_COMMITTED
  → SSE 返回 insight
```

### 画像生成

```
POST /api/portrait
  → resolveSession() + hasConsent("ai")
  → loadOrCreateWorkingMemory()
  → 检查 last_wave_index >= 1
  → 调用 AI 生成 PersonaPortrait
  → saveWorkingMemory() (含 persona_portrait)
```

### 路线生成

```
POST /api/final
  → resolveSession() + hasConsent("ai")
  → loadOrCreateWorkingMemory()
  → 生成 route_intents → ordinary_days → parallel_lives
  → 验证 parallelLivesPlanSchema
  → saveWorkingMemory() (含 finalPlan)
  → GET /api/final 幂等返回
```

## Session 解析

`resolveSession()` 统一处理 guest 和已注册用户：

1. 读取 `auth-token` cookie
2. 如果有 → 找到 User → 找到/创建该 User 的 Session
3. 如果没有 → 读取 `guest-token` cookie → 找到/创建 Guest Session
4. 返回 session（含 consents, answers, uploads, derived, workingMemory）

**关键修复**：所有 API 都使用 `resolveSession()`，不再混用 `requireGuestSession()`，避免注册用户的 consent 和数据绑定到错误的 session。

## XState 事件溯源

每个状态变更都通过 `commitEvent()` 提交到 ledger：

- `SESSION_STARTED`
- `WAVE_MISSION_COMMITTED`
- `ANSWER_SUBMITTED`
- `WAVE_END_COMMITTED`
- `INSIGHT_COMMITTED`
- `CALIBRATION_SUBMITTED`
- `CONSENT_RECORDED`
- `ROUTE_PHASE_ENTERED`

`loadPublicSnapshot()` 读取最新快照，用于判断当前状态机位置。

## 六维证据模型

WorkingMemory 中的 `source_versions` 和 `source_heads` 跟踪六类证据：

| 维度 | 说明 |
|------|------|
| traits | 特质倾向 |
| motivation | 动机 |
| capabilities | 能力 |
| relationships | 关系模式 |
| environment | 环境适应 |
| narrative | 叙事身份 |

每个证据有 `epistemic_status`（working_inference / observed / claimed）和 `relevance`。

## 路线设计基础

每条 `ParallelLife` 包含 `design_basis`，将路线链接回分析：

- `principle_refs`：引用的原则
- `seed_ref`：种子证据
- `lived_difference`：这条路线真正不同的地方
- `narrative_anchor`：叙事锚点
- `prototype_question`：试玩要验证的问题

## 安全边界

- AI 操作需要 `ai` consent
- 上传需要 `upload` consent
- 注册需要邀请码
- 管理员后台需要 `ADMIN_EMAIL` 匹配
- JWT 30 天有效期
- Guest session 24 小时过期
