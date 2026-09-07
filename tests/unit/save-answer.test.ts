import { describe, it, expect } from "vitest";
import { normalizeAnswerValue, parseAnswerValue } from "@/lib/db/save-answer";
import type { InterviewQuestion } from "@/lib/working-memory/types";

describe("answer value normalization and parsing", () => {
  it("normalizes arrays into a single joined string", () => {
    expect(normalizeAnswerValue(["opt-a", "opt-b"])).toBe("opt-a；opt-b");
  });

  it("normalizes numbers and text to strings", () => {
    expect(normalizeAnswerValue(5)).toBe("5");
    expect(normalizeAnswerValue("hello")).toBe("hello");
  });

  it("treats empty/null/undefined values as null", () => {
    expect(normalizeAnswerValue(null)).toBeNull();
    expect(normalizeAnswerValue(undefined)).toBeNull();
    expect(normalizeAnswerValue("")).toBeNull();
    expect(normalizeAnswerValue([])).toBeNull();
  });

  it("round-trips multi-choice answers through parseAnswerValue", () => {
    const q: InterviewQuestion = {
      id: "q1",
      wave_id: "w1",
      order: 1,
      text: "choose",
      response_kind: "multi_choice",
      options: [
        { id: "opt-a", label: "A" },
        { id: "opt-b", label: "B" },
      ],
      allows_skip: false,
      sensitivity: "normal",
      allows_custom: false,
    };
    const stored = normalizeAnswerValue(["opt-a", "opt-b"]);
    expect(parseAnswerValue(stored, q)).toEqual(["opt-a", "opt-b"]);
  });

  it("round-trips scale answers through parseAnswerValue", () => {
    const q: InterviewQuestion = {
      id: "q2",
      wave_id: "w1",
      order: 2,
      text: "rate",
      response_kind: "scale",
      options: [{ id: "3", label: "3" }],
      allows_skip: false,
      sensitivity: "normal",
      allows_custom: false,
    };
    expect(parseAnswerValue("5", q)).toBe(5);
  });
});
