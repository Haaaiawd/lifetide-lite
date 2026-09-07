// Sensemaker final — generates three equal, evidence-linked, distinct three-year lives.
// Uses the authoritative v3 ParallelLivesPlan contract from lib/state/contracts.ts.
// See .loom/design/insight-plan-contracts.md § Final three-year plan contract

import { randomUUID } from "node:crypto";
import { z } from "zod";
import { streamStructured, getProviderConfig } from "@/lib/ai/client";
import { composePrompt } from "@/lib/ai/prompts/compose";
import { parallelLivesPlanSchema, parallelLifeSchema, analysisFindingSchema } from "@/lib/state/contracts";
import { portraitToContext } from "@/lib/ai/sensemaker/portrait";
import type { EvidenceLink, SourceVersion, SourceHead, WorkingMemory, SensemakerFinalInput } from "@/lib/working-memory/types";
import type { RouteIntent, Prototype, ParallelLife, ParallelLivesPlan, PrototypeEmbed, DayNarrative, Analysis, AnalysisFinding, DesignBasis } from "@/lib/state/contracts";
import type { ProviderConfig } from "@/lib/ai/client";

const PROMPT_VERSION = "sensemaker.final.v3";

/**
 * AI models sometimes return plain strings for AnalysisFinding arrays
 * (e.g. constraints: ["need income", "family expectations"]) instead of
 * the full object shape ({summary, kind, evidence_for, uncertainty}).
 * This preprocessor coerces strings into minimal AnalysisFinding objects
 * so schema validation passes without losing the semantic content.
 */
const coerceFinding = z.preprocess((val) => {
  if (typeof val === "string") {
    return { summary: val, kind: "working_inference", evidence_for: [], uncertainty: null };
  }
  return val;
}, analysisFindingSchema);

const coerceFindingArray = z.array(coerceFinding);

const coercedProblemFrameSchema = z.object({
  presenting_question: z.string().nullable(),
  constraints: coerceFindingArray,
  adjustable_factors: coerceFindingArray,
  assumptions_to_test: coerceFindingArray,
  design_question: coerceFinding.nullable(),
});

// Build the generation schema: accept compact analysis findings while requiring
// the new full appellation that remains optional only for stored-plan compatibility.
const generatedParallelLifeSchema = parallelLifeSchema.extend({
  title_full: z.string().min(6).max(10),
});

const coercedPlanSchema = parallelLivesPlanSchema.extend({
  analysis: parallelLivesPlanSchema.shape.analysis.extend({
    problem_frame: coercedProblemFrameSchema,
  }),
  lives: z.array(generatedParallelLifeSchema).length(3),
});

const RANKING_TERMS = ["最佳", "最好", "最适合你", "推荐", "首选", "安全选择", "冠军", "plan b", "b 计划", "最安全"];
const IRREVERSIBLE_TERMS = ["辞职", "退学", "搬家", "贷款", "手术", "分手", "离婚", "断绝", "公开宣布", "卖房", "卖车", "起诉", "签约三年"];

function containsRanking(text: string): boolean {
  const lowered = text.toLowerCase();
  return RANKING_TERMS.some((t) => lowered.includes(t));
}

function containsIrreversible(text: string): boolean {
  return IRREVERSIBLE_TERMS.some((t) => text.includes(t));
}

export function tokenSetSimilarity(a: string, b: string): number {
  // For Chinese text, whitespace tokenization is ineffective.
  // Use character bigram overlap as the primary signal, which captures
  // shared phrases and vocabulary without requiring a segmentation library.
  const bigramsA = charBigrams(a);
  const bigramsB = charBigrams(b);
  if (bigramsA.size === 0 && bigramsB.size === 0) return 1;
  if (bigramsA.size === 0 || bigramsB.size === 0) return 0;
  const intersection = new Set([...bigramsA].filter((x) => bigramsB.has(x)));
  const union = new Set([...bigramsA, ...bigramsB]);
  return intersection.size / union.size;
}

function charBigrams(text: string): Set<string> {
  const chars = [...text].filter((c) => c.trim().length > 0 && !/\s/.test(c));
  const bigrams = new Set<string>();
  for (let i = 0; i < chars.length - 1; i++) {
    bigrams.add(chars[i] + chars[i + 1]);
  }
  return bigrams;
}

