// Sensemaker final — generates three equal, evidence-linked, distinct three-year lives.
// Uses the authoritative v3 ParallelLivesPlan contract from lib/state/contracts.ts.
// See .loom/design/insight-plan-contracts.md § Final three-year plan contract

import { randomUUID } from "node:crypto";
import { z } from "zod";
import { generateStructured, getProviderConfig } from "@/lib/ai/client";
import { composePrompt } from "@/lib/ai/prompts/compose";
import { parallelLivesPlanSchema } from "@/lib/state/contracts";
import { portraitToContext } from "@/lib/ai/sensemaker/portrait";
import type { EvidenceLink, SourceVersion, SourceHead, WorkingMemory, SensemakerFinalInput } from "@/lib/working-memory/types";
import type { RouteIntent, Prototype, ParallelLife, ParallelLivesPlan, PrototypeEmbed, DayNarrative, Analysis, AnalysisFinding, DesignBasis } from "@/lib/state/contracts";
import type { ProviderConfig } from "@/lib/ai/client";

const PROMPT_VERSION = "sensemaker.final.v3";

const RANKING_TERMS = ["最佳", "最好", "最适合你", "推荐", "首选", "安全选择", "冠军", "plan b", "b 计划", "最安全"];
const IRREVERSIBLE_TERMS = ["辞职", "退学", "搬家", "贷款", "手术", "分手", "离婚", "断绝", "公开宣布", "卖房", "卖车", "起诉", "签约三年"];

function containsRanking(text: string): boolean {
  const lowered = text.toLowerCase();
  return RANKING_TERMS.some((t) => lowered.includes(t));
}

function containsIrreversible(text: string): boolean {
  return IRREVERSIBLE_TERMS.some((t) => text.includes(t));
}

function tokenSetSimilarity(a: string, b: string): number {
  const tokensA = new Set(a.split(/\s+/).filter(Boolean));
  const tokensB = new Set(b.split(/\s+/).filter(Boolean));
  if (tokensA.size === 0 && tokensB.size === 0) return 1;
  const intersection = new Set([...tokensA].filter((x) => tokensB.has(x)));
  const union = new Set([...tokensA, ...tokensB]);
  return intersection.size / union.size;
}

function planNotDistinct(lives: ParallelLife[]): boolean {
  for (let i = 0; i < lives.length; i++) {
    for (let j = i + 1; j < lives.length; j++) {
      const a = lives[i];
      const b = lives[j];
      const summaryA = `${a.title} ${a.core_experience} ${a.ordinary_day} ${a.year_1}`;
      const summaryB = `${b.title} ${b.core_experience} ${b.ordinary_day} ${b.year_1}`;
      if (a.title === b.title || summaryA === summaryB || tokenSetSimilarity(summaryA, summaryB) > 0.82) {
        return true;
      }
    }
  }
  return false;
}

function buildActiveSourceRefSet(memory: WorkingMemory): Set<string> {
  const active = new Set<string>();
  for (const head of memory.source_heads) {
    if (head.status === "active" && head.active_revision !== undefined) {
      active.add(`${head.source_id}@${head.active_revision}`);
    }
  }
  return active;
}

function activeSourceVersions(memory: WorkingMemory): SourceVersion[] {
  const activeRefs = buildActiveSourceRefSet(memory);
  return memory.source_versions.filter((sv) => !sv.untrusted && activeRefs.has(`${sv.source_id}@${sv.revision}`));
}

function evidenceFromSourceVersion(sv: SourceVersion, relevance: string): EvidenceLink {
  return {
    source_id: sv.source_id,
    source_revision: sv.revision,
    epistemic_status: "user_stated",
    evidence_shape: sv.kind === "question_answer" ? "concrete_scene" : "abstract_statement",
    relevance,
    excerpt: undefined,
  };
}

function makeEvidenceLinks(memory: WorkingMemory, fallbackFrom?: RouteIntent, count = 3): [EvidenceLink, ...EvidenceLink[]] {
  const active = activeSourceVersions(memory);
  const links: EvidenceLink[] = [];

  if (fallbackFrom?.evidence.length) {
    links.push(...fallbackFrom.evidence.slice(0, count));
  }

  for (const sv of active.slice(0, count)) {
    links.push(evidenceFromSourceVersion(sv, "本波回答"));
  }

  if (links.length === 0) {
    links.push({
      source_id: memory.session_id,
      source_revision: 1,
      epistemic_status: "working_inference",
      evidence_shape: "abstract_statement",
      relevance: "当前记忆尚未积累明确证据",
      excerpt: undefined,
    });
  }

  return links as [EvidenceLink, ...EvidenceLink[]];
}

