// Wave 1 is a fixed, versioned template. Zero Interviewer calls.
// See .loom/design/adaptive-interview-system.md

import { randomUUID } from "node:crypto";
import type { Question } from "@/lib/state/contracts";
import type { InterviewQuestion } from "@/lib/working-memory/types";

export const WAVE_1_VERSION = "2026.08.27-w1";
export const WAVE_1_ID = "w1";

export function makeWave1Questions(): InterviewQuestion[] {
  return [
    {
      id: "w1q1",
      wave_id: WAVE_1_ID,
      order: 1,
      text: "未来三年里，哪个选择、卡点或变化最值得先想清楚？",
      why_this_matters: "这决定我们先把注意力放在哪里，而不是给你分类。",
      response_kind: "single_choice",
      options: [
        { id: "w1q1-a", label: "工作内容本身消耗大，但方向还算清楚" },
        { id: "w1q1-b", label: "方向不清，不确定现在做的事有没有意义" },
        { id: "w1q1-c", label: "人际关系或环境让人想离开" },
        { id: "w1q1-d", label: "收入和安全感不够" },
        { id: "w1q1-e", label: "不是单一原因，很难说清楚" },
      ],
      allows_custom: true,
      sensitivity: "normal",
      allows_skip: true,
      asks_for_concrete_example: false,
    },
    {
      id: "w1q2",
      wave_id: WAVE_1_ID,
      order: 2,
      text: "最近的状态里，哪些词更接近你？（可多选）",
      why_this_matters: "比单独一个标签更能看出你现在的能量来源和压力点。",
      response_kind: "multi_choice",
      options: [
        { id: "w1q2-a", label: "有投入感" },
        { id: "w1q2-b", label: "被推着走" },
        { id: "w1q2-c", label: "不确定" },
        { id: "w1q2-d", label: "有点兴奋" },
        { id: "w1q2-e", label: "消耗" },
      ],
      allows_custom: true,
      sensitivity: "normal",
      allows_skip: true,
      asks_for_concrete_example: false,
    },
    {
      id: "w1q3",
      wave_id: WAVE_1_ID,
      order: 3,
      text: "最近一个让你投入或有能量的具体时刻发生了什么？",
      why_this_matters: "具体经历比标签更能说明什么在给你能量。",
      response_kind: "short_text",
      sensitivity: "normal",
      allows_skip: true,
      asks_for_concrete_example: true,
    },
    {
      id: "w1q4",
      wave_id: WAVE_1_ID,
      order: 4,
      text: "目前有哪些现实护栏需要考虑？（可多选）",
      why_this_matters: "这些是现实边界，不等于你的限制，但会影响可选动作。",
      response_kind: "multi_choice",
      options: [
        { id: "w1q4-a", label: "时间上限" },
        { id: "w1q4-b", label: "收入下限" },
        { id: "w1q4-c", label: "健康或照护" },
        { id: "w1q4-d", label: "地域或关系" },
        { id: "w1q4-e", label: "可协商" },
      ],
      allows_custom: true,
      sensitivity: "sensitive",
      allows_skip: true,
      asks_for_concrete_example: false,
    },
  ];
}

export function makeWave1AnswerId() {
  return randomUUID();
}

// Build a canonical v3 Wave for the fixed Wave 1 template.
// Host-owned generation provenance; units/questions get deterministic ids by wave index.
export function buildWave1Canonical(sessionId: string, provenanceId: string, revision: number) {
  const missionId = randomUUID();
  const batchId = randomUUID();
  const questions = makeWave1Questions();

  const targetDimensions = ["traits", "motivation", "capabilities", "relationships", "environment", "narrative"] as const;
  type RadarDimension = "traits" | "motivation" | "capabilities" | "relationships" | "environment" | "narrative";
  const unitTargetMap: Record<string, RadarDimension[]> = {
    w1q1: ["traits", "narrative"],
    w1q2: ["motivation", "capabilities"],
    w1q3: ["motivation", "narrative"],
    w1q4: ["environment", "relationships"],
  };

  const elicitationUnits = questions.map((q, i) => ({
    id: `eu-1-${i}`,
    generation_provenance_id: missionId,
    order_in_wave: i + 1,
    decision_target: q.text.slice(0, 40),
    target_dimensions: unitTargetMap[q.id] ?? ["traits"],
    status: "pending" as const,
    source_refs: [] as { source_id: string; source_revision: number }[],
    question_id: undefined as string | undefined,
  }));

  const responseKindMap: Record<string, Question["response_kind"]> = {
    single_choice: "single_choice",
    multi_choice: "multiple_choice",
    short_text: "short_text",
    scale: "anchored_scale",
  };

  const mappedQuestions = questions.map((q, i) => ({
    id: q.id,
    wave_id: WAVE_1_ID,
    microbatch_id: batchId,
    generation_provenance_id: missionId,
    order_in_wave: i + 1,
    elicitation_unit_id: elicitationUnits[i].id,
    text: q.text,
    response_kind: responseKindMap[q.response_kind] ?? (q.response_kind as Question["response_kind"]),
    options: q.options?.map((o) => ({
      id: o.id,
      generation_provenance_id: missionId,
      label: o.label,
      description: undefined as string | undefined,
    })),
    sensitivity: (q.sensitivity === "normal" ? "ordinary" : "sensitive") as "ordinary" | "sensitive",
    why_this_matters: q.why_this_matters ?? "",
    decision_target: q.text.slice(0, 40),
    asks_for_concrete_example: q.asks_for_concrete_example,
    allows_skip: true as const,
    allows_free_text: true as const,
  }));

  const microbatch = {
    id: batchId,
    wave_id: WAVE_1_ID,
    generation_provenance_id: missionId,
    index: 1,
    session_revision: revision,
    status: "proposed" as const,
    idempotency_key: `wave-${WAVE_1_ID}-batch-1`,
    questions: mappedQuestions,
  };

  const waveMission = {
    id: missionId,
    wave_id: WAVE_1_ID,
    generation_provenance_id: missionId,
    decision_to_improve: "未来三年里，哪个选择、卡点或变化最值得先想清楚",
    target_dimensions: [...targetDimensions],
    known_source_refs: [] as { source_id: string; source_revision: number }[],
    important_unknown: "用户的具体情境和真实边界",
    why_now: "现在是把方向先看清的时机",
    exit_condition: "有明确的方向、护栏和至少一种可试行的选择",
    sensitivity_ceiling: "ordinary" as const,
  };

  return {
    id: WAVE_1_ID,
    index: 1,
    kind: "core" as const,
    mission: waveMission,
    status: "open" as const,
    microbatches: [microbatch],
    asked_count: 0,
    elicitation_units: elicitationUnits,
    covered_unit_count: 0,
  };
}

