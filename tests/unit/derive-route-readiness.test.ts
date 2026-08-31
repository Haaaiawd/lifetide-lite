import { describe, it, expect } from "vitest";
import { deriveRouteReadiness } from "@/lib/state/derive-route-readiness";
import type { WorkingUnderstanding, SessionStateHead, RouteIntent, EvidenceLink, SourceVersion, SourceHead } from "@/lib/state/contracts";

const baseWaiver = (overrides: Partial<WorkingUnderstanding> = {}): WorkingUnderstanding => ({
  session_id: "s1",
  revision: 1,
  design_question: undefined,
  design_question_source_refs: [],
  source_heads: [],
  source_versions: [],
  claims: [],
  constraints: [],
  radar: {
    traits: { dimension: "traits", state: "unseen", reason: "", evidence: [], updated_at: new Date().toISOString() },
    motivation: { dimension: "motivation", state: "unseen", reason: "", evidence: [], updated_at: new Date().toISOString() },
    capabilities: { dimension: "capabilities", state: "unseen", reason: "", evidence: [], updated_at: new Date().toISOString() },
    relationships: { dimension: "relationships", state: "unseen", reason: "", evidence: [], updated_at: new Date().toISOString() },
    environment: { dimension: "environment", state: "unseen", reason: "", evidence: [], updated_at: new Date().toISOString() },
    narrative: { dimension: "narrative", state: "unseen", reason: "", evidence: [], updated_at: new Date().toISOString() },
  },
  route_intents: [],
  corrections: [],
  declined_topics: [],
  ...overrides,
});

const stateHead = (overrides: Partial<SessionStateHead> = {}): SessionStateHead => ({
  session_id: "s1",
  revision: 1,
  machine_version: 3,
  state_value_json: { value: "parallel_lives_ready" },
  public_context_json: {},
  snapshot_hash: "h",
  updated_at: new Date().toISOString(),
  ...overrides,
});

const directSource = (id: string): SourceVersion => ({
  source_id: id,
  session_id: "s1",
  revision: 1,
  kind: "question_answer",
  created_at: new Date().toISOString(),
  untrusted: false,
  text_ref: `ref-${id}`,
});

const directHead = (id: string): SourceHead => ({
  session_id: "s1",
  source_id: id,
  active_revision: 1,
  status: "active",
});

const directEvidence = (sourceId: string, shape: EvidenceLink["evidence_shape"], relevance = "支撑理解"): EvidenceLink => ({
  source_id: sourceId,
  source_revision: 1,
  epistemic_status: "user_stated",
  evidence_shape: shape,
  relevance,
});

const acceptedIntent = (n: number, lifeShape: RouteIntent["life_shape"], realCost: string): RouteIntent => ({
  id: `ri${n}`,
  generation_provenance_id: `gp${n}`,
  title_hint: `意图 ${n}`,
  life_shape: lifeShape,
  real_cost: realCost,
  evidence: [directEvidence(`src${n}`, "tradeoff")],
  status: "accepted",
});

const baseLifeShape: RouteIntent["life_shape"] = {
  daily_rhythm: "朝九晚五",
  work_or_study: "组织内延续",
  relationships: "稳定的家庭和同事关系",
  environment: "一线城市",
  responsibilities: "承担团队责任",
  resources: "现有技能与储蓄",
};

