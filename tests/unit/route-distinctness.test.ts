import { describe, it, expect } from "vitest";
import { tokenSetSimilarity, planNotDistinct } from "@/lib/ai/sensemaker/final";
import type { ParallelLife } from "@/lib/state/contracts";

function makeLife(overrides: Partial<ParallelLife> = {}): ParallelLife {
  return {
    title: "接火者",
    title_full: "接火的人",
    core_experience: "在混乱里搭桥的人",
    ordinary_day: "早上七点出门，穿过半个城市去救昨夜的火。",
    year_1: "第一年学会在压力里保持节奏",
    year_2: "第二年有了自己的小队",
    year_3: "第三年开始教别人怎么接火",
    attractions: [],
    costs_and_tradeoffs: [],
    unknowns: [],
    evidence_for: [],
    assumptions: [],
    risks: [],
    design_basis: {
      title_hint: "接火者",
      daily_rhythm_hint: "救火",
      work_or_study_hint: "应急",
      relationships_hint: "团队",
      environment_hint: "城市",
      responsibilities_hint: "响应",
      resources_hint: "工资",
    },
    prototype: {
      trial_id: "t1",
      hypothesis: "test",
      today_action: "test",
      what_to_observe: "test",
      day_1: "test",
      day_2: "test",
      day_3: "test",
      time_ceiling_hours: 3,
      money_ceiling: "0",
      reversible_because: "test",
      feedback_source: "test",
      pause_or_exit_note: "test",
      safety_check: "test",
    },
    ...overrides,
  } as unknown as ParallelLife;
}

describe("tokenSetSimilarity (Chinese bigram)", () => {
  it("returns 1 for identical strings", () => {
    expect(tokenSetSimilarity("早上七点出门", "早上七点出门")).toBe(1);
  });

  it("returns 0 for completely different strings", () => {
    expect(tokenSetSimilarity("早上七点出门", "晚上九点回家")).toBeLessThan(0.5);
  });

  it("handles empty strings", () => {
    expect(tokenSetSimilarity("", "")).toBe(1);
    expect(tokenSetSimilarity("abc", "")).toBe(0);
  });

  it("gives moderate similarity for partially shared text", () => {
    const a = "在混乱里搭桥的人，每天穿过城市去救火";
    const b = "在混乱里搭桥的人，每天穿过城市去修桥";
    const sim = tokenSetSimilarity(a, b);
    expect(sim).toBeGreaterThan(0.5);
    expect(sim).toBeLessThan(1);
  });
});

describe("planNotDistinct", () => {
  it("rejects identical titles", () => {
    const lives = [
      makeLife({ title: "守灯人" }),
      makeLife({ title: "守灯人" }),
      makeLife({ title: "接火者" }),
    ];
    expect(planNotDistinct(lives)).toBe(true);
  });

  it("rejects highly similar summaries (paraphrase)", () => {
    const lives = [
      makeLife({
        title: "接火者",
        core_experience: "在混乱里搭桥的人",
        ordinary_day: "早上七点出门，穿过半个城市去救昨夜的火。",
        year_1: "第一年学会在压力里保持节奏",
      }),
      makeLife({
        title: "接火的人",
        core_experience: "在混乱里搭桥的人",
        ordinary_day: "早上七点出门，穿过半个城市去救昨夜的火。",
        year_1: "第一年学会在压力里保持节奏",
      }),
      makeLife({
        title: "守灯人",
        core_experience: "独自守着一盏灯",
        ordinary_day: "黄昏醒来，整夜看着海面上的光。",
        year_1: "第一年学会和孤独相处",
      }),
    ];
    expect(planNotDistinct(lives)).toBe(true);
  });

  it("accepts clearly different lives", () => {
    const lives = [
      makeLife({
        title: "接火者",
        core_experience: "在混乱里搭桥的人",
        ordinary_day: "早上七点出门，穿过半个城市去救昨夜的火。",
        year_1: "第一年学会在压力里保持节奏",
      }),
      makeLife({
        title: "双栖客",
        core_experience: "在两个城市之间来回住的人",
        ordinary_day: "周一在海口写代码，周四回老家种菜。",
        year_1: "第一年找到两个地方都能活下去的方式",
      }),
      makeLife({
        title: "守灯人",
        core_experience: "独自守着一盏灯",
        ordinary_day: "黄昏醒来，整夜看着海面上的光。",
        year_1: "第一年学会和孤独相处",
      }),
    ];
    expect(planNotDistinct(lives)).toBe(false);
  });

  it("rejects lives that share 2+ structural axes even with different titles", () => {
    const lives = [
      makeLife({
        title: "接火者",
        core_experience: "在混乱里搭桥的人",
        ordinary_day: "早上七点出门，穿过半个城市去救昨夜的火。",
        year_1: "第一年学会在压力里保持节奏",
      }),
      makeLife({
        title: "守夜人",
        core_experience: "在混乱里搭桥的人",
        ordinary_day: "早上七点出门，穿过半个城市去救昨夜的火。",
        year_1: "第一年学会在压力里保持节奏",
      }),
      makeLife({
        title: "双栖客",
        core_experience: "在两个城市之间来回住的人",
        ordinary_day: "周一在海口写代码，周四回老家种菜。",
        year_1: "第一年找到两个地方都能活下去的方式",
      }),
    ];
    expect(planNotDistinct(lives)).toBe(true);
  });
});
