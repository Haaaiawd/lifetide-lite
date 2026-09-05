import { describe, it, expect } from "vitest";
import { buildProgressSummary } from "@/lib/ai/prompts/compose";
import type { WorkingMemory } from "@/lib/working-memory/types";

function makeMemory(overrides: Partial<WorkingMemory> = {}): WorkingMemory {
  return {
    session_id: "test-session",
    schema_version: "working-memory.v3",
    last_wave_index: 0,
    source_heads: [],
    source_versions: [],
    claims: [],
    constraints: [],
    uncertainties: [],
    route_intents: [],
    radar: {
      traits: { state: "unseen", reason: "" },
      motivation: { state: "unseen", reason: "" },
      capabilities: { state: "unseen", reason: "" },
      relationships: { state: "unseen", reason: "" },
      environment: { state: "unseen", reason: "" },
      narrative: { state: "unseen", reason: "" },
    },
    last_insight: null,
    persona_portrait: null,
    finalPlan: null,
    ...overrides,
  } as unknown as WorkingMemory;
}

describe("buildProgressSummary", () => {
  it("reports correct wave and remaining counts", () => {
    const mem = makeMemory({ last_wave_index: 2 });
    const summary = buildProgressSummary(mem, 3);
    expect(summary).toContain("当前波次: 3 / 8");
    expect(summary).toContain("剩余波次: 5");
  });

  it("wave 3 triggers early pacing reminder", () => {
    const mem = makeMemory({ last_wave_index: 2 });
    const summary = buildProgressSummary(mem, 3);
    expect(summary).toContain("第 3 波");
    expect(summary).toContain("维度广度");
  });

  it("wave 7 does NOT say '最后一个波次' (that's wave 8)", () => {
    const mem = makeMemory({ last_wave_index: 6 });
    const summary = buildProgressSummary(mem, 7);
    expect(summary).toContain("还剩 1 个波次");
    expect(summary).not.toContain("最后一个波次");
  });

  it("wave 8 says '最后一个波次'", () => {
    const mem = makeMemory({ last_wave_index: 7 });
    const summary = buildProgressSummary(mem, 8);
    expect(summary).toContain("最后一个波次");
    expect(summary).toContain("第 8 波");
  });

  it("wave 4-5 triggers mid-course reminder about reaching signaled by wave 6", () => {
    const mem = makeMemory({ last_wave_index: 3 });
    const summary = buildProgressSummary(mem, 4);
    expect(summary).toContain("已过半程");
    expect(summary).toContain("第 6 波");
  });

  it("wave 6 triggers late-half reminder about signaled coverage", () => {
    const mem = makeMemory({ last_wave_index: 5 });
    const summary = buildProgressSummary(mem, 6);
    expect(summary).toContain("已进入后半程");
    expect(summary).toContain("signaled");
  });

  it("defaults to nextWaveIndex = last_wave_index + 1 when not provided", () => {
    const mem = makeMemory({ last_wave_index: 4 });
    const summary = buildProgressSummary(mem);
    expect(summary).toContain("当前波次: 5 / 8");
  });

  it("reports radar coverage counts", () => {
    const mem = makeMemory({
      last_wave_index: 3,
      radar: {
        traits: { state: "grounded", reason: "" },
        motivation: { state: "signaled", reason: "" },
        capabilities: { state: "unseen", reason: "" },
        relationships: { state: "conflicted", reason: "" },
        environment: { state: "declined", reason: "" },
        narrative: { state: "unseen", reason: "" },
      },
    });
    const summary = buildProgressSummary(mem, 4);
    expect(summary).toContain("2/6 已有实质证据");
    expect(summary).toContain("1 有线索");
    expect(summary).toContain("2 未触及");
    expect(summary).toContain("1 用户拒绝");
  });
});