export function buildPrototype(
  sessionId: string,
  provenanceId: string,
  trialId: string,
  lifeTitle: string,
  embedded?: PrototypeEmbed
): Prototype {
  const base = embedded ?? {
    hypothesis: `用三天小步验证「${lifeTitle}」这个方向是否真实适合自己。`,
    today_action: "列出这个方向需要接触的一个真实信息源，并预约一次简短访谈或体验。",
    what_to_observe: "注意自己的能量变化、完成最小动作后的感受，以及获得的新信息。",
    day_1: `接触一个与「${lifeTitle}」相关的真实信息源：人、作品、活动或环境。`,
    day_2: "做一次最小实践：旁听、阅读关键章节、完成一次模拟任务或记录一段真实场景。",
    day_3: "写下最明显的吸引点和最不适应的点，并判断是否值得继续。",
    time_ceiling_hours: 3,
    money_ceiling: "0 元或单次公共交通/一杯咖啡",
    reversible_because: "三天内只做观察与小步接触，不涉及离开、购买或向他人公开承诺，随时可停止。",
    feedback_source: "自己的能量变化、具体事件和可接触的人。",
    continue_signal: "想再试一次，或能说出至少一个真实吸引点。",
    pause_or_exit_note: "感到明显消耗、无法完成最小实践，或发现前提假设不成立时，可随时暂停或退出。",
    safety_check: "不透露真实身份信息给陌生人，不涉及金钱预付，不影响现有健康或照护安排。",
  };
  return {
    id: randomUUID(),
    session_id: sessionId,
    trial_id: trialId,
    generation_provenance_id: provenanceId,
    ...base,
  };
}

export function buildPrototypesForPlan(
  sessionId: string,
  plan: ParallelLivesPlan,
  provenanceId?: string
): Prototype[] {
  const provenanceIdToUse = provenanceId ?? plan.generation_provenance_id;
  return plan.lives.map((life) => buildPrototype(sessionId, provenanceIdToUse, life.trial_id, life.title, life.prototype));
}

function fallbackYearsForTitle(titleHint: string) {
  if (titleHint.includes("延续")) {
    return {
      year_2: "第二年：在现有轨道内争取更多解释空间，把可迁移能力打磨得更明显。",
      year_3: "第三年：获得一个能承载当前经验的新角色或项目，同时保留退出空间。",
    };
  }
  if (titleHint.includes("邻近") || titleHint.includes("转向")) {
    return {
      year_2: "第二年：把已有能力迁移到相邻领域，验证新方向的收入与节奏。",
      year_3: "第三年：形成一条半自主的新轨道，既有稳定来源也有继续扩展的出口。",
    };
  }
  if (titleHint.includes("释放")) {
    return {
      year_2: "第二年：降低固定成本后，允许自己尝试两到三个差异更大的小实验。",
      year_3: "第三年：把验证过的元素组合成一段更自由但可持续的生活模式。",
    };
  }
  return {
    year_2: "第二年：根据第一年反馈，决定是否扩大投入或调整比例。",
    year_3: "第三年：形成一段更稳定的生活模式，但仍保留退出空间。",
  };
}

function buildFallbackDayNarrative(titleHint: string, intent?: RouteIntent): DayNarrative {
  const rhythm = intent?.life_shape?.daily_rhythm ?? "日常";
  const people = intent?.life_shape?.relationships ?? "身边的人";
  return {
    scenes: [
      { text: `阳光从窗帘缝隙里漏进来，房间里很安静，能听见远处有鸟叫。` },
      { text: `出门前往包里塞了一本书，是上周读到一半没读完的那本。` },
      { text: `${rhythm}的节奏已经熟悉了，处理完手头的事，留出一小时给「${titleHint}」相关的探索。` },
      { text: `午后和${people}聊了几句，说了些今天遇到的琐事，对方听着，偶尔笑一下。` },
      { text: `窗外暗下来，路灯一盏接一盏亮了，走在回去的路上，风有点凉。` },
      { text: `关了灯，想着今天读到的那段话，想着想着就睡着了。` },
    ],
  };
}

export function buildFallbackDesignBasis(titleHint: string, index: number): DesignBasis {
  return {
    principle_refs: [`/analysis/design_principles/${index % 2}`],
    seed_ref: `/analysis/possibility_seeds/${index}`,
    lived_difference: `这条路围绕「${titleHint}」组织生活，与其他两条在节奏和重心上不同。`,
    narrative_anchor: `把对「${titleHint}」的探索变成一天里可以连续做完的一段。`,
    prototype_question: `「${titleHint}」这个方向是否值得继续了解。`,
  };
}

