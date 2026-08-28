# Prompt Architecture

## Methodology source

- `prompts/life-design-spec-v2.md` is the constitutional / methodology document.
- It is **not** injected as a system prompt.
- It is the shared reference from which all operational prompts are derived.

## Two persistent runtime roles

### 1. Interviewer

- File: `prompts/interviewer-v2.md`
- Decides what is most worth asking next.
- Outputs `InterviewerOutput`.
- Read by: `lib/ai/interviewer.ts`
- Called at: wave start (except Wave 1, which is a fixed template).

### 2. Sensemaker

- File: `prompts/sensemaker-wave-v2.md`
- Interprets answers, updates WorkingMemory, produces `ImmediateInsight`.
- Read by: `lib/ai/sensemaker/wave.ts` (and related patch modules).
- Called at: wave end, after answers are submitted.

The final sensemaker can use the same discipline but is scoped to three-year life generation (see below).

## Three task-level prompt responsibilities

These are **not** autonomous Agents. They are generation tasks invoked by the Sensemaker or the runtime.

### 3. Odyssey Generator

- File: `prompts/odyssey-generator-v2.md`
- Generates `FinalPlan` with three `ParallelLife` objects.
- Currently inlined in `lib/ai/sensemaker/final.ts`.
- Future: separate task function that receives WorkingMemory and returns `FinalPlan`.

### 4. Prototype Designer

- File: `prompts/prototype-designer-v2.md`
- Generates the `Prototype` object inside each `ParallelLife`.
- Currently included in `lib/ai/sensemaker/final.ts`.
- Future: separate task function called for the focused life.

### 5. Blueprint Writer

- File: `prompts/blueprint-writer-v2.md`
- Generates a versioned snapshot when explicitly triggered.
- Not wired yet. Future: `/api/blueprint` or chat command.

## Relationship to schemas

- Prompts must be schema-aware but not schema-hardcoded.
- A prompt change should not require a runtime or data-contract change.
- When a schema changes (e.g. `ParallelLife.v2`), both the Zod schema and the prompt must be updated.
- Zod validation is the runtime contract. Prompts are the operational expression of that contract.

## No five-Agents runtime

Lite does not run five separate Agents. It runs:

1. Interviewer
2. Sensemaker

Plus three optional generation tasks driven by the Sensemaker or the UI.

This keeps the runtime simple while the prompt architecture can still grow.
