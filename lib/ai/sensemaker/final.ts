// Sensemaker final — generates three equal, evidence-linked, distinct three-year lives.
// See .loom/design/insight-plan-contracts.md § Final three-year plan contract

import { z } from "zod";
import { generateStructured, getProviderConfig } from "@/lib/ai/client";
import type { ProviderConfig } from "@/lib/ai/client";
import type { FinalPlan, ParallelLife, Prototype, WorkingMemory, EvidenceLink, SensemakerFinalInput } from "@/lib/working-memory/types";

const prototypeSchema = z.object({
  hypothesis: z.string().min(1).max(200),
  today_action: z.string().min(1).max(240),
  what_to_observe: z.string().min(1).max(240),
  day_1: z.string().min(1).max(240),
  day_2: z.string().min(1).max(240),
  day_3: z.string().min(1).max(240),
  time_ceiling_hours: z.number().min(0.5).max(6),
  money_ceiling: z.string().min(1).max(60),
  reversible_because: z.string().min(1).max(240),
  feedback_source: z.string().min(1).max(120),
  continue_signal: z.string().min(1).max(120),
  pause_or_exit_note: z.string().min(1).max(240),
  safety_check: z.string().min(1).max(240),
});

const evidenceLinkSchema = z.object({
  evidence_id: z.string().min(1),
  supports: z.string().min(1).max(80),
});

const parallelLifeSchema = z
  .object({
    id: z.string().min(1),
    title: z.string().min(1).max(40),
    core_experience: z.string().min(1).max(80),
    year_1: z.string().min(1).max(80),
    year_2: z.string().min(1).max(80),
    year_3: z.string().min(1).max(80),
    ordinary_day: z.string().min(1).max(120),
    attractions: z.array(z.string().min(1).max(80)).min(1).max(4),
    costs_and_tradeoffs: z.array(z.string().min(1).max(80)).min(1).max(4),
    evidence_for: z.array(evidenceLinkSchema).min(1).max(5),
    assumptions: z.array(z.string().min(1).max(80)).min(0).max(4),
    uncertainties: z.array(z.string().min(1).max(100)).min(1).max(3),
    risks: z.array(z.string().min(1).max(100)).min(1).max(3),
    trial: prototypeSchema,
  })
  .strict();

const finalPlanSchema = z
  .object({
    framing: z.string().min(1).max(280),
    lives: z.array(parallelLifeSchema).length(3),
    shared_values: z.array(z.string().min(1).max(120)).max(6),
    real_tradeoff: z.string().min(1).max(280),
    open_questions: z.array(z.string().min(1).max(240)).max(6),
  })
  .strict();

const PROMPT_VERSION = "sensemaker.final.v2";

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

