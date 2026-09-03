# Prompt System v3：当前健康审查与迁移简报

- Kind: system audit
- Status: verified design snapshot; runtime migration not started
- Audit scope: clean worktree `codex/conversational-harness-v1`, current checked-out donor code, `.loom` canonical design, all files under `prompts/`
- System authority: [对话式六维决策 Harness](./conversational-six-dimension-harness.md)
- Prompt authority: [`prompts/PROMPT-ARCHITECTURE.md`](../../prompts/PROMPT-ARCHITECTURE.md)

## 0. Executive conclusion

当前代码不是“坏掉了”，但**相对于已经确认的新产品目标，它不健康且不可直接继续堆功能**。

健康的部分是：已有 guest/隐私/上传基础、双角色轮廓、结构化输出、证据引用、波次洞察、三路与可逆试验，视觉也已形成明确签名。干净基线中没有运行中的 PersonaAuditor、Planner、Stop Agent 或 72 格 schema。

不健康的部分是：运行时代码仍是一套旧 Harness——固定 Wave 1、整波 3–5 题、宿主固定选择 uncertainty、最多 4 波/19 题、占位 evidence、启发式 memory patch 和直接 final 生成。它与新设计的持续对话、波内微批次、六维雷达、路线意向、普通一天筛查、最多 5 波和 revision 失效传播不兼容。

因此正确顺序是：

```text
冻结 donor
→ 完成设计与 Prompt v3
→ Keeper 审查
→ XState/contract 迁移
→ 对话 shell
→ Interviewer + wave Sensemaker
→ route intents + ordinary days + final/trials
→ full eval
```

不能把 v3 Markdown prompt 直接塞进当前 runtime；schema、context builder 和状态机必须一起迁移。

## 1. Health matrix

| Area | Current evidence | Health | Judgment |
| --- | --- | --- | --- |
| Runtime role count | `lib/ai/interviewer.ts`, `lib/ai/sensemaker/*`; code scan finds no PersonaAuditor/Planner/Stop Agent | healthy donor | keep two roles |
| Prompt source | runtime prompts are inline in TypeScript; `prompts/*.md` are not loaded | P0 drift risk | one behavior can have two truths; migrate atomically |
| Wave 1 | `lib/interview/templates.ts` fixed four questions and zero Interviewer call | incompatible | keep two mandatory functions, not fixed wording |
| Adaptive interview | `lib/ai/interviewer.ts` receives host-selected uncertainty and generates all 3–5 questions at once | incompatible | AI mission + 1–3-question adaptive microbatches |
| Stop/limits | `app/api/wave/route.ts` uses `MAX_WAVES=5`, `MAX_QUESTIONS=50` and sufficiency heuristics | aligned | default 3, max 5, max 2 deep dives; interview-exit and parallel-life readiness are separate host gates |
| Working memory | old `WorkingMemory` with evidence/claims/constraints/uncertainties/route seeds | useful donor, incomplete | migrate to exact source revisions + six radar + route intents |
| Wave evidence | `sensemaker/wave.ts` asks model for placeholder ids, clears them, and host builds generic patch | P0 semantic loss | model proposes exact-source patch; host validates atomically |
| Corrections | existing accurate/partial/inaccurate concepts and invalidation foundations | healthy donor | extend to exact revision stale propagation |
| Final generation | `sensemaker/final.ts` jumps directly from memory to three lives | incompatible | add route-intent and ordinary-day calibration stages |
| Final fallback | generic seed/life text, possible `no-evidence` link, fabricated fallback lives | P0 truth risk | never make failure look complete; degrade to intents/unknowns |
| Distinctness | whitespace token similarity over Chinese summary | weak | use explicit pairwise life-shape axes + semantic eval |
| Ordinary day | one short string per route | insufficient | 4–6 moments + six dimension screen + epistemic status |
| Trial | time/money/reversibility and prohibited-action checks exist | healthy donor | add adjust/stop signal and stronger safety gate |
| State/recovery | database stores waves and avoids some duplicate generation | partial | explicit event model, XState guards, idempotency and source edit propagation |
| Safety/injection | upload boundary and prompt precautions exist | healthy but incomplete | preserve; test untrusted envelope in every mode |
| Visual system | Soft Editorial Neo-Brutalism and insight slip implemented/tested | healthy, frozen | extend components without redesign |
| Open-source control plane | XState/AI Elements absent from current `package.json` | not implemented | evaluate/install only in TASK-008/009 |

