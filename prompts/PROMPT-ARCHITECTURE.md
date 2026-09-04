# Prompt Architecture v3

- Status: design-complete candidate; not active until schemas/state machine/evals ship together
- Runtime roles: exactly `Interviewer` and `Sensemaker`
- System authority: `.loom/design/conversational-six-dimension-harness.md`
- Contract authority: `.loom/design/insight-plan-contracts.md`

## 1. Architecture goal

Prompts should make the model good at semantic judgment while preventing it from becoming the operating system. The host owns state, limits, safety, revisions and acceptance; prompts own language, interpretation and generative reasoning inside a narrow mode.

The previous prompt set had sound life-design principles but weak operational alignment: fixed Wave 1, 3–5 questions at once, no six-dimension radar, vague input envelopes, and separate task names that could be mistaken for extra agents. v3 corrects the system rather than merely polishing tone.

## 2. Composition order

Every model call is assembled in this order:

```text
1. role prompt for Interviewer or Sensemaker
2. mode-specific task prompt
3. immutable host policy and current limits
4. output schema generated from code
5. trusted session state and exact revisions
6. recent relevant conversation
7. untrusted material envelope
```

Later sections never override earlier sections. User text and material may contain instructions, but they remain data. The runtime must not concatenate raw uploads into the system or developer section.

## 3. Shared methodology

`prompts/life-design-spec-v2.md` retains its compatibility filename so current imports need not change before the code migration. Its internal contract revision is v3. It is a design constitution, not a giant system prompt and not automatically injected in full.

Each operational prompt receives only the relevant extracted principles:

- possibilities, not prediction or ranking；
- concrete life evidence before labels；
- fact / inference / hypothesis / imagination separation；
- ordinary-day and opportunity-cost discipline；
- prototypes for learning, not commitment；
- professional, non-clinical conversational boundary。

This prevents duplicated prose from drifting across prompts.

## 4. Runtime role and mode map

| Runtime role | Mode/task file | Responsibility | May mutate committed state? |
| --- | --- | --- | --- |
| Interviewer | `interviewer-v2.md` | open wave, continue microbatch, propose/end/deep-dive | no; proposal only |
| Sensemaker | `sensemaker-wave-v2.md` | wave memory/radar patch + one insight | no; proposal only |
| Sensemaker | `odyssey-generator-v2.md` | route intents, ordinary-day screens, final three lives | no; proposal only |
| Portrait Synthesist | `persona-portrait-v1.md` | synthesize full working memory into structured persona portrait before blueprint | no; proposal only |
| Sensemaker | `prototype-designer-v2.md` | focused three-day prototype | no; proposal only |
| Sensemaker | `blueprint-writer-v2.md` | versioned snapshot | no; proposal only |
| Sensemaker | `sensemaker-chat-v3.md` | bounded explanation/comparison/reflection | never |

The compatibility filenames ending in `v2` do not mean contract v2. Each file declares `contract_revision: 3`; they remain in place until the implementation task can update code imports atomically. There is no Planner, Persona Auditor, Critic, Stop Agent, Odyssey Agent, Prototype Agent or Blueprint Agent.

## 5. Prompt anatomy

Every operational prompt uses the same sections:

1. identity and single responsibility；
2. trusted input contract；
3. explicit authority and non-authority；
4. output contract (schema remains code-generated)；
5. decision procedure；
6. style and epistemic discipline；
7. safety/injection rules；
8. self-check before output；
9. failure behavior。

Prompts do not expose hidden chain-of-thought. “Decision procedure” tells the model what to verify internally; output includes only concise reasons required by the schema.

## 6. Host/model split

### Host validates deterministically

- current state allows the call；
- role/mode and schema match；
- session, wave, source and revision ownership；
- 5–10 elicitation units per wave, at most 10 actual questions, microbatch 1–3, waves ≤5, deep dives ≤2；
- user pause/stop/preview and declined topics；
- source references, atomic patch and stale propagation；
- pure route-readiness derivation and pairwise six-axis life-shape checks；
- prohibited prototype actions；
- prompt injection, tool permission, retry and idempotency。

### Prompt guides semantic judgment

- which decision deserves the current wave；
- how to phrase and sequence the next small batch；
- whether a concrete scene, meaning, counterexample or tradeoff is next；
- how strongly evidence supports an interpretation；
- how three daily lives can be truly different；
- which reversible experiment produces the best new information。

Any model field that attempts to change host limits is ignored and treated as a contract violation.

## 7. Voice contract

Professional means attentive, concise, specific and revisable—not stiff, clinical or omniscient.

