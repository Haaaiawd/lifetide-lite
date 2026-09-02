// Builds a complete WorkingMemory from a virtual-user JSON fixture.
// Used by unit tests and manual AI-generation scripts.

import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { WorkingMemory } from "@/lib/working-memory/types";
import type {
  SourceHead,
  SourceVersion,
  EvidenceLink,
  Claim,
  Constraint,
  RouteIntent,
  RadarCell,
} from "@/lib/state/contracts";

type VirtualUserJSON = {
  session_id: string;
  wave_answers: Record<string, Array<{ question_id: string; value: string }>>;
  expected_themes?: {
    tensions?: string[];
    energy_patterns?: string[];
    recurring_elements?: string[];
    possible_directions?: string[];
  };
};

function nowISO() {
  return new Date().toISOString();
}

function makeSourceVersion(sourceId: string, sessionId: string, text: string): { head: SourceHead; version: SourceVersion } {
  const revision = 1;
  return {
    head: {
      session_id: sessionId,
      source_id: sourceId,
      active_revision: revision,
      status: "active",
    },
    version: {
      source_id: sourceId,
      session_id: sessionId,
      revision,
      kind: "question_answer",
      created_at: nowISO(),
      untrusted: false,
      text_ref: `ref-${sourceId}`,
    },
  };
}

function makeEvidence(sourceId: string, excerpt: string, relevance: string): EvidenceLink {
  return {
    source_id: sourceId,
    source_revision: 1,
    excerpt,
    epistemic_status: "user_stated",
    evidence_shape: "concrete_scene",
    relevance,
  };
}

function makeRadarCell(
  dimension: RadarCell["dimension"],
  state: RadarCell["state"],
  reason: string,
  evidence: EvidenceLink[],
): RadarCell {
  return {
    dimension,
    state,
    reason,
    evidence,
    updated_at: nowISO(),
  };
}

export function loadVirtualUser(filename: string): VirtualUserJSON {
  const filePath = join(process.cwd(), "tests", "fixtures", filename);
  const raw = readFileSync(filePath, "utf-8");
  return JSON.parse(raw) as VirtualUserJSON;
}