export function buildFallbackAnalysis(memory: WorkingMemory): Analysis {
  const evidence = makeEvidenceLinks(memory, undefined, 1);
  const emptyFinding: AnalysisFinding = {
    summary: "目前信息不足以形成判断。",
    kind: "working_inference",
    evidence_for: evidence,
    uncertainty: "需要更多采访才能确认。",
  };

  return {
    life_dashboard: {
      health: emptyFinding,
      work_learning: emptyFinding,
      play: null,
      relationships: emptyFinding,
      cross_domain_effects: [],
    },
    compass: {
      workview: emptyFinding,
      lifeview: null,
      alignments: [],
      tensions: [emptyFinding],
    },
    energy_patterns: [],
    problem_frame: {
      presenting_question: null,
      constraints: [],
      adjustable_factors: [],
      assumptions_to_test: [],
      design_question: emptyFinding,
    },
    possibility_seeds: [
      {
        direction: "延续当前道路",
        finding_refs: ["/analysis/life_dashboard/work_learning/finding"],
        structural_changes: [{ axis: "work_learning", change: "在现有轨道上深化" }],
        prerequisites: ["现有资源可继续支撑"],
      },
      {
        direction: "转向新方向",
        finding_refs: ["/analysis/compass/tensions/0/finding"],
        structural_changes: [{ axis: "daily_rhythm", change: "重新分配探索时间" }],
        prerequisites: ["新方向的基本条件可验证"],
      },
      {
        direction: "重新组合现有要素",
        finding_refs: ["/analysis/problem_frame/design_question/finding"],
        structural_changes: [{ axis: "meaning", change: "从不同角度理解已有积累" }],
        prerequisites: ["愿意重新定义当前问题"],
      },
    ],
    failure_learning: [],
    support_map: [],
    design_principles: [
      {
        principle: "保留学习的好奇心，同时为探索创造连续时间。",
        finding_refs: ["/analysis/life_dashboard/work_learning/finding"],
        tradeoff: "探索时间可能挤占休息。",
      },
      {
        principle: "先小步验证，再决定是否加大投入。",
        finding_refs: ["/analysis/problem_frame/design_question/finding"],
        tradeoff: null,
      },
    ],
  };
}

function buildFallbackPrototype(titleHint: string): PrototypeEmbed {
  return {
    hypothesis: `用三天小步验证「${titleHint}」这个方向是否真实适合自己。`,
    today_action: "列出这个方向需要接触的一个真实信息源，并预约一次简短访谈或体验。",
    what_to_observe: "注意自己的能量变化、完成最小动作后的感受，以及获得的新信息。",
    day_1: `接触一个与「${titleHint}」相关的真实信息源：人、作品、活动或环境。`,
    day_2: "做一次最小实践：旁听、阅读关键章节、完成一次模拟任务或记录一段真实场景。",
    day_3: "写下最明显的吸引点和最不适应的点，并判断是否值得继续。",
    time_ceiling_hours: 3,
    money_ceiling: "0 元或单次公共交通/一杯咖啡",
    reversible_because: "三天内只做观察与小步接触，不涉及离开、购买或向他人公开承诺，随时可停止。",
    feedback_source: "自己的能量变化、具体事件和可接触的人。",
    continue_signal: "想再试一次，或能说出至少一个真实吸引点。",
    pause_or_exit_note: "感到明显消耗、无法完成最小实践，或发现前提假设不成立时，可随时暂停或退出。",
    safety_check: "不透露真实身份信息给陌生人，不涉及金钱预付，不影响现有健康或照护安排。",
  };
}

