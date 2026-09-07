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

  it("rejects working_memory payloads with unknown top-level keys", () => {
    expect(
      parseSessionImport({
        working_memory: {
          payload: { persona_portrait: {}, not_a_real_key: true },
        },
      }),
    ).toBeNull();
    expect(
      parseSessionImport({
        working_memory: { payload: { evil: "payload" } },
      }),
    ).toBeNull();
  });

  it("accepts a real export round-trip shape", () => {
    const exported = {
      meta: {
        exported_at: "2026-09-07T00:00:00.000Z",
        session_id: "s1",
        user_id: "u1",
        user_email: null,
        session_created_at: "2026-09-06T00:00:00.000Z",
        session_expires_at: "2026-09-14T00:00:00.000Z",
      },
      working_memory: {
        revision: 3,
        updated_at: "2026-09-06T12:00:00.000Z",
        payload: {
          schema_version: "wm.v3",
          session_id: "s1",
          revision: 3,
          design_question_source_refs: [],
          source_heads: [],
          source_versions: [],
          claims: [],
          constraints: [],
          radar: {},
          route_intents: [],
          corrections: [],
          declined_topics: [],
          uncertainties: [],
          recent_feedback: [],
          last_wave_index: 2,
          updated_at: "2026-09-06T12:00:00.000Z",
        },
      },
      waves: [
        {
          id: "db1",
          wave_id: "w1",
          wave_index: 1,
          focus_uncertainty_id: null,
          status: "committed",
          created_at: "2026-09-06T10:00:00.000Z",
          updated_at: "2026-09-06T11:00:00.000Z",
          questions: [{ id: "q1" }],
        },
      ],
      answers: [
        {
          id: "a1",
          question_id: "q1",
          value: "v",
          skipped: false,
          created_at: "2026-09-06T10:30:00.000Z",
        },
      ],
      uploads: [],
      derived_contents: [],
      model_call_logs: [],
      wave_missions: [],
      errors: [],
    };
    const parsed = parseSessionImport(exported);
    expect(parsed).not.toBeNull();
    expect(parsed!.workingMemoryPayload).toEqual(
      exported.working_memory.payload,
    );
    expect(parsed!.waves).toHaveLength(1);
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

  it("unions array items by id, existing fields win on merge", () => {
    const existing = { route_intents: [{ id: "r1", v: 1 }] };
    const imported = {
      route_intents: [
        { id: "r1", v: 2, extra: "from-import" },
        { id: "r2", v: 3 },
      ],
    };
    const merged = mergeWorkingMemoryPayload(existing, imported);
    expect(merged.route_intents).toEqual([
      { id: "r1", v: 1, extra: "from-import" },
      { id: "r2", v: 3 },
    ]);
  });

  it("keeps the existing updated_at timestamp", () => {
    const existing = {
      updated_at: "2026-09-01T00:00:00.000Z",
      session_id: "mine",
    };
    const imported = {
      updated_at: "2026-09-06T00:00:00.000Z",
      session_id: "theirs",
    };
    const merged = mergeWorkingMemoryPayload(existing, imported);
    expect(merged.updated_at).toBe("2026-09-01T00:00:00.000Z");
    expect(merged.session_id).toBe("mine");
  });

  it("falls back to imported updated_at when existing lacks it", () => {
    const merged = mergeWorkingMemoryPayload(
      { session_id: "mine" },
      { updated_at: "2026-09-06T00:00:00.000Z" },
    );
    expect(merged.updated_at).toBe("2026-09-06T00:00:00.000Z");
  });
});
