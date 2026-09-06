import { describe, it, expect } from "vitest";
import { evaluateStop, refreshInterviewFocus } from "@/app/api/wave/route";
import { makeWave1Questions } from "@/lib/interview/templates";
import { runWave1Sensemaker } from "@/lib/ai/sensemaker/wave1";
import type { InterviewAnswer, WorkingMemory } from "@/lib/working-memory/types";
import type { SourceHead, SourceVersion, RouteIntent } from "@/lib/state/contracts";

function makeMemory(overrides: Partial<WorkingMemory> = {}): WorkingMemory {
  const sessionId = "test-session";
  const sourceId = "src-1";
  const revision = 1;

  const head: SourceHead = {
    session_id: sessionId,
    source_id: sourceId,
    active_revision: revision,
    status: "active",
  };

  const version: SourceVersion = {
    source_id: sourceId,
    session_id: sessionId,
    revision,
    kind: "question_answer",
    created_at: new Date().toISOString(),
    untrusted: false,
    text_ref: "ref-src-1",
  };

  const routeIntents: RouteIntent[] = [
    { id: "r1", generation_provenance_id: "p1", title_hint: "A", life_shape: { daily_rhythm: "", work_or_study: "", relationships: "", environment: "", responsibilities: "", resources: "" }, real_cost: "", evidence: [], status: "seed" },
    { id: "r2", generation_provenance_id: "p1", title_hint: "B", life_shape: { daily_rhythm: "", work_or_study: "", relationships: "", environment: "", responsibilities: "", resources: "" }, real_cost: "", evidence: [], status: "seed" },
    { id: "r3", generation_provenance_id: "p1", title_hint: "C", life_shape: { daily_rhythm: "", work_or_study: "", relationships: "", environment: "", responsibilities: "", resources: "" }, real_cost: "", evidence: [], status: "seed" },
  ];

  return {
    session_id: sessionId,
    schema_version: "working-memory.v3",
    last_wave_index: 0,
    source_heads: [head],
    source_versions: [version],
    claims: [],
    constraints: [],
    uncertainties: [],
    route_intents: routeIntents,
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

describe("evaluateStop", () => {
  describe("wave 6 early stop", () => {
    it("stops at wave 6 with route intents + evidence", () => {
      const mem = makeMemory({ last_wave_index: 6 });
      const result = evaluateStop(mem, 30);
      expect(result.stop).toBe(true);
      expect(result.canGenerate).toBe(true);
      expect(result.reason).toBe("sufficient");
    });

    it("does not stop at wave 5 even with route intents + evidence", () => {
      const mem = makeMemory({ last_wave_index: 5 });
      const result = evaluateStop(mem, 25);
      expect(result.stop).toBe(false);
      expect(result.reason).toBe("continue");
    });

    it("does not stop at wave 6 without route intents", () => {
      const mem = makeMemory({ last_wave_index: 6, route_intents: [] });
      const result = evaluateStop(mem, 30);
      expect(result.stop).toBe(false);
      expect(result.reason).toBe("continue");
      expect(result.canGenerate).toBe(false);
    });

    it("does not stop at wave 6 without evidence (no active sources)", () => {
      const mem = makeMemory({
        last_wave_index: 6,
        source_heads: [{ session_id: "test-session", source_id: "src-1", active_revision: 1, status: "deleted" }],
      });
      const result = evaluateStop(mem, 30);
      expect(result.stop).toBe(false);
      expect(result.reason).toBe("continue");
      expect(result.canGenerate).toBe(false);
    });
  });

  describe("wave 8 hard limit", () => {
    it("stops at wave 8 with route intents + evidence", () => {
      const mem = makeMemory({ last_wave_index: 8 });
      const result = evaluateStop(mem, 40);
      expect(result.stop).toBe(true);
      expect(result.canGenerate).toBe(true);
      expect(result.reason).toBe("wave_limit");
    });

    it("stops at wave 8 even without route intents", () => {
      const mem = makeMemory({ last_wave_index: 8, route_intents: [] });
      const result = evaluateStop(mem, 40);
      expect(result.stop).toBe(true);
      expect(result.canGenerate).toBe(false);
      expect(result.reason).toBe("wave_limit");
    });

    it("stops at wave 8 even without evidence", () => {
      const mem = makeMemory({
        last_wave_index: 8,
        source_heads: [{ session_id: "test-session", source_id: "src-1", active_revision: 1, status: "deleted" }],
      });
      const result = evaluateStop(mem, 40);
      expect(result.stop).toBe(true);
      expect(result.canGenerate).toBe(false);
      expect(result.reason).toBe("wave_limit");
    });
  });

  describe("question limit", () => {
    it("stops when answeredQuestions >= 50", () => {
      const mem = makeMemory({ last_wave_index: 3 });
      const result = evaluateStop(mem, 50);
      expect(result.stop).toBe(true);
      expect(result.reason).toBe("question_limit");
    });

    it("canGenerate is false at question_limit without evidence", () => {
      const mem = makeMemory({
        last_wave_index: 3,
        source_heads: [{ session_id: "test-session", source_id: "src-1", active_revision: 1, status: "deleted" }],
      });
      const result = evaluateStop(mem, 50);
      expect(result.stop).toBe(true);
      expect(result.canGenerate).toBe(false);
    });
  });

  describe("canGenerate consistency", () => {
    it("canGenerate requires both route intents AND evidence", () => {
      const memWithRoutesNoEvidence = makeMemory({
        last_wave_index: 8,
        source_heads: [{ session_id: "test-session", source_id: "src-1", active_revision: 1, status: "deleted" }],
      });
      expect(evaluateStop(memWithRoutesNoEvidence, 40).canGenerate).toBe(false);

      const memWithEvidenceNoRoutes = makeMemory({
        last_wave_index: 8,
        route_intents: [],
      });
      expect(evaluateStop(memWithEvidenceNoRoutes, 40).canGenerate).toBe(false);

      const memWithBoth = makeMemory({ last_wave_index: 8 });
      expect(evaluateStop(memWithBoth, 40).canGenerate).toBe(true);
    });
  });

  describe("continue", () => {
    it("continues at wave 4 with everything", () => {
      const mem = makeMemory({ last_wave_index: 4 });
      const result = evaluateStop(mem, 20);
      expect(result.stop).toBe(false);
      expect(result.reason).toBe("continue");
    });
  });
});

describe("interview continuity", () => {
  it("keeps MBTI abstract and prioritizes Wave 1's concrete trigger", () => {
    const questions = makeWave1Questions();
    const answers = [
      { id: "answer-mbti", question_id: "w1q3", value: "w1q3-infp", skipped: false },
      { id: "answer-trigger", question_id: "w1q8", value: "上周加班到凌晨时，我第一次认真想换一种生活。", skipped: false },
    ] as InterviewAnswer[];

    expect(questions[7].asks_for_concrete_example).toBe(true);
    expect(questions[7].text).toContain("最近发生了哪件事");

    const output = runWave1Sensemaker(makeMemory(), questions, answers);
    const claim = output.operations.find((op) => op.op === "add_claim");
    expect(claim?.op).toBe("add_claim");
    if (!claim || claim.op !== "add_claim") throw new Error("Expected Wave 1 claim");

    expect(claim.value.evidence[0].source_id).toBe("answer-trigger");
    expect(claim.value.evidence.find((link) => link.source_id === "answer-mbti")?.evidence_shape).toBe("abstract_statement");
    expect(claim.value.evidence.find((link) => link.source_id === "answer-trigger")?.evidence_shape).toBe("concrete_scene");
  });

  it("refreshes the next-wave focus from the latest important unknown", () => {
    const memory = makeMemory({
      uncertainties: [{
        id: "focus-1",
        question: "要不要换工作？",
        topic: "我暂不知晓的是用户是否真的想换工作。",
        plan_consequence: "决定是否转向",
        related_evidence: [],
        related_route_intent_ids: ["r1"],
        factors: { plan_impact: 3, evidence_gap: 2, user_salience: 2, reversibility_value: 2, sensitivity_cost: 0, repetition_cost: 1 },
        priority: 8,
        created_wave: 1,
        status: "active",
      }],
    });
    const evidence = [{
      source_id: "src-1",
      source_revision: 1,
      epistemic_status: "user_stated" as const,
      evidence_shape: "concrete_scene" as const,
      relevance: "两次疲惫都发生在被频繁打断时",
      excerpt: "连续开会以后完全不想说话",
    }];

    refreshInterviewFocus(
      memory,
      "focus-1",
      2,
      "我暂不知晓的是疲惫来自工作内容，还是来自频繁被打断。",
      "这会改变下一波需要了解的生活节奏。",
      evidence,
    );

    expect(memory.uncertainties[0].topic).toContain("频繁被打断");
    expect(memory.uncertainties[0].question).not.toBe("要不要换工作？");
    expect(memory.uncertainties[0].plan_consequence).toContain("生活节奏");
    expect(memory.uncertainties[0].related_evidence).toEqual(evidence);
    expect(memory.uncertainties[0].factors.repetition_cost).toBe(0);
  });
});