function buildFallbackLifeFromRouteIntent(
  sessionId: string,
  provenanceId: string,
  intent: RouteIntent,
  memory: WorkingMemory
): ParallelLife {
  const years = fallbackYearsForTitle(intent.title_hint);
  const evidence = makeEvidenceLinks(memory, intent, 3);

  const relatedUncertainties = memory.uncertainties
    .filter((u) => u.status === "active" && u.related_route_intent_ids.includes(intent.id))
    .map((u) => u.question);

  const uncertainties: [string, ...string[]] =
    relatedUncertainties.length > 0
      ? (relatedUncertainties.slice(0, 2) as [string, ...string[]])
      : ["这个方向最大的不确定是什么。"];

  return {
    id: randomUUID(),
    route_intent_id: intent.id,
    generation_provenance_id: provenanceId,
    design_basis: buildFallbackDesignBasis(intent.title_hint, 0),
    title: intent.title_hint,
    core_experience: `在${intent.life_shape.daily_rhythm}的节奏里，逐步确认自己真正愿意重复的日常。`,
    year_1: `第一年：${intent.life_shape.work_or_study}，逐步验证这个方向的真实节奏。`,
    year_2: years.year_2,
    year_3: years.year_3,
    ordinary_day: `在${intent.life_shape.daily_rhythm}的节奏里，留出一小时给${intent.title_hint}，其余时间属于工作和${intent.life_shape.relationships}。`,
    day_narrative: buildFallbackDayNarrative(intent.title_hint, intent),
    attractions: [
      intent.life_shape.resources,
      "获得更明确的方向信息",
      "风险相对可控",
    ],
    costs_and_tradeoffs: [intent.real_cost, "前两年仍然需要在工作和探索之间分配时间", "可能错过更确定的短期机会"],
    evidence_for: evidence,
    assumptions: ["这个方向的真实节奏与想象中相差不大", "现实约束可以在两年内逐步调整"],
    uncertainties,
    risks: ["把坚持误当作成长", "探索变成只说不做", "现实约束比预期更硬"],
    prototype: buildFallbackPrototype(intent.title_hint),
    trial_id: randomUUID(),
  };
}

function buildGenericFallbackLife(
  sessionId: string,
  provenanceId: string,
  index: number,
  memory: WorkingMemory
): ParallelLife {
  const evidence = makeEvidenceLinks(memory, undefined, 1);

  return {
    id: randomUUID(),
    route_intent_id: randomUUID(),
    generation_provenance_id: provenanceId,
    design_basis: buildFallbackDesignBasis("探索型路线", index),
    title: "探索型路线",
    core_experience: "用更开放的节奏收集真实信息，先验证方向感再决定投入程度。",
    year_1: "第一年：降低固定成本，允许自己尝试不同方向。",
    year_2: "第二年：锁定一个或两个最有趣的实验，继续验证。",
    year_3: "第三年：把验证过的元素组合成更稳定的生活模式。",
    ordinary_day: "白天保留轻度收入来源，下午和晚上用于探索、访谈和小型实践。",
    day_narrative: buildFallbackDayNarrative("探索"),
    attractions: ["获得最大信息量", "更早知道自己不想要什么", "减少沉没成本"],
    costs_and_tradeoffs: ["收入和社会位置的不确定性增加", "身边人可能不理解"],
    evidence_for: evidence,
    assumptions: ["探索过程中能维持基本收入和身心健康"],
    uncertainties: ["资金来源和生活节奏能维持多久"],
    risks: ["探索变成漂移", "没有定期复盘", "外部压力导致过早放弃"],
    prototype: buildFallbackPrototype("探索型路线"),
    trial_id: randomUUID(),
  };
}

export function buildFallbackParallelLivesPlan(
  sessionId: string,
  memory: WorkingMemory,
  provisional: boolean,
  provenanceId: string
): ParallelLivesPlan {
  const activeIntents = memory.route_intents.filter((r) => r.status === "seed" || r.status === "accepted");
  const fromIntents = activeIntents.slice(0, 3).map((intent) => buildFallbackLifeFromRouteIntent(sessionId, provenanceId, intent, memory));

  const lives: ParallelLife[] = [...fromIntents];
  while (lives.length < 3) {
    lives.push(buildGenericFallbackLife(sessionId, provenanceId, lives.length, memory));
  }

  const fromUncertainties = memory.uncertainties
    .filter((u) => u.status === "active")
    .map((u) => u.question);

  const openQuestions: [string, ...string[]] =
    fromUncertainties.length > 0
      ? (fromUncertainties.slice(0, 3) as [string, ...string[]])
      : (lives.flatMap((l) => l.uncertainties).slice(0, 3) as [string, ...string[]]);

  return {
    id: randomUUID(),
    session_id: sessionId,
    generation_provenance_id: provenanceId,
    schema_version: "parallel-lives.v3",
    provisional: false,
    framing: "这是根据你目前回答生成的三种可能，不是预测，也不是建议。",
    blueprint: {
      current_coordinate: "站在继续积累和开始转向之间，两边都有吸引力但节奏不同。",
      key_tensions: ["稳定与探索之间的时间分配", "现有能力是否足以支撑新方向"],
      recurring_elements: ["保留学习的好奇心", "维持与身边人的关系"],
    },
    analysis: buildFallbackAnalysis(memory),
    lives: lives as [ParallelLife, ParallelLife, ParallelLife],
    shared_values: ["真实信息优先于过早决定", "允许自己先小步试玩"],
    real_tradeoff: "没有一条路能同时保留安全感、信息量和速度；重点是你愿意用三年时间验证哪个方向。",
    open_questions: openQuestions,
  };
}

