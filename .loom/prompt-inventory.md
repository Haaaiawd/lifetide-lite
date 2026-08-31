# TASK-009: Prompt System Health Inventory

Generated: 2026-08-30

## 1. Owner intent vs. current state

| Owner intent (from .loom/PROJECT.md and design docs) | Current state | Status |
| --- | --- | --- |
| Exactly two runtime roles: Interviewer and Sensemaker. | `lib/ai/interviewer.ts` and `lib/ai/sensemaker/*` exist. No PersonaAuditor, Planner or Stop Agent found in runtime code. | healthy |
| 72-cell persona / CoverageCell / PersonaSnapshot not a runtime gate. | Not referenced in TypeScript runtime or prompts. | healthy |
| Progressive 5-10 elicitation units per wave, 1-3 questions per microbatch, ≤5 waves, ≤2 deep dives. | `lib/ai/interviewer.ts` still generates 3-5 questions as one batch; no elicitation-unit / microbatch concept in runtime. | drift |
| Host owns stop/focus/caps; model proposes only. | `app/api/wave/route.ts` runs host stop logic (`MAX_WAVES = 4`, `MAX_QUESTIONS = 19`, `evaluateStop`). Model proposes `focus_uncertainty_id`. | partial drift (4 waves / 19 questions vs. canonical 5 / 10 per wave) |
| Six-dimension radar with five states, no scores. | `lib/working-memory/types.ts` still uses old `WorkingMemory` with evidence/constraints/uncertainties; no radar cells. | drift |
| Route readiness is host-derived, not model output. | `evaluateStop` and `rankActiveUncertainties` in `lib/interview/uncertainty.ts` drive stop; not yet replaced by `deriveRouteReadiness`. | drift |
| Bounded chat: four scopes, 20-turn limit, no ranking, no upload reading. | `lib/ai/sensemaker/chat.ts` matches v3 contract. | healthy |
| Final plan: three structurally different lives, reversible prototype, no ranking language. | `lib/ai/sensemaker/final.ts` and `lib/ai/sensemaker/build-wave-patch.ts` still build `FinalPlan` with `lives`, `shared_values`, `real_tradeoff`. | needs audit |

## 2. Prompt / runtime file map

| File | Runtime role | Contract revision | Called from | Key drift |
| --- | --- | --- | --- | --- |
| `prompts/interviewer-v2.md` | Interviewer | 3 (declared) | `lib/ai/interviewer.ts` | File declares v3, but `lib/ai/interviewer.ts` still operates on 3-5 question batch and `InterviewerInput` v1 schema. |
| `prompts/sensemaker-wave-v2.md` | Sensemaker / wave insight | 3 (declared) | `lib/ai/sensemaker/wave.ts` | `wave.ts` is a thin wrapper around `build-wave-patch.ts` using v1 `WorkingMemory` operations. |
| `prompts/odyssey-generator-v2.md` | Sensemaker / route intents & lives | 3 (declared) | `lib/ai/sensemaker/final.ts` | `final.ts` calls `build-wave-patch.ts` then `runSensemakerFinal`; need to confirm it follows elicitation-unit/radar contract. |
| `prompts/prototype-designer-v2.md` | Sensemaker / prototype | 3 (declared) | `lib/ai/sensemaker/final.ts` (life.trial) | Trial content is generated as part of final plan; separate prototype call not yet active. |
| `prompts/blueprint-writer-v2.md` | Sensemaker / versioned snapshot | 3 (declared) | `lib/ai/sensemaker/final.ts` (plan output) | Plan versioned as `parallel-lives.v2`; may need update to v3 contract. |
| `prompts/sensemaker-chat-v3.md` | Sensemaker / chat | 3 (declared) | `lib/ai/sensemaker/chat.ts` | Healthy; uses four scopes and 20-turn limit. |

## 3. Critical contradictions to resolve

1. **Wave shape contradiction**
   - Design: 5-10 elicitation units, 1-3 questions per microbatch, concrete experience first, contrast, optional future projection.
   - Runtime: `InterviewerOutput` has `questions: 3-5`; no `elicitation_units`, no `microbatch`, no progressive sequence.
   - Action: rewrite `lib/ai/interviewer.ts` and `lib/working-memory/types.ts` around `WaveMissionProposal` / `MicrobatchProposal`; remove `focus_uncertainty_id` as model field; host selects focus.

2. **Stop-cap contradiction**
   - Design: ≤5 waves, ≤10 actual questions per wave, ≤2 deep dives, host-governed formal/provisional readiness.
   - Runtime: `MAX_WAVES = 4`, `MAX_QUESTIONS = 19`, `WorkingMemory.last_wave_index`.
   - Action: move stop logic to host CAS path using `deriveRouteReadiness`; remove `evaluateStop`; update constants.

3. **Radar / evidence model contradiction**
   - Design: six dimensions with unseen/signaled/grounded/conflicted/declined and `EvidenceLink` with `source_id`, `source_revision`, `epistemic_status`, `evidence_shape`.
   - Runtime: `WorkingMemory` uses old `Evidence`/`Constraint`/`Uncertainty` with `status`, `confidence`, `epistemic` and no source revision.
   - Action: migrate `applyMemoryOperations` and `build-wave-patch.ts` to canonical `lib/state/contracts` types.

4. **Prompt / code contract mismatch**
   - Prompts declare v3, but runtime schemas are v1.
   - Action: align `interviewer.ts`, `wave.ts`, `final.ts`, `chat.ts` input/output contracts with `lib/state/contracts`.

## 4. Audit commands run

- `grep -R "PersonaAuditor|StopDecision|Planner|72-cell" --glob="*.ts" lib/ app/ prompts/` → no runtime matches.
- `grep -R "PersonaAuditor|StopDecision|Planner|72-cell" --glob="*.md" prompts/ .loom/design/` → only legacy/negative references.
- `pnpm typecheck` → passed (baseline).
- `pnpm test:contracts` → 23 passed.
- `pnpm exec playwright test --project=integration` → 29 passed.

## 5. Recommended next steps

1. Write health-audit brief in `.loom/design/prompt-architecture-brief.md` or replace with v3 consolidated brief.
2. Rewrite `lib/ai/interviewer.ts` to:
   - accept `WaveMissionProposal` (5-10 elicitation units, no IDs);
   - emit `MicrobatchProposal` (1-3 questions, local indexes);
   - follow concrete → contrast → optional-future sequence;
   - never return stop/wave count/focus selection.
3. Rewrite `lib/ai/sensemaker/wave.ts` + `build-wave-patch.ts` to:
   - emit one `ImmediateInsightProposal` per wave;
   - update six-dimension radar cells as `RadarDelta` list;
   - never emit coverage/score/percentage.
4. Update `lib/ai/sensemaker/final.ts` to:
   - use `deriveRouteReadiness` gate before final call;
   - generate three structurally different `ParallelLife` proposals;
   - ensure each `Trial` is reversible and tests one uncertainty.
5. Add/update integration tests for deterministic stopping, prompt fallbacks, citation validity, route equality and bounded-chat.
