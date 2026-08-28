# Decision History

Current truth belongs in PROJECT.md and linked design documents. This file preserves consequential superseding decisions.

## D-00?: Allow a bounded Three.js voxel mascot on the landing page

- Current decision: The landing page may use a single, self-contained Three.js 3D voxel character with a pixel-style HTML speech bubble. It is loaded with `ssr: false`, has a paper-colored background, and does not block the title, sample card, or CTA if it fails to render.
- Rationale: A 2D sprite did not match the desired colorful, blocky look; a small, controlled 3D decoration on the marketing homepage is a bounded exception to the previous "no WebGL" rule. It must not appear in the interview, upload, or route views.
- Source: user override in conversation
- Supersedes: the blanket "MVP 不使用 Three.js" boundary in PROJECT.md
- Affects: visual-art-direction.md, platform-and-assets.md, landing page
- Recorded: 2026-08-28T09:45:00.000Z

## D-001: Hide the persona product, retain working memory

- Current decision: The interface will not expose a persona dashboard or coverage model. The system retains evidence-linked working memory for adaptive questions, immediate insights and plan generation.
- Rationale: Deleting internal understanding would make questions repetitive and plans generic; exposing the full model creates unnecessary user and product complexity.
- Source: conversation
- Supersedes: none
- Affects: project-wide or not yet classified
- Recorded: 2026-08-27T03:24:21.999Z

## D-002: Use short value-delivery waves

- Current decision: Each wave contains three to five questions and ends with an immediate insight plus user calibration controls.
- Rationale: Short waves make the reward immediate and let correction improve the next wave.
- Source: conversation
- Supersedes: none
- Affects: project-wide or not yet classified
- Recorded: 2026-08-27T03:24:22.002Z

## D-003: Modern web product, not mandatory H5 wrapper

- Current decision: Design for a mobile-first responsive Next.js web application with desktop expansion and installable PWA potential.
- Rationale: This preserves link-based distribution while allowing richer visual direction, uploads and durable sessions.
- Source: conversation
- Supersedes: none
- Affects: project-wide or not yet classified
- Recorded: 2026-08-27T03:24:22.004Z

## D-004: Custom visual system over a themed component kit

- Current decision: Use shadcn/ui as accessible structural primitives, Motion for interaction, and a small curated subset of React Bits or Magic UI source components for effects. Art direction remains custom.
- Rationale: Component libraries can accelerate mechanics but cannot supply a coherent brand; unrestricted effect libraries would make the product look like a generic AI landing page.
- Source: conversation
- Supersedes: none
- Affects: project-wide or not yet classified
- Recorded: 2026-08-27T03:24:22.005Z

## D-005: Guest-first session and delayed account

- Current decision: Users may complete the first waves, upload optional material and preview plans without registration through a temporary server-side guest session. Accounts are requested only for cross-device use or retention beyond 24 hours.
- Rationale: The product must prove value before asking for identity while still keeping sensitive answers and uploads out of ordinary browser storage.
- Source: conversation
- Supersedes: none
- Affects: project-wide or not yet classified
- Recorded: 2026-08-27T03:31:46.381Z

## D-006: Exclude unresolved sky assets from MVP

- Current decision: Lifetide-Lite will not reuse Lifetide's user-provided sky images in MVP. It may reuse the registered CC0 water, boat and landmark as minor replaceable accents with provenance carried over.
- Rationale: Cross-project publication rights for the sky files are not documented; visual identity must not depend on rights-unclear assets.
- Source: conversation
- Supersedes: none
- Affects: project-wide or not yet classified
- Recorded: 2026-08-27T03:31:46.383Z

## D-007: Soft editorial neo-brutalism as the visual foundation

- Current decision: Use a softened Swiss-editorial neo-brutalist language: off-white graph paper, ink-black 2px outlines, 3-4px hard shadows, square or lightly cut corners, restrained cobalt-blue accent, large Chinese editorial serif moments and neutral sans UI text. Use neobrutalism.com/RetroUI's current shadcn registry as the primary component source, with neobrutalism.dev as an additional reference, rather than generic shadcn plus effect libraries.
- Rationale: This matches the provided reference and provides an existing, accessible, source-owned React/Next.js component system. Softening border weight, color count and card density keeps the style youthful and tactile without making a long interview tiring or confrontational.
- Source: conversation
- Supersedes: D-004
- Affects: project-wide or not yet classified
- Recorded: 2026-08-27T03:43:45.898Z

## D-008: Reject adjacent style libraries for the MVP foundation