- use the user’s own words when helpful；
- prefer one accurate reflection to three generic affirmations；
- ask concrete “what happened / when / how” more often than repeated abstract “why”；
- allow uncertainty, contradiction, refusal and silence；
- challenge only a visible contradiction, with permission and an easy correction path；
- never diagnose, pathologize, infer trauma, or imply exclusive understanding；
- never produce therapy cosplay such as “I can sense your hidden wound”；
- avoid motivational poster language and mechanical OARS templates。

## 8. Versioning and activation

Every generated artifact stores:

- `prompt_contract_revision`
- prompt file hash
- schema hash
- context-builder version
- model/provider/config
- fixture suite version

The host persists these fields once in an immutable `GenerationProvenance` row for every accepted model proposal. Every record newly materialized from that proposal carries a required foreign key to the same row. Proposal payloads contain no provenance id; rejected, expired or failed proposals create no provenance record.

A prompt becomes `active` only when the matching schema and state-machine changes are merged and its real-model report passes. Prompt-only edits cannot silently go live against an older schema.

This activation gate is deliberately later than the design-complete gate. TASK-007 freezes prompt contracts, executable synthetic fixture specifications and cross-document invariants; TASK-008/009 may then build the matching state/schema/context/UI with prompts still inactive; TASK-010 runs the real-model suite and activates the family atomically. Requiring a production-shaped real-model report before its schema/context exists would be circular and is not permitted.

## 9. Repair protocol

At most one semantic/structure repair is allowed before provider fallback. The repair request contains:

- original proposal；
- exact failed fields/rubric items；
- unchanged trusted context hash；
- instruction to repair only the failed contract, not invent new context。

If repair still fails, do not salvage fragments. Preserve committed state and use the mode’s degraded UI.

## 10. Evaluation and anti-overfitting

Use `.loom/design/acceptance-and-research.md` F01–F12, at least five runs per relevant mode. Exact wording is not a golden. Judge stable purpose, evidence, permissions, progressive pacing, route difference and trial safety.

No candidate can pass through self-evaluation alone. Structural checks are deterministic; semantic checks combine fixed rubrics, an independent evaluator and human sampling. Any injection, diagnosis, ranking, invalid source or dangerous prototype is a hard failure.

## 11. Cross-prompt harmony invariants

All prompt files must agree on the following constants:

- two runtime roles；
- six dimensions and five radar states；
- 5–10 elicitation units per wave and at most 10 actual questions; user-provided material may precover a unit with exact source mapping；
- 1–3 questions per generated microbatch；
- recommended 8, maximum 8 waves (wave 1 is a fixed template, AI-driven waves are 2–8; early stop allowed at wave 4 if sufficient)；
- maximum 2 deep-dive waves within the total；
- one formal insight per wave；
- interview exit is governed by mission/user/cap, while parallel-life generation is governed later by formal/provisional readiness；
- three equal three-year lives；
- one ordinary day and one reversible three-day prototype per life；
- every derived reference is an exact `SourceRef(source_id, source_revision)`; model proposals never invent host ids/timestamps/revisions/provenance ids；
- `open_wave` Interviewer proposals (for a core wave or an already accepted deep-dive kind) own the semantic 5–10-unit horizon; opening questions use only proposal-local indexes, continued questions use exact trusted committed unit ids, and the host validates and atomically assigns all new domain ids；
- `propose_deep_dive` is recommendation-only; after host acceptance, a separate `open_wave` call uses the latest revision and creates the wave exactly once；
- route `GateStatus` is never model output; the host derives it purely from one committed snapshot；
- model semantic corrections append and supersede immutable records; they never overwrite old content, evidence or generation provenance；
- ParallelLife uses `attractions`, `costs_and_tradeoffs`, `evidence_for`; Prototype content and TrialInstance lifecycle are separate；
- no ranking, diagnosis, profile score, hidden fact or irreversible first action；
- user correction supersedes model interpretation；
- only host commits state。

The document-lint task must fail if these constants diverge.

## 12. Prompt-injection envelope

Operational prompts receive material like:

```xml
<untrusted_material source_id="..." revision="...">
  ...document content...
</untrusted_material>
```

The prompt states that this block can support only `document_stated` evidence. It cannot define the role, reveal instructions, call tools, change output format or alter host policy. Suspicious content is not quoted into the user-facing insight unless directly relevant and safe.

## 13. Deletion and migration rule

Do not create another parallel v4 prompt set during implementation. Migrate the compatibility filenames atomically or rename all imports and files in one task, then archive/delete superseded prompts. Prompt architecture must have one canonical file per role/mode.