export function buildMemoryFromVirtualUser(filename: string): WorkingMemory {
  const data = loadVirtualUser(filename);
  const sessionId = data.session_id;
  const provenanceId = randomUUID();

  // Build sources from wave answers
  const sources: Array<{ head: SourceHead; version: SourceVersion; text: string }> = [];
  const allAnswers = [
    ...(data.wave_answers.wave_1 ?? []),
    ...(data.wave_answers.wave_2 ?? []),
  ];

  for (const ans of allAnswers) {
    const sourceId = `src-${ans.question_id}`;
    const { head, version } = makeSourceVersion(sourceId, sessionId, ans.value);
    sources.push({ head, version, text: ans.value });
  }

  const source_heads = sources.map((s) => s.head);
  const source_versions = sources.map((s) => s.version);

  // Evidence links pointing to wave-1 answers
  const w1q8 = sources.find((s) => s.head.source_id === "src-w1q8");
  const w2q1 = sources.find((s) => s.head.source_id === "src-w2q1");
  const w2q2 = sources.find((s) => s.head.source_id === "src-w2q2");
  const w2q3 = sources.find((s) => s.head.source_id === "src-w2q3");
  const w2q4 = sources.find((s) => s.head.source_id === "src-w2q4");
  const w2q5 = sources.find((s) => s.head.source_id === "src-w2q5");
  const w2q6 = sources.find((s) => s.head.source_id === "src-w2q6");

  const ev = (src: typeof w1q8, relevance: string) =>
    src ? makeEvidence(src.head.source_id, src.text.slice(0, 80), relevance) : makeEvidence("src-w1q8", "", relevance);

  // Claims (working inferences from the answers)
  const claims: Claim[] = [
    {
      id: randomUUID(),
      generation_provenance_id: provenanceId,
      text: "用户擅长协调和落地，但在重复中缺乏成长感，可能不是厌倦产品角色本身，而是厌倦当前公司的节奏。",
      epistemic_status: "working_inference",
      evidence: [ev(w1q8, "用户自述考虑换方向"), ev(w2q1, "能量模式：带人复盘投入，协调会议消耗")],
      dimensions: ["motivation", "capabilities"],
      calibration: "unreviewed",
      status: "active",
    },
    {
      id: randomUUID(),
      generation_provenance_id: provenanceId,
      text: "对教育领域有兴趣，但不确定是真实方向还是逃避当前倦怠。",
      epistemic_status: "design_hypothesis",
      evidence: [ev(w2q4, "用户自述想做青少年教育"), ev(w2q5, "用户担心只是逃避")],
      dimensions: ["motivation", "narrative"],
      calibration: "unreviewed",
      status: "active",
    },
  ];

  // Constraints
  const constraints: Constraint[] = [
    {
      id: randomUUID(),
      generation_provenance_id: provenanceId,
      text: "男友在创业，两人都不稳定会有经济压力。",
      kind: "money",
      flexibility: "negotiable",
      evidence: [ev(w2q3, "用户提及男友创业的经济压力")],
      status: "active",
    },
    {
      id: randomUUID(),
      generation_provenance_id: provenanceId,
      text: "父母希望在上海买房安顿，期待稳定。",
      kind: "care",
      flexibility: "negotiable",
      evidence: [ev(w2q3, "用户提及父母期待稳定")],
      status: "active",
    },
  ];

  // Route intents (seeds for the three directions)
  const route_intents: RouteIntent[] = [
    {
      id: randomUUID(),
      generation_provenance_id: provenanceId,
      title_hint: "教育领域的产品经理",
      life_shape: {
        daily_rhythm: "保留产品工作的节奏，但内容转向教育",
        work_or_study: "在教育科技公司做产品",
        relationships: "和男友继续在上海，周末一起做饭",
        environment: "上海",
        responsibilities: "产品规划、用户调研、课程设计协作",
        resources: "现有产品能力可迁移，教育领域需要新学习",
      },
      real_cost: "可能需要降薪进入教育行业，行业成熟度不如互联网",
      evidence: [ev(w2q4, "想做事教相关"), ev(w1q8, "产品经理能力可迁移")],
      status: "accepted",
    },
    {
      id: randomUUID(),
      generation_provenance_id: provenanceId,
      title_hint: "独立教育课程设计者",
      life_shape: {
        daily_rhythm: "自主安排，上午创作下午协作",
        work_or_study: "独立设计帮孩子认识自己的课程",
        relationships: "和男友继续合作，减少固定社交",
        environment: "上海或武汉",
        responsibilities: "课程设计、用户测试、内容创作",
        resources: "需要积累教育方法和独立收入来源",
      },
      real_cost: "收入不稳定，需要从零建立教育领域信任",
      evidence: [ev(w2q4, "想做帮孩子认识自己的课程"), ev(w2q6, "希望节奏自己掌控")],
      status: "accepted",
    },
    {
      id: randomUUID(),
      generation_provenance_id: provenanceId,
      title_hint: "保留现状，副业探索",
      life_shape: {
        daily_rhythm: "工作日做产品，周末探索教育",
        work_or_study: "继续互联网产品经理，业余做教育内容",
        relationships: "维持现有关系和社交",
        environment: "上海",
        responsibilities: "产品工作 + 业余课程写作",
        resources: "稳定收入支撑探索",
      },
      real_cost: "探索速度慢，精力被工作挤压，可能长期停留在想法阶段",
      evidence: [ev(w2q5, "担心只是厌倦公司而非角色"), ev(w2q2, "周末已被加班挤掉")],
      status: "accepted",
    },
  ];

  // Radar
  const radar: Record<string, RadarCell> = {
    traits: makeRadarCell("traits", "signaled", "擅长协调、落地、带人复盘；倾向在结构中工作但渴望更多自主", [ev(w2q1, "能量模式反映特质")]),
    motivation: makeRadarCell("motivation", "grounded", "想做有意义的事，想掌控节奏，对教育有真实兴趣但不确定深度", [ev(w2q4, "想做事教"), ev(w2q6, "希望掌控节奏")]),
    capabilities: makeRadarCell("capabilities", "grounded", "产品规划、用户调研、协调落地能力成熟；教育领域需要新学习", [ev(w1q8, "五年产品经理经验")]),
    relationships: makeRadarCell("relationships", "grounded", "男友支持探索但经济压力存在；父母期待稳定", [ev(w2q3, "男友创业，父母期待稳定")]),
    environment: makeRadarCell("environment", "signaled", "上海，互联网行业生态，教育和心理资源丰富但生活成本高", [ev(w1q8, "用户在上海")]),
    narrative: makeRadarCell("narrative", "conflicted", "把自己看作'想转但怕逃避'的人，三十岁焦虑和重新开始的恐惧并存", [ev(w2q5, "怕只是逃避"), ev(w1q8, "考虑换方向")]),
  };

  return {
    schema_version: "wm.v3",
    session_id: sessionId,
    revision: 2,
    design_question: "在保留经济稳定和现有能力的前提下，如何验证教育方向是真实的下一站而非暂时逃避？",
    design_question_source_refs: [
      { source_id: "src-w2q4", source_revision: 1 },
      { source_id: "src-w2q5", source_revision: 1 },
    ],
    source_heads,
    source_versions,
    claims,
    constraints,
    radar,
    route_intents,
    corrections: [],
    declined_topics: [],
    last_wave_index: 2,
    updated_at: nowISO(),
    uncertainties: [
      {
        id: randomUUID(),
        question: "对教育的兴趣是持久的方向还是对当前倦怠的暂时逃避？",
        plan_consequence: "决定是否值得投入转型成本",
        related_evidence: [ev(w2q4, "想做事教"), ev(w2q5, "怕只是逃避")],
        related_route_intent_ids: route_intents.slice(0, 2).map((r) => r.id),
        factors: { plan_impact: 3, evidence_gap: 2, user_salience: 3, reversibility_value: 2, sensitivity_cost: 1, repetition_cost: 1 },
        priority: 1,
        created_wave: 2,
        status: "active",
      },
      {
        id: randomUUID(),
        question: "两人都不稳定时，经济压力会如何影响关系和探索空间？",
        plan_consequence: "决定副业探索还是全职转型的节奏",
        related_evidence: [ev(w2q3, "男友创业经济压力")],
        related_route_intent_ids: [route_intents[2].id],
        factors: { plan_impact: 2, evidence_gap: 2, user_salience: 2, reversibility_value: 3, sensitivity_cost: 2, repetition_cost: 1 },
        priority: 2,
        created_wave: 2,
        status: "active",
      },
    ],
    recent_feedback: [
      {
        id: randomUUID(),
        session_id: sessionId,
        revision: 1,
        wave_id: "w1",
        verdict: "accurate",
        note: "继续",
        created_at: nowISO(),
      } as any,
    ],
  };
}