function validateParallelLivesPlan(plan: ParallelLivesPlan, memory: WorkingMemory): { valid: true } | { valid: false; reason: string } {
  if (plan.lives.length !== 3) {
    return { valid: false, reason: `Expected 3 lives, got ${plan.lives.length}` };
  }

  const activeSourceRefs = buildActiveSourceRefSet(memory);

  for (const life of plan.lives) {
    if (containsRanking(`${life.title} ${life.year_1} ${life.year_3}`)) {
      return { valid: false, reason: `Ranking language detected in life ${life.id}` };
    }

    for (const link of life.evidence_for) {
      if (!activeSourceRefs.has(`${link.source_id}@${link.source_revision}`)) {
        return { valid: false, reason: `Life ${life.id} cites missing/inactive evidence ${link.source_id}@${link.source_revision}` };
      }
    }

    if (life.attractions.length === 0 || life.costs_and_tradeoffs.length === 0) {
      return { valid: false, reason: `Life ${life.id} missing attractions or costs_and_tradeoffs` };
    }

    if (life.evidence_for.length === 0) {
      return { valid: false, reason: `Life ${life.id} missing evidence_for` };
    }

    if (life.uncertainties.length === 0 || life.risks.length === 0) {
      return { valid: false, reason: `Life ${life.id} missing uncertainties or risks` };
    }

    if (life.ordinary_day.length < 10) {
      return { valid: false, reason: `Life ${life.id} ordinary day too short` };
    }
  }

  if (planNotDistinct(plan.lives)) {
    return { valid: false, reason: "Lives are not sufficiently distinct" };
  }

  return { valid: true };
}

function buildFinalEnvelope(input: SensemakerFinalInput): string {
  const memory = input.memory;

  const activeSourceRefs = buildActiveSourceRefSet(memory);
  const activeSources = memory.source_versions.filter((sv) => activeSourceRefs.has(`${sv.source_id}@${sv.revision}`));

  const claims = memory.claims
    .filter((c) => c.status === "active")
    .slice(0, 8)
    .map((c) => `- [${c.id}] ${c.text}`)
    .join("\n");

  const constraints = memory.constraints
    .filter((c) => c.status === "active")
    .slice(0, 8)
    .map((c) => `- [${c.id}] (${c.kind}, ${c.flexibility}) ${c.text}`)
    .join("\n");

  const routeIntents = memory.route_intents
    .filter((r) => r.status === "seed" || r.status === "accepted")
    .slice(0, 6)
    .map((r) => `- [${r.id}] ${r.title_hint}｜成本：${r.real_cost}｜日常：${r.life_shape.daily_rhythm}`)
    .join("\n");

  const radar = Object.entries(memory.radar)
    .map(([dimension, cell]) => `- ${dimension}: ${cell.state} — ${cell.reason}`)
    .join("\n");

  const sourceVersions = activeSources
    .slice(-20)
    .map((sv) => `- [${sv.source_id}@${sv.revision}] kind=${sv.kind}, text_ref=${sv.text_ref}`)
    .join("\n");

  const uncertainties = memory.uncertainties
    .filter((u) => u.status === "active")
    .slice(0, 6)
    .map((u) => `- [${u.id}] ${u.topic}`)
    .join("\n");

  return [
    "mode: parallel_lives",
    `session_id: ${memory.session_id}`,
    `memory_revision: ${memory.revision}`,
    `provisional: false`,
    `stop_reason: ${input.stop_reason}`,
    "",
    memory.persona_portrait ? portraitToContext(memory.persona_portrait) : "=== 综合画像（persona portrait）===\n（暂未生成，请直接基于以下 claims 和 radar 生成）",
    "",
    "=== 理解（claims）===",
    claims || "（暂无）",
    "",
    "=== 约束（constraints）===",
    constraints || "（暂无）",
    "",
    "=== 路线意图（route_intents）===",
    routeIntents || "（暂无）",
    "",
    "=== 雷达 ===",
    radar || "（暂无）",
    "",
    "=== 来源版本 ===",
    sourceVersions || "（暂无）",
    "",
    "=== 尚未解决的问题（uncertainties）===",
    uncertainties || "（暂无）",
    "",
    "=== 用户备注 ===",
    input.final_user_note || "（无）",
    "",
    "注意：只输出符合 ParallelLivesPlan schema 的纯 JSON 对象。必须为每条生活提供一个 trial_id；不要把完整的 prototype 嵌入生活。",
    "每条 life.evidence_for 中的 source_id 和 source_revision 必须严格来自上文 '=== 来源版本 ===' 中列出的活跃来源，使用对应的精确 source_id 和 revision，不要自行递增或假设版本号。",
  ].join("\n");
}

