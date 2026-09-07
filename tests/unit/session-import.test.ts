import { describe, it, expect } from "vitest";
import {
  mergeWorkingMemoryPayload,
  parseSessionImport,
} from "@/lib/session/import";

describe("parseSessionImport", () => {
  it("parses a valid export payload", () => {
    const parsed = parseSessionImport({
      meta: { session_id: "s1", user_id: "u1" },
      working_memory: { revision: 3, payload: { persona_portrait: { essence: "x" } } },
      waves: [
        {
          wave_id: "w1",
          wave_index: 1,
          status: "committed",
          focus_uncertainty_id: null,
          questions: [{ id: "q1", text: "hi" }],
        },
      ],
      answers: [{ question_id: "q1", value: "v", skipped: false }],
    });
    expect(parsed).not.toBeNull();
    expect(parsed!.sourceSessionId).toBe("s1");
    expect(parsed!.sourceUserId).toBe("u1");
    expect(parsed!.waves[0].questions).toBe(JSON.stringify([{ id: "q1", text: "hi" }]));
    expect(parsed!.answers).toHaveLength(1);
  });

  it("rejects non-object and empty payloads", () => {
    expect(parseSessionImport(null)).toBeNull();
    expect(parseSessionImport("nope")).toBeNull();
    expect(parseSessionImport({ meta: {} })).toBeNull();
  });

  it("skips malformed wave/answer entries", () => {
    const parsed = parseSessionImport({
      waves: [{ nope: true }, { wave_id: "w1", questions: "raw" }],
      answers: [{ question_id: 42 }, { question_id: "q1" }],
    });
    expect(parsed!.waves).toHaveLength(1);
    expect(parsed!.waves[0].questions).toBe("raw");
    expect(parsed!.answers).toHaveLength(1);
  });
});

describe("mergeWorkingMemoryPayload", () => {
  it("returns imported payload when no existing memory", () => {
    const imported = { persona_portrait: { essence: "x" } };
    expect(mergeWorkingMemoryPayload(null, imported)).toEqual(imported);
  });

  it("fills missing keys without overwriting existing ones", () => {
    const existing = {
      persona_portrait: { essence: "keep" },
      finalPlan: null,
      last_wave_index: 2,
    };
    const imported = {
      persona_portrait: { essence: "replace" },
      finalPlan: { lives: [{ id: "l1" }] },
      last_wave_index: 5,
      uncertainties: [{ id: "u1" }],
    };
    const merged = mergeWorkingMemoryPayload(existing, imported);
    expect(merged.persona_portrait).toEqual({ essence: "keep" });
    expect(merged.finalPlan).toEqual({ lives: [{ id: "l1" }] });
    expect(merged.last_wave_index).toBe(5);
    expect(merged.uncertainties).toEqual([{ id: "u1" }]);
  });

  it("unions array items by id, existing items win", () => {
    const existing = { route_intents: [{ id: "r1", v: 1 }] };
    const imported = {
      route_intents: [
        { id: "r1", v: 2 },
        { id: "r2", v: 3 },
      ],
    };
    const merged = mergeWorkingMemoryPayload(existing, imported);
    expect(merged.route_intents).toEqual([
      { id: "r1", v: 1 },
      { id: "r2", v: 3 },
    ]);
  });
});