function validateFinalPlan(plan: FinalPlan, memory: WorkingMemory): { valid: true } | { valid: false; reason: string } {
  if (plan.lives.length !== 3) {
    return { valid: false, reason: `Expected 3 lives, got ${plan.lives.length}` };
  }

  const activeEvidenceIds = new Set(memory.evidence.filter((e) => e.status === "active").map((e) => e.id));

  for (const life of plan.lives) {
    if (containsRanking(life.title + life.year_1 + life.year_3)) {
      return { valid: false, reason: `Ranking language detected in life ${life.id}` };
    }

    for (const link of life.evidence_for) {
      if (!activeEvidenceIds.has(link.evidence_id)) {
        return { valid: false, reason: `Life ${life.id} cites missing/inactive evidence ${link.evidence_id}` };
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

    if (life.trial.time_ceiling_hours < 0.5 || life.trial.time_ceiling_hours > 6) {
      return { valid: false, reason: `Life ${life.id} trial time ceiling out of range` };
    }

    const allTrialText = `${life.trial.hypothesis} ${life.trial.day_1} ${life.trial.day_2} ${life.trial.day_3} ${life.trial.reversible_because}`;
    if (containsIrreversible(allTrialText)) {
      return { valid: false, reason: `Life ${life.id} trial contains irreversible action` };
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

function makeEvidenceLinks(memory: WorkingMemory, count = 3): [EvidenceLink, ...EvidenceLink[]] {
  const active = memory.evidence.filter((e) => e.status === "active");
  const links = active
    .slice(0, count)
    .map((e) => ({ evidence_id: e.id, supports: e.statement.slice(0, 80) }));
  if (links.length === 0) {
    return [{ evidence_id: "no-evidence", supports: "当前记忆尚未积累明确证据" }];
  }
  return links as [EvidenceLink, ...EvidenceLink[]];
}

function buildFallbackPrototype(): Prototype {
  return {
    hypothesis: "这个方向的日常是否真的适合自己。",
    today_action: "花 30 分钟列出这个方向需要接触的真实信息源，并预约一次简短访谈或体验。",
    what_to_observe: "注意自己的能量变化、完成最小动作后的感受，以及获得的新信息。",
    day_1: "接触一个真实信息源：人、作品、活动或环境。",
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

function fallbackYearsForSeed(seed: { title_hint: string; life_shape: string }) {
  const hint = seed.title_hint;
  if (hint.includes("延续")) {
    return {
      year_2: "第二年：在现有轨道内争取更多解释空间，把可迁移能力打磨得更明显。",
      year_3: "第三年：获得一个能承载当前经验的新角色或项目，同时保留退出空间。",
    };
  }
  if (hint.includes("邻近转向")) {
    return {
      year_2: "第二年：把已有能力迁移到相邻领域，验证新方向的收入与节奏。",
      year_3: "第三年：形成一条半自主的新轨道，既有稳定来源也有继续扩展的出口。",
    };
  }
  if (hint.includes("释放")) {
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

function buildRawFallbackFinalPlan(sessionId: string, memory: WorkingMemory, provisional: boolean): z.infer<typeof finalPlanSchema> {
  const activeSeeds = memory.route_seeds.filter((r) => r.status === "active");
  const seeds = activeSeeds.length >= 3 ? activeSeeds.slice(0, 3) : activeSeeds;

  const lives: ParallelLife[] = seeds.map((seed, idx) => {
    const evidenceIds = [...seed.appeal_evidence_ids, ...seed.feasibility_evidence_ids]
      .filter((id) => memory.evidence.some((e) => e.id === id && e.status === "active"));

    const evidence: [EvidenceLink, ...EvidenceLink[]] = evidenceIds.length > 0
      ? (evidenceIds.slice(0, 3).map((id) => {
          const e = memory.evidence.find((x) => x.id === id)!;
          return { evidence_id: id, supports: e.statement.slice(0, 80) };
        }) as [EvidenceLink, ...EvidenceLink[]])
      : makeEvidenceLinks(memory, 1);

    const relatedUncertainties = memory.uncertainties
      .filter((u) => u.status === "active" && (seed.uncertainty_ids.includes(u.id) || u.related_route_seed_ids.includes(seed.id)))
      .map((u) => u.question);

    const uncertainties: [string, ...string[]] = relatedUncertainties.length > 0
      ? (relatedUncertainties.slice(0, 2) as [string, ...string[]])
      : ["这个方向最大的不确定是什么。"];

    const years = fallbackYearsForSeed(seed);

    return {
      id: seed.id,
      title: seed.title_hint,
      core_experience: `在${seed.life_shape}的节奏里，逐步确认自己真正愿意重复的日常。`,
      year_1: `第一年：${seed.life_shape}，逐步验证这个方向的真实节奏。`,
      year_2: years.year_2,
      year_3: years.year_3,
      ordinary_day: `上午处理主线事务，下午留出一小时用于${seed.title_hint}相关探索，晚上做简短记录。`,
      attractions: ["利用现有经验和资源", "获得更明确的方向信息", "风险相对可控"],
      costs_and_tradeoffs: ["前两年仍然需要在工作和探索之间分配时间", "可能错过更确定的短期机会"],
      evidence_for: evidence,
      assumptions: ["这个方向的真实节奏与想象中相差不大", "现实约束可以在两年内逐步调整"],
      uncertainties,
      risks: ["把坚持误当作成长", "探索变成只说不做", "现实约束比预期更硬"],
      trial: buildFallbackPrototype(),
    };
  });

  if (lives.length < 3) {
    // Should not happen in normal flow, but keep the contract intact.
    while (lives.length < 3) {
      const id = `fallback-${lives.length}`;
      lives.push({
        id,
        title: "探索型路线",
        core_experience: "用更开放的节奏收集真实信息，先验证方向感再决定投入程度。",
        year_1: "第一年：降低固定成本，允许自己尝试不同方向。",
        year_2: "第二年：锁定一个或两个最有趣的实验，继续验证。",
        year_3: "第三年：把验证过的元素组合成更稳定的生活模式。",
        ordinary_day: "白天保留轻度收入来源，下午和晚上用于探索、访谈和小型实践。",
        attractions: ["获得最大信息量", "更早知道自己不想要什么", "减少沉没成本"],
        costs_and_tradeoffs: ["收入和社会位置的不确定性增加", "身边人可能不理解"],
        evidence_for: makeEvidenceLinks(memory, 1),
        assumptions: ["探索过程中能维持基本收入和身心健康"],
        uncertainties: ["资金来源和生活节奏能维持多久"],
        risks: ["探索变成漂移", "没有定期复盘", "外部压力导致过早放弃"],
        trial: buildFallbackPrototype(),
      });
    }
  }

  return {
    framing: provisional
      ? "这是根据你目前回答生成的三种可能，只是暂定路线，不是预测，也不是建议。"
      : "这是根据你目前回答生成的三种可能，不是预测，也不是建议。",
    lives: lives as [ParallelLife, ParallelLife, ParallelLife],
    shared_values: ["真实信息优先于过早决定", "允许自己先小步试玩"],
    real_tradeoff: "没有一条路能同时保留安全感、信息量和速度；重点是你愿意用三年时间验证哪个方向。",
    open_questions: (() => {
      const fromUncertainties = memory.uncertainties.filter((u) => u.status === "active").map((u) => u.question);
      if (fromUncertainties.length > 0) return fromUncertainties;
      const fromLives = [...new Set(lives.flatMap((l) => l.uncertainties))];
      if (fromLives.length > 0) return fromLives;
      return ["当前最需要澄清的未知是什么"];
    })(),
  };
}

function toFinalPlan(
  raw: z.infer<typeof finalPlanSchema>,
  sessionId: string,
  memory: WorkingMemory,
  provisional: boolean,
  config: ProviderConfig
): FinalPlan {
  return {
    schema_version: "parallel-lives.v2",
    session_id: sessionId,
    memory_revision: memory.revision,
    provisional,
    framing: raw.framing,
    lives: raw.lives as [ParallelLife, ParallelLife, ParallelLife],
    shared_values: raw.shared_values.slice(0, 6),
    real_tradeoff: raw.real_tradeoff,
    open_questions: raw.open_questions.slice(0, 6),
    generated_at: new Date().toISOString(),
    prompt_version: PROMPT_VERSION,
    model_config_id: `${config.provider}/${config.model}`,
  };
}

function buildFallbackFinalPlan(sessionId: string, memory: WorkingMemory, provisional: boolean, config: ProviderConfig): FinalPlan {
  return toFinalPlan(buildRawFallbackFinalPlan(sessionId, memory, provisional), sessionId, memory, provisional, config);
}

function makePrompt(input: SensemakerFinalInput): string {
  const memory = input.memory;
  const evidence = memory.evidence
    .filter((e) => e.status === "active")
    .slice(0, 8)
    .map((e) => `- [${e.id}] ${e.statement}（${e.epistemic}）`)
    .join("\n");

  const claims = memory.claims
    .filter((c) => c.status === "active")
    .map((c) => `- ${c.text}`)
    .join("\n");

  const constraints = memory.constraints
    .filter((c) => c.status === "active")
    .map((c) => `- ${c.text}`)
    .join("\n");

  const seeds = memory.route_seeds
    .filter((r) => r.status === "active")
    .map((r) => `- ${r.title_hint}：${r.life_shape}（区别在：${r.distinct_on}）`)
    .join("\n");

  const uncertainties = memory.uncertainties
    .filter((u) => u.status === "active")
    .map((u) => `- ${u.question}`)
    .join("\n");

  return [
    `你是一名 Sensemaker Agent。请根据下面的 WorkingMemory，输出三条平行的三年人生计划（FinalPlan）。`,
    ``,
    `要求：`,
    `- 三条路线地位完全平等，不排名，不推荐，不使用"最佳""最适合""推荐""Plan B"等语言。`,
    `- 每条路线是完整生活画面，不只是职位名；必须包含工作/学习、关系/社交、健康/能量、生活地点/节奏。`,
    `- 每条路线包含：id、标题（≤12字）、core_experience（一句话核心体验，≤40字）、year_1 / year_2 / year_3（各 1-2 句，≤40字/句，形成三年走向）、一个 ordinary_day（≤80字）、1-4 个 attractions（≤40字/条）、1-4 个 costs_and_tradeoffs（≤40字/条）、1-5 条 evidence_for（每条引用 evidence_id 并说明支持点，≤40字）、0-4 个 assumptions（≤40字/条）、1-3 个 uncertainties（≤50字/条）、1-3 个 risks（≤50字/条）、一个 trial（Prototype）。`,
    `- evidence_for 必须使用下面"可用证据"列表中的 exact evidence_id，并说明它支持哪一句话。`,
    `- trial（Prototype）必须低成本、可逆：包含 hypothesis（≤60字）、today_action（今天就能做的最小动作，≤60字）、what_to_observe（≤60字）、day_1/2/3（≤60字/条）、time_ceiling_hours（0.5-6）、money_ceiling（≤20字）、reversible_because（≤60字）、feedback_source（≤40字）、continue_signal（≤40字）、pause_or_exit_note（≤60字）、safety_check（≤60字）。`,
    `- 三条路线必须在日常生活、工作模式、社交环境、地点、责任层级或身份来源上明显不同，不能只是同一职位换公司。`,
    `- framing：一句话说明这是可能性，不是预测或建议。`,
    `- shared_values：2-6 条你假设用户可能看重的价值。`,
    `- real_tradeoff：一句说明没有完美路线。`,
    `- open_questions：列出尚未回答的关键问题。`,
    ``,
    `当前记忆摘要：`,
    ``,
    `理解（claims）：`,
    claims || "（暂无）",
    ``,
    `约束（constraints）：`,
    constraints || "（暂无）",
    ``,
    `路线种子（route_seeds）：`,
    seeds || "（暂无）",
    ``,
    `可用证据（evidence）：`,
    evidence || "（暂无）",
    ``,
    `尚未解决的问题（uncertainties）：`,
    uncertainties || "（暂无）",
    ``,
    `用户备注：`,
    input.final_user_note || "（无）",
  ].join("\n");
}

export async function runSensemakerFinal(
  sessionId: string,
  memory: WorkingMemory,
  options: { provisional?: boolean; stop_reason?: SensemakerFinalInput["stop_reason"]; final_user_note?: string } = {}
): Promise<FinalPlan> {
  const provisional = options.provisional ?? memory.last_wave_index < 2;
  const stopReason = options.stop_reason ?? "sufficient";
  const config = getProviderConfig();

  const input: SensemakerFinalInput = {
    schema_version: "sensemaker.final.input.v1",
    memory,
    stop_reason: stopReason,
    provisional,
    final_user_note: options.final_user_note,
    prompt_version: PROMPT_VERSION,
  };

  try {
    const raw = await generateStructured({
      purpose: "sensemaker_final",
      session_id: sessionId,
      prompt: makePrompt(input),
      schema: finalPlanSchema,
      max_tokens: 3000,
      prompt_version: "sensemaker.final.v2",
      fixture: () => Promise.resolve(buildRawFallbackFinalPlan(sessionId, memory, provisional)),
    });

    const plan = toFinalPlan(raw, sessionId, memory, provisional, config);

    const validation = validateFinalPlan(plan, memory);
    if (validation.valid) {
      return plan;
    }

    console.error("Final plan validation failed, using fallback:", validation.reason);
    return buildFallbackFinalPlan(sessionId, memory, provisional, config);
  } catch (err) {
    console.error("Sensemaker final failed, using fallback:", err instanceof Error ? err.message : "unknown");
    return buildFallbackFinalPlan(sessionId, memory, provisional, config);
  }
}
