// Wave 1 is a fixed, versioned template. Zero Interviewer calls.
// See .loom/design/adaptive-interview-system.md

import { randomUUID } from "node:crypto";
import type { Question } from "@/lib/state/contracts";
import type { InterviewQuestion } from "@/lib/working-memory/types";

export const WAVE_1_VERSION = "2026.09.03-w1";
export const WAVE_1_ID = "w1";

export function makeWave1Questions(): InterviewQuestion[] {
  return [
    {
      id: "w1q1",
      wave_id: WAVE_1_ID,
      order: 1,
      text: "我们先认识一下——你怎么称呼？",
      why_this_matters: "有个称呼，聊起来会自然一点。",
      response_kind: "short_text",
      sensitivity: "normal",
      allows_skip: true,
      asks_for_concrete_example: false,
    },
    {
      id: "w1q2",
      wave_id: WAVE_1_ID,
      order: 2,
      text: "你从哪里来？现在在哪个城市？今年多大？",
      why_this_matters: "你所在的地方和年龄段会影响后面聊到生活选择时的参照。",
      response_kind: "short_text",
      sensitivity: "normal",
      allows_skip: true,
      asks_for_concrete_example: false,
    },
    {
      id: "w1q3",
      wave_id: WAVE_1_ID,
      order: 3,
      text: "你测过 MBTI 吗？是什么类型？",
      why_this_matters:
        "只是一个参考角度。如果还没测，可以去 https://www.16personalities.com 做个免费测试再回来；也可以之后把结果截图传给我。",
      response_kind: "single_choice",
      options: [
        { id: "w1q3-istj", label: "ISTJ" },
        { id: "w1q3-isfj", label: "ISFJ" },
        { id: "w1q3-infj", label: "INFJ" },
        { id: "w1q3-intj", label: "INTJ" },
        { id: "w1q3-istp", label: "ISTP" },
        { id: "w1q3-isfp", label: "ISFP" },
        { id: "w1q3-infp", label: "INFP" },
        { id: "w1q3-intp", label: "INTP" },
        { id: "w1q3-estp", label: "ESTP" },
        { id: "w1q3-esfp", label: "ESFP" },
        { id: "w1q3-enfp", label: "ENFP" },
        { id: "w1q3-entp", label: "ENTP" },
        { id: "w1q3-estj", label: "ESTJ" },
        { id: "w1q3-esfj", label: "ESFJ" },
        { id: "w1q3-enfj", label: "ENFJ" },
        { id: "w1q3-entj", label: "ENTJ" },
        { id: "w1q3-unknown", label: "没测过或不确定" },
      ],
      allows_custom: false,
      sensitivity: "normal",
      allows_skip: true,
      asks_for_concrete_example: false,
    },
    {
      id: "w1q4",
      wave_id: WAVE_1_ID,
      order: 4,
      text: "你最近的日子，大概是什么节奏？",
      why_this_matters: "了解一下你现在的日常框架，后面聊起来有个起点。",
      response_kind: "single_choice",
      options: [
        { id: "w1q4-fixed", label: "工作日比较固定" },
        { id: "w1q4-class", label: "上课为主" },
        { id: "w1q4-flex", label: "大部分时间自己安排" },
        { id: "w1q4-irregular", label: "轮班或作息不固定" },
        { id: "w1q4-exam", label: "正在备考或申请" },
        { id: "w1q4-open", label: "暂时没有固定安排" },
      ],
      allows_custom: true,
      sensitivity: "normal",
      allows_skip: true,
      asks_for_concrete_example: false,
    },
    {
      id: "w1q5",
      wave_id: WAVE_1_ID,
      order: 5,
      text: "你来这里，是想获得什么？",
      why_this_matters: "知道你想获得什么，后面的对话才能对准你的方向。",
      response_kind: "single_choice",
      options: [
        { id: "w1q5-understand", label: "更了解自己" },
        { id: "w1q5-decision", label: "想清楚一个决定" },
        { id: "w1q5-direction", label: "想换个方向" },
        { id: "w1q5-change", label: "最近有点迷茫" },
        { id: "w1q5-curious", label: "好奇，来看看" },
      ],
      allows_custom: true,
      sensitivity: "normal",
      allows_skip: true,
      asks_for_concrete_example: false,
    },
    {
      id: "w1q6",
      wave_id: WAVE_1_ID,
      order: 6,
      text: "最近主要和谁待在一起？",
      why_this_matters: "你重要的关系和责任会影响哪些选择真的可行，后面会用到。",
      response_kind: "multi_choice",
      options: [
        { id: "w1q6-partner", label: "伴侣" },
        { id: "w1q6-family", label: "家人" },
        { id: "w1q6-friends", label: "朋友" },
        { id: "w1q6-classmates", label: "同学或室友" },
        { id: "w1q6-coworkers", label: "同事" },
        { id: "w1q6-solo", label: "大多数时候自己" },
      ],
      allows_custom: true,
      sensitivity: "normal",
      allows_skip: true,
      asks_for_concrete_example: false,
    },
    {
      id: "w1q7",
      wave_id: WAVE_1_ID,
      order: 7,
      text: "你现在大概在什么阶段？",
      why_this_matters: "知道你现在的阶段，后面才知道从哪里开始聊、哪些选择值得展开。",
      response_kind: "single_choice",
      options: [
        { id: "w1q7-student", label: "在读" },
        { id: "w1q7-exam", label: "在备考或申请" },
        { id: "w1q7-jobhunt", label: "在找工作或实习" },
        { id: "w1q7-working", label: "正在工作" },
        { id: "w1q7-transition", label: "刚毕业、辞职或搬家" },
        { id: "w1q7-break", label: "暂时休息或待业" },
      ],
      allows_custom: true,
      sensitivity: "normal",
      allows_skip: true,
      asks_for_concrete_example: false,
    },
    {
      id: "w1q8",
      wave_id: WAVE_1_ID,
      order: 8,
      text: `最近发生了哪件事，让你开始想「接下来该怎么走」？`,
      why_this_matters: "从一件真实发生的事开始，后面的问题才不会悬在空中。可以只写两三句话。",
      response_kind: "short_text",
      sensitivity: "normal",
      allows_skip: true,
      asks_for_concrete_example: true,
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
    w1q1: ["narrative"],
    w1q2: ["environment", "narrative"],
    w1q3: ["traits"],
    w1q4: ["environment"],
    w1q5: ["motivation"],
    w1q6: ["relationships"],
    w1q7: ["narrative", "environment"],
    w1q8: ["narrative", "motivation"],
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
    decision_to_improve: "用轻松的自我介绍建立基础画像，为后续波次提供叙事、特质、动机、环境和关系的起点",
    target_dimensions: [...targetDimensions],
    known_source_refs: [] as { source_id: string; source_revision: number }[],
    important_unknown: "用户当前最关心的选择、卡点或变化，以及哪些现实边界不能先动",
    why_now: "先确认你是谁、在什么处境下，再谈你要去哪里",
    exit_condition: "有姓名、来源、MBTI 参考、生活节奏、来访意图、关系结构和至少一个可聊的钩子",
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