## 2. Concrete current-code risks

### P0. Prompt truth is split

`prompts/*.md` describe a prompt architecture, but runtime uses `makePrompt()` strings inside `lib/ai/interviewer.ts`, `lib/ai/sensemaker/wave.ts` and `lib/ai/sensemaker/final.ts`. Current `prompt_version` values also differ by call site (`interviewer.v1`, `sensemaker.wave.v1`, `sensemaker.final.v2`, `v0-draft`).

Effect: a reviewer can approve Markdown while production runs different instructions, fields and limits.

Required correction: choose one compiled source path, snapshot/fingerprint it, and activate prompt/schema/context/model versions as one release unit.

### P0. Sensemaker semantics do not reach committed understanding faithfully

Wave prompt asks the model for placeholder `evidence_ids`, then runtime empties them and delegates the memory patch to deterministic heuristics. The model can notice a nuanced tension, but the persistent memory may store generic claims/route seeds derived from form fields.

Effect: the visible insight may feel personal while the final routes remain generic—the system has a clever mouth and a forgetful brain. (￣▽￣;)

Required correction: Sensemaker proposes exact-source, exact-revision operations and radar deltas; host validates and commits the entire patch atomically.

### P0. Fallback can look more complete than evidence

Final fallback fills generic three-year trajectories, attractions, risks and prototype text. If active evidence is absent, helper code can create a `no-evidence` link and still preserve the full plan shape.

Effect: provider failure or insufficient understanding can produce a confident-looking artifact, violating the product’s evidence promise.

Required correction: degraded output stops at accepted route intents/unknowns or a visibly provisional skeleton; it never manufactures a complete three-life plan.

### P1. Current adaptation happens only between waves

Interviewer receives one host-selected uncertainty and returns 3–5 questions in a single call. Later questions cannot respond to earlier answers from the same wave.

Effect: the interaction feels like a generated questionnaire rather than a professional gradual conversation.

Required correction: one mission per wave, 1–3 questions per microbatch, next batch generated only after receiving prior answers.

### P1. Current host chooses semantics it should only govern

The code uses deterministic uncertainty selection and forces the model’s focus id to match. This is stable but makes the interview’s most professional judgment a scoring/heuristic problem.

Effect: host rules can choose the wrong human thread while the model is reduced to wording.

Required correction: AI proposes the mission and explains decision impact; host validates relevance, duplication, safety and limits without a fixed argmax.

### P1. Stop and readiness are too thin

Current stop uses wave count, question count, existence of route seeds/evidence and `last_wave_index >= 2`. It does not know whether six life lenses were handled, ordinary-day facts would need invention, material conflicts remain or route intents collapsed.

Required correction: mission/burden/user/cap controls decide when interviewing ends; after the user accepts three route intents, the non-scored route-readiness gate in `insight-plan-contracts.md` decides formal vs provisional life generation. These gates must not be collapsed.

### P1. Final generation skips user authorship

The runtime directly produces three plans. Users cannot first reshape route intents or correct the ordinary-day simulation.

Effect: even well-written plans can feel like the model wrote a person’s future for them.

Required correction: route intent editing and six-dimension ordinary-day screening before final.

## 3. Target architecture

### Control plane

XState v5 expresses entry, consent/material, interviewing/orienting/answering/synthesizing/calibrating, route intents, ordinary-day screening, final lives, trial, bounded reflection, pause, degraded and safety stop. AI output is an event proposal only.

### Semantic plane