// Structural axes that should differ across lives. Two lives that share the
// same root in their title or read nearly identically across these axes are
// not meaningfully distinct, even if job titles or salaries differ.
const STRUCTURAL_AXES = ["ordinary_day", "core_experience", "year_1"] as const;

export function planNotDistinct(lives: ParallelLife[]): boolean {
  for (let i = 0; i < lives.length; i++) {
    for (let j = i + 1; j < lives.length; j++) {
      const a = lives[i];
      const b = lives[j];

      // Exact title or full-summary match is always a failure.
      const summaryA = `${a.title} ${a.core_experience} ${a.ordinary_day} ${a.year_1}`;
      const summaryB = `${b.title} ${b.core_experience} ${b.ordinary_day} ${b.year_1}`;
      if (a.title === b.title || summaryA === summaryB) {
        return true;
      }

      // High overall similarity means the lives are paraphrases, not distinct.
      if (tokenSetSimilarity(summaryA, summaryB) > 0.82) {
        return true;
      }

      // Check that at least 2 of 3 structural axes are clearly different.
      // "Clearly different" = bigram similarity below 0.75 on that axis.
      let similarAxes = 0;
      for (const axis of STRUCTURAL_AXES) {
        const axisSim = tokenSetSimilarity(
          String(a[axis] ?? ""),
          String(b[axis] ?? "")
        );
        if (axisSim >= 0.75) similarAxes++;
      }
      if (similarAxes >= 2) {
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
    hypothesis: `花三天看看，「${lifeTitle}」过起来到底像不像你。`,
    today_action: "找一个正在过这种生活的人，问他能不能聊二十分钟；只问一天怎么过，别先问成不成功。",
    what_to_observe: "记住哪一刻你忘了看时间，哪一刻你只想赶快结束。",
    day_1: `找一个最接近「${lifeTitle}」的人、地方或作品，真正靠近一次。`,
    day_2: "亲手做一件这条路上每天都会做的小事，哪怕只做半小时。",
    day_3: "写下还想再来一次的瞬间，以及再也不想忍受的部分。",
    time_ceiling_hours: 3,
    money_ceiling: "0 元或单次公共交通/一杯咖啡",
    reversible_because: "三天内只做观察与小步接触，不涉及离开、购买或向他人公开承诺，随时可停止。",
    feedback_source: "做完以后，你还想不想再来一次，以及那个正在过这种生活的人说了什么。",
    continue_signal: "三天结束后，你已经在想下一次要做什么。",
    pause_or_exit_note: "如果每次都只剩硬撑，或者真实日常和想象完全不是一回事，就先停。",
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
      year_2: "第二年：手上的旧事还在做，但别人开始因为另一件事来找你。",
      year_3: "第三年：那件原本只占一小块时间的事，已经能在生活里站稳脚。",
    };
  }
  if (titleHint.includes("邻近") || titleHint.includes("转向")) {
    return {
      year_2: "第二年：你不再从头学起，过去会的东西开始在新地方派上用场。",
      year_3: "第三年：新生活能付一部分账单，旧生活也还没有被你一把推开。",
    };
  }
  if (titleHint.includes("释放")) {
    return {
      year_2: "第二年：花销少了一些，试过的事多了几件，其中有一件总让你想回去。",
      year_3: "第三年：你没有找到标准答案，只是终于知道哪些日子愿意再过一遍。"
    };
  }
  return {
    year_2: "第二年：做过几次以后，你知道该多留一点时间，还是到这里就够了。",
    year_3: "第三年：生活有了新的重心，但你仍然可以转身。"
  };
}

function buildFallbackDayNarrative(titleHint: string, intent?: RouteIntent): DayNarrative {
  const rhythm = intent?.life_shape?.daily_rhythm ?? "日常";
  const people = intent?.life_shape?.relationships ?? "身边的人";
  return {
    scenes: [
      { text: `阳光从窗帘缝隙里漏进来，房间里很安静，能听见远处有鸟叫。` },
      { text: `烧了一壶水，等水开的时候靠在灶台边发了会儿呆。` },
      { text: `出门前往包里塞了一本书，是上周读到一半没读完的那本。` },
      { text: `路上经过那家熟悉的早点铺，老板娘照例多问了一句今天怎么这么早。` },
      { text: `${rhythm}的节奏已经熟悉了，处理完手头的事，留出一小时给「${titleHint}」相关的探索。` },
      { text: `中午一个人在楼下慢慢吃完，顺手把上午冒出来的一个想法记在了手机备忘录里。` },
      { text: `午后和${people}聊了几句，说了些今天遇到的琐事，对方听着，偶尔笑一下。` },
      { text: `下午有一段不那么顺的时候，喝了口水，把事情重新拆小，一件一件来。` },
      { text: `傍晚收工时天色还亮着，绕道走了一条不常走的路回家。` },
      { text: `窗外暗下来，路灯一盏接一盏亮了，走在回去的路上，风有点凉。` },
      { text: `睡前翻了几页那本没读完的书，恰好读到一句让人停下来的话。` },
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
    hypothesis: `花三天看看，「${titleHint}」过起来到底像不像你。`,
    today_action: "找一个正在过这种生活的人，问他能不能聊二十分钟；只问一天怎么过，别先问成不成功。",
    what_to_observe: "记住哪一刻你忘了看时间，哪一刻你只想赶快结束。",
    day_1: `找一个最接近「${titleHint}」的人、地方或作品，真正靠近一次。`,
    day_2: "亲手做一件这条路上每天都会做的小事，哪怕只做半小时。",
    day_3: "写下还想再来一次的瞬间，以及再也不想忍受的部分。",
    time_ceiling_hours: 3,
    money_ceiling: "0 元或单次公共交通/一杯咖啡",
    reversible_because: "三天内只做观察与小步接触，不涉及离开、购买或向他人公开承诺，随时可停止。",
    feedback_source: "做完以后，你还想不想再来一次，以及那个正在过这种生活的人说了什么。",
    continue_signal: "三天结束后，你已经在想下一次要做什么。",
    pause_or_exit_note: "如果每次都只剩硬撑，或者真实日常和想象完全不是一回事，就先停。",
    safety_check: "不透露真实身份信息给陌生人，不涉及金钱预付，不影响现有健康或照护安排。",
  };
}

function buildFallbackLifeFromRouteIntent(
  sessionId: string,
  provenanceId: string,
  intent: RouteIntent,
  memory: WorkingMemory,
  index: number
): ParallelLife {
  const years = fallbackYearsForTitle(intent.title_hint);
  const evidence = makeEvidenceLinks(memory, intent, 3);

  const relatedUncertainties = memory.uncertainties
    .filter((u) => u.status === "active" && u.related_route_intent_ids.includes(intent.id))
    .map((u) => u.question);

  const uncertainties: [string, ...string[]] =
    relatedUncertainties.length > 0
      ? (relatedUncertainties.slice(0, 2) as [string, ...string[]])
      : ["真正连着过一个月以后，你还会想继续吗？"];

  const appellations = [
    { title: "未熄者", full: "安稳藏火的未熄者" },
    { title: "借火者", full: "手握退路的借火者" },
    { title: "夜渡者", full: "白日守岸的夜渡者" },
  ];
  const appellation = appellations[index % appellations.length];

  return {
    id: randomUUID(),
    route_intent_id: intent.id,
    generation_provenance_id: provenanceId,
    design_basis: buildFallbackDesignBasis(intent.title_hint, index),
    title: appellation.title,
    title_full: appellation.full,
    core_experience: `你不必马上推翻现在的生活，只是每天会有一段时间，终于轮到那件一直想做的事。`,
    year_1: `第一年：${intent.life_shape.work_or_study}；最初很生疏，但日历上已经有一块时间真正属于它。`,
    year_2: years.year_2,
    year_3: years.year_3,
    ordinary_day: `${intent.life_shape.daily_rhythm}；忙完手上的事，仍给那件想了很久的事留一小时，也没有把${intent.life_shape.relationships}丢在身后。`,
    day_narrative: buildFallbackDayNarrative(intent.title_hint, intent),
    attractions: [
      intent.life_shape.resources,
      "终于知道想象里的日子过起来是什么滋味",
      "不用先把现在拥有的一切推倒",
    ],
    costs_and_tradeoffs: [intent.real_cost, "前两年下班后仍有另一件事等着你，真正休息的晚上会变少", "有人已经往前走时，你可能还在两条路之间来回"],
    evidence_for: evidence,
    assumptions: ["真正过起来以后，它没有比想象中更耗人", "钱、时间和身边人的需要还留得出一点空隙"],
    uncertainties,
    risks: ["已经很累了，还把硬撑当成舍不得放手", "总在谈这条路，却一直没真正过上一天", "钱和时间比现在想的更不够用"],
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
  const appellations = [
    { title: "探路者", full: "迷雾点灯的探路者" },
    { title: "借火者", full: "手握退路的借火者" },
    { title: "夜渡者", full: "白日守岸的夜渡者" },
  ];
  const appellation = appellations[index % appellations.length];

  return {
    id: randomUUID(),
    route_intent_id: randomUUID(),
    generation_provenance_id: provenanceId,
    design_basis: buildFallbackDesignBasis("探索型路线", index),
    title: appellation.title,
    title_full: appellation.full,
    core_experience: "先不急着决定余生，只把不同的日子真的过一遍。",
    year_1: "第一年：花销压低一点，给几件一直想试的事腾出整块时间。",
    year_2: "第二年：大多数尝试已经放下，只有一两件事总让你想回去。",
    year_3: "第三年：你没有找到标准答案，只是终于知道哪些日子愿意再过一遍。",
    ordinary_day: "白天做些能付账单的事，下午去见人、动手试，晚上记下哪一刻想继续、哪一刻想逃。",
    day_narrative: buildFallbackDayNarrative("探索"),
    attractions: ["终于有时间把想了很久的事亲手做一次", "更早知道哪些日子根本不想再过", "不用因为已经走了很远，就逼自己继续走"],
    costs_and_tradeoffs: ["每个月能花的钱会少一些，别人问起近况时也不容易一句说清", "身边人可能觉得你是在绕路"],
    evidence_for: evidence,
    assumptions: ["手上的钱和身体，都撑得住这段暂时没有答案的日子"],
    uncertainties: ["这样的收入和作息，你能安心过多久？"],
    risks: ["每天看似很自由，回头却说不出真正做成了什么", "只顾着试新东西，忘了停下来选一个继续", "旁人的着急比你更早替你做了决定"],
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
  const fromIntents = activeIntents.slice(0, 3).map((intent, index) => buildFallbackLifeFromRouteIntent(sessionId, provenanceId, intent, memory, index));

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
      current_coordinate: "你还没舍得放下现在拥有的，又不甘心往后的日子只是今天的重复。",
      key_tensions: ["你想换一种活法，又舍不得这份来之不易的确定", "过去会的东西很多，可你还不知道它们到了新地方算不算数"],
      recurring_elements: ["总要有点新东西可学", "再往前走，也不想把身边的人落下"],
    },
    analysis: buildFallbackAnalysis(memory),
    lives: lives as [ParallelLife, ParallelLife, ParallelLife],
    shared_values: ["先亲手碰一碰，再决定要不要相信", "不因为换一条路，就把过去全部否定"],
    real_tradeoff: "想走得快，就得先放掉一点安稳；想什么都不丢，时间会先被耗掉。",
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

    const fullTitle = life.title_full ?? "";
    const deCount = [...fullTitle].filter((char) => char === "的").length;
    if (fullTitle.length < 6 || fullTitle.length > 10 || deCount !== 1 || !fullTitle.includes(life.title)) {
      return { valid: false, reason: `Life ${life.id} full appellation must be 6-10 characters with one 的 and include title` };
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
    "三条人生必须彼此足够不同：标题不能相同；core_experience、ordinary_day、year_1 三处至少有两处措辞明显不同；不要只换一个词或改一个数字。请从不同的处境、节奏和代价出发，让读者一眼看出这是三条真正不同的路。",
    "每条 life.title 必须是给「一种人」的代称，两到六个字。先找最有力量的动作或处境，再长出称呼，如「借火者」「未熄者」「火中取粟者」；不得使用职业名、岗位名或温吞的抽象美词。title_full 必须包含 title，严格为 6–10 个汉字，只用「四字左右的状态／处境 + 的 + 人物代称」这一层结构，前后形成真实冲突，如「醉意朦胧的清醒者」「手握退路的借火者」；不用逗号，不写完整句，不出现第二个「的」。",
    "每条 life.evidence_for 中的 source_id 和 source_revision 必须严格来自上文 '=== 来源版本 ===' 中列出的活跃来源，使用对应的精确 source_id 和 revision，不要自行递增或假设版本号。",
    "除字段名外，所有可读内容都要让普通人一遍听懂：写动作、处境和真实代价，不使用核心价值、内在驱力、意义感、资源整合、能力建设、阶段性目标、验证假设等报告腔，也不堆华丽词。",
  ].join("\n");
}

function makePrompt(input: SensemakerFinalInput, lastValidationReason?: string): string {
  const retryNote = lastValidationReason
    ? `\n\n【自动修正提示】上一版生成未通过校验，原因：${lastValidationReason}。请严格重新生成三条人生，确保它们彼此足够不同。\n`
    : "";
  return composePrompt<ParallelLivesPlan>(
    "sensemaker_futures",
    buildFinalEnvelope(input) + retryNote,
    coercedPlanSchema as z.ZodType<ParallelLivesPlan, z.ZodTypeDef, unknown>
  );
}

export type SensemakerFinalOutput = ParallelLivesPlan & {
  prototypes: Prototype[];
};

export type FinalStreamOptions = {
  onPartial?: (partial: Partial<ParallelLivesPlan>) => void;
  onRetry?: (message: string, attempt: number, status: "retry" | "success") => void;
  abortSignal?: AbortSignal;
};

export class FinalGenerationError extends Error {
  constructor(message: string, readonly reason: "validation" | "provider" | "timeout" | "aborted") {
    super(message);
    this.name = "FinalGenerationError";
  }
}

export async function runSensemakerFinal(input: SensemakerFinalInput, options?: FinalStreamOptions): Promise<SensemakerFinalOutput> {
  const sessionId = input.memory.session_id;
  const config = getProviderConfig();
  const provenanceId = randomUUID();

  let lastValidationReason: string | undefined;
  for (let attempt = 0; attempt < 2; attempt++) {
    let raw: ParallelLivesPlan;
    try {
      raw = await streamStructured<ParallelLivesPlan>({
        purpose: "sensemaker_final",
        session_id: sessionId,
        prompt: makePrompt(input, lastValidationReason),
        schema: coercedPlanSchema as z.ZodType<ParallelLivesPlan, z.ZodTypeDef, unknown>,
        max_tokens: 16000,
        timeout_ms: 0,
        max_retries: 0,
        prompt_version: PROMPT_VERSION,
        enableThinking: true,
        onPartial: options?.onPartial,
        abortSignal: options?.abortSignal,
        fixture: () => Promise.resolve(buildFallbackParallelLivesPlan(sessionId, input.memory, input.provisional, provenanceId)),
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "unknown error";
      console.error("Sensemaker final provider call failed:", msg);
      if (err instanceof Error && err.name === "AbortError") {
        throw new FinalGenerationError("生成被中断。如果等待过久，请重试。", "aborted");
      }
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
    if (validation.valid) {
      if (attempt > 0) {
        options?.onRetry?.(`生成内容已通过校验（第 ${attempt + 1} 次尝试）`, attempt + 1, "success");
      }
      return withPrototypes(coerced, sessionId, config);
    }

    lastValidationReason = validation.reason;
    console.error(`Final plan validation failed (attempt ${attempt + 1}/2):`, validation.reason);
    options?.onRetry?.(`生成内容校验未通过：${validation.reason}，正在自动调整后重试...`, attempt + 1, "retry");

    if (attempt === 1) {
      throw new FinalGenerationError(
        `生成内容未通过校验：${validation.reason}。请重试，如果多次失败请联系管理员。`,
        "validation",
      );
    }
  }

  // Unreachable, but TypeScript doesn't know that.
  throw new FinalGenerationError("生成失败：未知错误", "provider");
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