- Current decision: Do not use Memphis, Bauhaus, Y2K, claymorphism, glassmorphism or pure Swiss minimalism as the base system. Their useful traits may inform composition, but the implementation foundation remains editorial neo-brutalism.
- Rationale: Memphis and Y2K skew decorative or juvenile, Bauhaus is rigid and primary-color coded, clay/glass reduce clarity or age quickly, and pure Swiss minimalism lacks the tactile playful signature requested. Neo-brutalism best balances existing library coverage, youth appeal and product-form compatibility.
- Source: conversation
- Supersedes: none
- Affects: project-wide or not yet classified
- Recorded: 2026-08-27T03:43:45.899Z

## D-009: Name the product 人生试运行

- Current decision: The standalone lightweight product is named 人生试运行. The prior working name 潮生｜人生试玩 is retired.
- Rationale: 人生试运行 states the product mechanism directly, feels lighter and more contemporary than 人生模拟器, and connects naturally to three alternative lives and the three-day reversible trial.
- Source: conversation
- Supersedes: none
- Affects: project-wide or not yet classified
- Recorded: 2026-08-27T03:46:27.011Z

## D-010: Defer Agent prompt and structured-design polish to a final review round

- Current decision: Implement the Agent runtime, schema, call accounting, and stop rules in TASK-005/TASK-006 with initial prompts and a real LLM provider. A unified review and correction of all Agent prompts and some structured design choices will happen after the core Agent loop is functional. The system must be built so prompts can be swapped without changing the runtime or data contracts.
- Rationale: Prompt tuning and fine-grained schema design benefit from seeing the end-to-end flow first. Doing it in one final pass prevents repeatedly rewriting prompts while the runtime is still changing.
- Source: conversation
- Supersedes: none
- Affects: lib/ai, lib/interview, lib/ai/sensemaker, .loom/design/adaptive-interview-system.md, .loom/design/insight-plan-contracts.md
- Recorded: 2026-08-27T08:55:00.000Z
- Reminder: After TASK-005/TASK-006 runtime is complete, revisit all Agent prompts, focus-selection heuristics, and Interviewer/Sensemaker structured-output design.

## D-011: Show three-year route as a lightweight timeline

- Current decision: Each route cover displays `year_1`, `year_2`, `year_3` as a short, visible timeline (1-2 sentences per year). Details such as ordinary day, unknowns, risk and prototype are folded and revealed on interaction.
- Rationale: Odyssey Plan's value is to make the user see how a life unfolds. Hiding years behind a default or merging them into prose would lose the trajectory.
- Source: conversation
- Supersedes: none
- Affects: components/routes/RouteCover.tsx, lib/plans/route-view.ts, lib/fixtures.ts
- Recorded: 2026-08-27T09:05:00.000Z

## D-012: Lite MVP = 4 explicit tools + 2 implicit Sensemaker dimensions