- Interviewer: `open_wave` mission/unit horizon + microbatch, continuation/ending, and a separate recommendation-only deep-dive proposal；
- Sensemaker.wave: exact-source patch + radar delta + one insight；
- Sensemaker.futures: route intents → ordinary day → parallel lives；
- Sensemaker.prototype: focused real-world experiment；
- Sensemaker.blueprint/chat: versioned summary and bounded read-only follow-up。

### Standard replacing 72 cells

Six dimensions have qualitative states, and formal generation uses functional route readiness. All six must be handled; typically at least four are grounded; contradictions and declines remain visible; no aggregate score exists.

### Interaction plane

One conversation canvas. Question cards and free composer are equal inputs. Submitted cards fold into editable user bubbles. Each wave has one formal insight slip; microbatches use only brief contingent bridges.

## 4. Prompt v3 review result

The following files have been rewritten to one contract revision and role map:

- `prompts/life-design-spec-v2.md`：shared methodology constitution；
- `prompts/interviewer-v2.md`：mission/microbatch/deep-dive proposal；
- `prompts/sensemaker-wave-v2.md`：revision-safe understanding and radar；
- `prompts/odyssey-generator-v2.md`：Sensemaker futures modes；
- `prompts/prototype-designer-v2.md`：reversible learning prototype；
- `prompts/blueprint-writer-v2.md`：versioned snapshot；
- `prompts/sensemaker-chat-v3.md`：bounded read-only follow-up；
- `prompts/PROMPT-ARCHITECTURE.md`：composition, authority, versioning, repair and harmony invariants。

Compatibility filenames remain intentionally. None is “active” until TASK-008–010 migrate schema/context/runtime and real-model eval passes.

The pre-code gate and activation gate are distinct. Before TASK-008, required evidence is contract harmony, executable F01–F12 specifications, state/source/readiness protocols, structural prompt lint and explicit disposition of every material finding from the latest independent Keeper. A new open-ended review is justified only by a new contradiction or failed implementation evidence. Real-model multi-run evaluation requires the matching schemas, context builder and interaction shell, so it belongs to TASK-010 before activation rather than blocking TASK-008.

## 5. Open-source decision

- Adopt XState v5 as the only state control plane.
- Keep AI SDK + Zod for provider/structured output.
- Selectively copy AI Elements conversation/message/prompt primitives only if accessibility and bundle review pass.
- Do not install assistant-ui alongside AI Elements.
- Keep existing Radix/neobrutalism source, Tailwind, Motion, Phosphor, Prisma and visual tokens.
- Do not add an Agent orchestration framework; the hard problem is governance and evidence, not agent count.

## 6. Migration safety rules

1. No runtime change before TASK-007 closes its deterministic contract/findings gate.
2. Inventory the exact donor files and tests named by TASK-008 before schema migration; preserve guest/upload/privacy and visual behavior.
3. Implement state/contracts before wiring prompt v3.
4. Activate prompt, schema, context builder and model config atomically.
5. Provider failure never returns a falsely complete plan.
6. Keep old and new paths behind an internal migration flag only as long as needed for tests; do not maintain two permanent Harnesses.
7. Delete/archive superseded prompt builders after parity and eval, so one source remains.
8. TASK-008 first repairs the reproducible pnpm/Prisma toolchain gate documented in `platform-and-assets.md`; a present local `node_modules` is not clean-install evidence.

## 7. Health exit criteria

The Agent system becomes healthy only when:

- traces contain two runtime roles and valid modes only；
- proposal/commit separation is enforced by tests；
- F01–F12 pass structure and semantic rubrics；
- exact revisions and user corrections propagate；
- no sixth wave, third deep dive, radar score or 72-cell dependency exists；
- route intents and ordinary days prevent three-route collapse；
- unsupported current facts and dangerous prototypes are zero；
- real-model reports include prompt/schema/context/model hashes, cost and repair/fallback rates；
- the frozen visual and stable donor infrastructure still pass their original evidence suite。
