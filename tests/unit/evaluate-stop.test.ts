import { describe, it, expect } from "vitest";
import { evaluateStop } from "@/app/api/wave/route";
import type { WorkingMemory } from "@/lib/working-memory/types";
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