function makePrompt(input: SensemakerFinalInput): string {
  return composePrompt<ParallelLivesPlan>(
    "sensemaker_futures",
    buildFinalEnvelope(input),
    parallelLivesPlanSchema as z.ZodType<ParallelLivesPlan, z.ZodTypeDef, unknown>
  );
}

export type SensemakerFinalOutput = ParallelLivesPlan & {
  prototypes: Prototype[];
};

export class FinalGenerationError extends Error {
  constructor(message: string, readonly reason: "validation" | "provider" | "timeout") {
    super(message);
    this.name = "FinalGenerationError";
  }
}

export async function runSensemakerFinal(input: SensemakerFinalInput): Promise<SensemakerFinalOutput> {
  const sessionId = input.memory.session_id;
  const config = getProviderConfig();
  const provenanceId = randomUUID();

  let raw: ParallelLivesPlan;
  try {
    raw = await generateStructured<ParallelLivesPlan>({
      purpose: "sensemaker_final",
      session_id: sessionId,
      prompt: makePrompt(input),
      schema: parallelLivesPlanSchema as z.ZodType<ParallelLivesPlan, z.ZodTypeDef, unknown>,
      max_tokens: 16000,
      timeout_ms: 180000,
      max_retries: 0,
      prompt_version: PROMPT_VERSION,
      enableThinking: true,
      fixture: () => Promise.resolve(buildFallbackParallelLivesPlan(sessionId, input.memory, input.provisional, provenanceId)),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "unknown error";
    console.error("Sensemaker final provider call failed:", msg);
    throw new FinalGenerationError(`生成失败：${msg}`, "provider");
  }

  const plan: ParallelLivesPlan = {
    ...raw,
    id: raw.id ?? randomUUID(),
    session_id: raw.session_id ?? sessionId,
    generation_provenance_id: raw.generation_provenance_id ?? provenanceId,
    schema_version: "parallel-lives.v3",
    provisional: false,
    blueprint: raw.blueprint,
    lives: raw.lives.map((life) => ({
      ...life,
      id: life.id ?? randomUUID(),
      generation_provenance_id: life.generation_provenance_id ?? provenanceId,
      trial_id: life.trial_id ?? randomUUID(),
    })) as [ParallelLife, ParallelLife, ParallelLife],
  };

  const coerced = coerceEvidenceToActiveHeads(plan, input.memory);

  const validation = validateParallelLivesPlan(coerced, input.memory);
  if (!validation.valid) {
    console.error("Final plan validation failed:", validation.reason);
    throw new FinalGenerationError(
      `生成内容未通过校验：${validation.reason}。请重试，如果多次失败请联系管理员。`,
      "validation",
    );
  }

  return withPrototypes(coerced, sessionId, config);
}

function withPrototypes(plan: ParallelLivesPlan, sessionId: string, _config: ProviderConfig): SensemakerFinalOutput {
  const prototypes = buildPrototypesForPlan(sessionId, plan, plan.generation_provenance_id);
  return { ...plan, prototypes };
}

function coerceEvidenceToActiveHeads(plan: ParallelLivesPlan, memory: WorkingMemory): ParallelLivesPlan {
  const activeRevisions = new Map<string, number>();
  for (const head of memory.source_heads) {
    if (head.status === "active" && head.active_revision !== undefined) {
      activeRevisions.set(head.source_id, head.active_revision);
    }
  }

  const correctedLives = plan.lives.map((life) => ({
    ...life,
    evidence_for: life.evidence_for.map((link) => {
      const activeRevision = activeRevisions.get(link.source_id);
      if (activeRevision !== undefined) {
        return { ...link, source_revision: activeRevision };
      }
      return link;
    }),
  })) as [ParallelLife, ParallelLife, ParallelLife];

  return { ...plan, lives: correctedLives };
}