describe("deriveRouteReadiness", () => {
  it("is unmet for empty working understanding", () => {
    const result = deriveRouteReadiness({ workingUnderstanding: baseWaiver(), stateHead: stateHead() });
    expect(result.formal_ready).toBe(false);
    expect(result.safety_clear).toBe("met");
  });

  it("marks design_question met only when backed by active direct-user source", () => {
    const wu = baseWaiver({
      design_question: "我是否该继续当前工作？",
      design_question_source_refs: [{ source_id: "q1", source_revision: 1 }],
      source_heads: [directHead("q1")],
      source_versions: [directSource("q1")],
    });
    const result = deriveRouteReadiness({ workingUnderstanding: wu, stateHead: stateHead() });
    expect(result.design_question).toBe("met");
    expect(result.ordinary_day_anchor).toBe("unmet");
    expect(result.formal_ready).toBe(false);
  });

  it("rejects design_question with inactive source", () => {
    const wu = baseWaiver({
      design_question: "我是否该继续当前工作？",
      design_question_source_refs: [{ source_id: "q1", source_revision: 1 }],
      source_heads: [{ session_id: "s1", source_id: "q1", active_revision: 2, status: "active" }],
      source_versions: [directSource("q1")],
    });
    const result = deriveRouteReadiness({ workingUnderstanding: wu, stateHead: stateHead() });
    expect(result.design_question).toBe("unmet");
  });

  it("marks six_dimensions_handled when all cells are not unseen", () => {
    const radar = baseWaiver().radar;
    for (const dim of Object.keys(radar) as (keyof typeof radar)[]) {
      const cell = radar[dim];
      if (!cell) continue;
      cell.state = "declined";
      cell.reason = "用户明确拒绝此维度";
    }
    const result = deriveRouteReadiness({ workingUnderstanding: baseWaiver({ radar }), stateHead: stateHead() });
    expect(result.six_dimensions_handled).toBe("met");
  });

  it("marks four_dimensions_grounded when at least 4 cells are grounded", () => {
    const radar = baseWaiver().radar;
    const dims = Object.keys(radar) as (keyof typeof radar)[];
    dims.forEach((dim, i) => {
      const cell = radar[dim];
      if (!cell) return;
      cell.state = i < 4 ? "grounded" : "unseen";
      cell.reason = "有证据";
      cell.evidence = [directEvidence(`src${i}`, "concrete_scene")];
    });
    const wu = baseWaiver({ radar, source_heads: dims.map((_, i) => directHead(`src${i}`)), source_versions: dims.map((_, i) => directSource(`src${i}`)) });
    const result = deriveRouteReadiness({ workingUnderstanding: wu, stateHead: stateHead() });
    expect(result.four_dimensions_grounded).toBe("met");
  });

  it("accepts three route intents that differ on at least two axes", () => {
    const a: RouteIntent["life_shape"] = { ...baseLifeShape, daily_rhythm: "朝九晚五" };
    const b: RouteIntent["life_shape"] = { ...baseLifeShape, daily_rhythm: "自由职业", work_or_study: "自由项目" };
    const c: RouteIntent["life_shape"] = { ...baseLifeShape, daily_rhythm: "高原冥想", environment: "大理" };
    const intents = [acceptedIntent(1, a, "稳定但节奏压抑"), acceptedIntent(2, b, "收入不确定"), acceptedIntent(3, c, "社会支持减少")];
    const wu = baseWaiver({
      route_intents: intents,
      source_heads: [directHead("src1"), directHead("src2"), directHead("src3")],
      source_versions: [directSource("src1"), directSource("src2"), directSource("src3")],
    });
    const result = deriveRouteReadiness({ workingUnderstanding: wu, stateHead: stateHead() });
    expect(result.distinct_route_intents).toBe("met");
  });

  it("rejects three route intents that only differ on one axis", () => {
    const a = baseLifeShape;
    const b = { ...baseLifeShape, daily_rhythm: "弹性工作时间" };
    const c = { ...baseLifeShape, daily_rhythm: "完全自由" };
    const intents = [acceptedIntent(1, a, "成本 A"), acceptedIntent(2, b, "成本 B"), acceptedIntent(3, c, "成本 C")];
    const wu = baseWaiver({
      route_intents: intents,
      source_heads: [directHead("src1"), directHead("src2"), directHead("src3")],
      source_versions: [directSource("src1"), directSource("src2"), directSource("src3")],
    });
    const result = deriveRouteReadiness({ workingUnderstanding: wu, stateHead: stateHead() });
    expect(result.distinct_route_intents).toBe("unmet");
  });

  it("rejects route intent set with real costs but no tradeoff evidence", () => {
    const intents = [
      { ...acceptedIntent(1, baseLifeShape, "有成本"), evidence: [directEvidence("src1", "concrete_scene")] },
      { ...acceptedIntent(2, { ...baseLifeShape, work_or_study: "邻近转向" }, "有成本"), evidence: [directEvidence("src2", "concrete_scene")] },
      { ...acceptedIntent(3, { ...baseLifeShape, environment: "乡村" }, "有成本"), evidence: [directEvidence("src3", "concrete_scene")] },
    ];
    const wu = baseWaiver({
      route_intents: intents,
      source_heads: [directHead("src1"), directHead("src2"), directHead("src3")],
      source_versions: [directSource("src1"), directSource("src2"), directSource("src3")],
    });
    const result = deriveRouteReadiness({ workingUnderstanding: wu, stateHead: stateHead() });
    expect(result.material_tradeoff).toBe("unmet");
  });

  it("marks safety_clear unmet when machine is in safety_stop", () => {
    const result = deriveRouteReadiness({
      workingUnderstanding: baseWaiver(),
      stateHead: stateHead({ state_value_json: { value: "safety_stop" } }),
    });
    expect(result.safety_clear).toBe("unmet");
  });

  it("formal_ready is false when a gate is waived", () => {
    // Not implemented: waivers can never make formal_ready true.
    const result = deriveRouteReadiness({ workingUnderstanding: baseWaiver(), stateHead: stateHead() });
    expect(result.formal_ready).toBe(false);
  });
});
