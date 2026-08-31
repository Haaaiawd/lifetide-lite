import { describe, it, expect } from "vitest";
import {
  interviewerProposalSchema,
  waveMissionProposalSchema,
  openingQuestionProposalSchema,
  continuationQuestionProposalSchema,
} from "@/lib/state/contracts";

const validMission = {
  decision_to_improve: "厘清用户当前最在意的选择卡点",
  target_dimensions: ["traits", "motivation"],
  known_source_refs: [],
  important_unknown: "什么会让用户判断这个卡点是否值得继续",
  why_now: "用户刚描述了一个具体消耗场景",
  exit_condition: "能指出至少一个具体场景和一种取舍",
  sensitivity_ceiling: "ordinary",
  elicitation_units: Array.from({ length: 5 }, (_, i) => ({
    decision_target: `target-${i}`,
    target_dimensions: ["traits"],
    precovered_by: [],
  })),
};

const validOpenWave = {
  mode: "open_wave",
  mission: validMission,
  action: "continue",
  bridge: "好的，我先确认一下你刚才说的场景。",
  mission_status: "opening",
  questions: [
    {
      text: "那个时刻之前发生了什么？",
      why_this_matters: "把场景起点锚定",
      response_kind: "scene_text",
      sensitivity: "ordinary",
      decision_target: "target-0",
      asks_for_concrete_example: true,
      allows_skip: true,
      allows_free_text: true,
      elicitation_unit_index: 0,
    },
  ],
  reason: "先获取一个可观察的起点",
  route_decision_affected: "理解用户眼下最需要处理什么",
};

describe("InterviewerProposal contract", () => {
  it("accepts a valid open_wave with 1-3 questions and 5-10 units", () => {
    const parsed = interviewerProposalSchema.parse(validOpenWave);
    expect(parsed.mode).toBe("open_wave");
    if (parsed.mode !== "open_wave") throw new Error("Expected open_wave");
    expect(parsed.mission.elicitation_units.length).toBe(5);
    expect(parsed.questions.length).toBe(1);
  });

  it("rejects open_wave with 11 units", () => {
    const tooManyUnits = {
      ...validOpenWave,
      mission: {
        ...validMission,
        elicitation_units: Array.from({ length: 11 }, (_, i) => ({
          decision_target: `target-${i}`,
          target_dimensions: ["traits"],
          precovered_by: [],
        })),
      },
    };
    expect(() => interviewerProposalSchema.parse(tooManyUnits)).toThrow();
  });

  it("rejects continue_wave with elicitation_unit_index", () => {
    const invalidContinue = {
      mode: "continue_wave",
      action: "continue",
      mission_status: "developing",
      questions: [
        {
          text: "那个时刻之前发生了什么？",
          why_this_matters: "把场景起点锚定",
          response_kind: "scene_text",
          sensitivity: "ordinary",
          decision_target: "target-0",
          asks_for_concrete_example: true,
          allows_skip: true,
          allows_free_text: true,
          elicitation_unit_index: 0,
        },
      ],
      reason: "继续追问",
      route_decision_affected: "理解场景",
    };
    expect(() => interviewerProposalSchema.parse(invalidContinue)).toThrow();
  });

  it("rejects propose_deep_dive with questions", () => {
    const invalidDeepDive = {
      mode: "propose_deep_dive",
      action: "deep_dive",
      mission_status: "sufficient",
      questions: [validOpenWave.questions[0]],
      reason: "需要继续理解",
      route_decision_affected: "路线判断",
      deep_dive_reason: "high_impact_signal",
      source_refs: [{ source_id: "s1", source_revision: 1 }],
    };
    expect(() => interviewerProposalSchema.parse(invalidDeepDive)).toThrow();
  });
});

describe("WaveMissionProposal contract", () => {
  it("requires exactly 5-10 elicitation units", () => {
    expect(waveMissionProposalSchema.parse(validMission).elicitation_units.length).toBe(5);
  });

  it("rejects fewer than 5 units", () => {
    const tooFew = {
      ...validMission,
      elicitation_units: validMission.elicitation_units.slice(0, 4),
    };
    expect(() => waveMissionProposalSchema.parse(tooFew)).toThrow();
  });
});