- Current decision: The MVP exposes 4 explicit Life Design tools: 人生仪表盘, 指南针, Odyssey Plans, 原型体验. Energy/engagement cues and failure/feedback reframing are implicit judgment dimensions used by Sensemaker, not surfaced as separate tools or modules.
- Rationale: Lite is a product, not a course. Energy and failure signals should be absorbed into Sensemaker's evidence/claim/uncertainty processing rather than exposed as extra steps.
- Source: conversation
- Supersedes: none
- Affects: lib/ai/sensemaker/* prompts, lib/working-memory/types.ts, components/insight/InsightSlip.tsx
- Recorded: 2026-08-27T09:05:00.000Z

## D-013: Life Design v2 as methodology source, not runtime prompt

- Current decision: `Life Design｜人生设计伙伴 Prompt v2.0.md` becomes `prompts/life-design-spec-v2.md`, the methodology "constitution". Runtime prompts are derived per responsibility: `interviewer-v2.md`, `sensemaker-wave-v2.md`, `odyssey-generator-v2.md`, `prototype-designer-v2.md`, `blueprint-writer-v2.md`. Lite keeps only two persistent roles (Interviewer and Sensemaker); the others are task-level prompts invoked by Sensemaker or the host, not separate autonomous agents.
- Rationale: A single monolithic prompt would create too many "agents in a room" and make structured output hard to verify. Splitting by responsibility keeps the runtime small while preserving the v2.0 design values.
- Source: conversation
- Supersedes: none
- Affects: prompts/*, lib/ai/interviewer.ts, lib/ai/sensemaker/*, .loom/design/prompt-architecture-v2.md
- Recorded: 2026-08-27T09:05:00.000Z

## D-014: Prototype Card inside route cover with lightweight trial state

- Current decision: The trial is presented as a Prototype Card inside the route cover, not as a separate page. Tapping "开始试玩" expands the card to show the hypothesis, three-day plan, today's smallest action, what to observe, and pause/exit guidance. A lightweight `trial_status` (not_started | active | paused | completed | exited) is stored. Exited and paused must not be styled as failure. After the prototype period, a single reflection question is asked: "这三天让你更想靠近还是远离这条生活，为什么？" The output is learning, not a score.
- Rationale: "直接开玩" matches the prototype spirit. A separate `/plans/[id]/play` page would turn a light real-world action into a heavy task system.
- Source: conversation
- Supersedes: none
- Affects: components/routes/RouteCover.tsx, lib/working-memory/types.ts (Prototype, trial_status), lib/ai/sensemaker/final.ts, lib/plans/route-view.ts
- Recorded: 2026-08-27T09:05:00.000Z

## D-015: Expand one route detail at a time from a single toggle

- Current decision: The route cover has a single "展开这条人生" toggle at the bottom. By default the three-year timeline and core experience are visible; the rest (ordinary day, attractions, costs_and_tradeoffs, evidence_for, assumptions, uncertainties, risks, prototype) appears only after expansion. UX focuses one active plan at a time. The implementation does not need to enforce strict accordion exclusivity, but the user should feel one route is in focus.
- Rationale: An accordion of multiple sections would feel like a SaaS config panel and break the narrative. A single expand keeps the card lightweight and the page clean.
- Source: conversation
- Supersedes: none
- Affects: components/routes/RouteCover.tsx, components/routes/RouteCarousel.tsx
- Recorded: 2026-08-27T09:05:00.000Z

## D-016: Refactor ParallelLife schema with distinct semantic fields

- Current decision: `ParallelLife` schema v2 uses `core_experience`, `year_1/2/3`, `ordinary_day`, `attractions`, `costs_and_tradeoffs`, `evidence_for`, `assumptions`, `uncertainties`, `risks`, and `trial` (Prototype). The ambiguous `gain`, `loss`, and `evidence` fields are removed. No scores, ranks, totals, or recommendation fields are added.
- Rationale: `gain`/`loss`/`evidence` previously packed too many meanings. Splitting them prevents the model from writing essays in single fields and keeps the contract aligned with the principle that three routes are not candidates to be scored.
- Source: conversation
- Supersedes: none
- Affects: lib/working-memory/types.ts, lib/ai/sensemaker/final.ts, lib/plans/route-view.ts, components/routes/RouteCover.tsx, .loom/design/insight-plan-contracts.md
- Recorded: 2026-08-27T09:05:00.000Z

## D-017: Blueprint is an optional, user-triggered freeze of current state

- Current decision: A Blueprint is not auto-generated after a prototype. It appears as an entry point only when the system has a dashboard, compass, insights, 3 parallel lives, and at least one prototype. It can also be triggered by explicit chat commands such as "帮我总结一下", "生成蓝图", or "我现在到底得到什么了". Each Blueprint has a version, generation time, and source snapshot. It is presented as "v1 / v2..." of the user's current life design, not a final answer.
- Rationale: Auto-generating a "blueprint" after a prototype would feel like an ending CG. Making it optional and versioned preserves the Life Design idea that a blueprint is a revisable artifact.
- Source: conversation
- Supersedes: none
- Affects: app/blueprint/*, lib/ai/sensemaker/blueprint.ts, components/chat, .loom/design/insight-plan-contracts.md
- Recorded: 2026-08-27T09:05:00.000Z

## D-018: Choice questions are the primary form, short text is ratio-controlled, and all choices allow custom input

- Current decision: The interview system supports `single_choice`, `multi_choice`, `short_text`, and `scale` response kinds. Choice questions (single and multi) are the preferred form. The number of options may vary from 2 to 6. All choice questions offer an "其他（可输入）" option that reveals a text input when selected. Short text is explicitly limited by the Interviewer Agent: wave index 2 or below may contain at most one `short_text`; wave index 3 or above may contain at most two. Wave 1 template now uses one single-choice, two multi-choice, and one short-text question.
- Rationale: Early users find single and multi-choice questions lower burden. Custom input lets them correct a fixed option with their own words. Short text is kept low early to reduce friction, but the system still needs concrete examples for meaningful evidence.
- Source: conversation
- Supersedes: none
- Affects: lib/working-memory/types.ts, components/interview/QuestionFrame.tsx, components/interview/ChoiceCard.tsx, lib/ai/sensemaker/build-wave-patch.ts, lib/interview/templates.ts, lib/ai/interviewer.ts, lib/interview/fallback.ts, app/api/answer/route.ts, tests/e2e/visual-prototype.spec.ts, tests/e2e/screenshot-flow.spec.ts, tests/integration/wave-one.test.ts, tests/integration/adaptive-waves.test.ts, tests/integration/parallel-lives.test.ts
- Recorded: 2026-08-27T12:00:00.000Z
