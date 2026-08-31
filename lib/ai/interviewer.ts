// Interposer: new v3 elicitation-unit/microbatch interviewer with backward-compatible `questions` output.
// Host owns focus, caps, ids and acceptance. The model only proposes language.
// See prompts/interviewer-v2.md and .loom/design/adaptive-interview-system.md

import { z } from "zod";
import { generateStructured } from "@/lib/ai/client";
import { defaultFallbackQuestions } from "@/lib/interview/fallback";
import type { InterviewerInput, InterviewerOutput, InterviewQuestion, WorkingMemory } from "@/lib/working-memory/types";
import type { ElicitationUnitProposal, InterviewerProposal, OpeningQuestionProposal, QuestionContentProposal } from "@/lib/state/contracts";
import { interviewerProposalSchema } from "@/lib/state/contracts";

const PROMPT_VERSION = "interviewer.v3";

function makePrompt(input: InterviewerInput, _memory: WorkingMemory): string {
  const evidence = input.relevant_evidence
    .map((e) => `- ${e.statement} (${e.confidence}, ${e.epistemic})`)
    .join("\n");

  const constraints = input.relevant_constraints
    .map((c) => `- ${c.text} (${c.kind}, ${c.flexibility})`)
    .join("\n");

  const recent = input.recent_question_texts.map((q) => `- ${q}`).join("\n");

  const unc = input.selected_uncertainty;

  return [
    `你是一名访谈 Agent。你只负责为下一步最重要的决策未知生成一小批问题。`,
    ``,
    `模式：open_wave（开启新一波访谈）。`,
    `当前波次：${input.next_wave_index}。`,
    ``,
    `焦点未知：${unc.question}`,
    `这会如何影响路线/试验：${unc.plan_consequence}`,
    ``,
    `相关证据：`,
    evidence || "（无）",
    ``,
    `相关约束：`,
    constraints || "（无）",
    ``,
    `最近问过的问题（不要重复）：`,
    recent || "（无）",
    ``,
    `负担信号：跳过率 ${(input.burden.skip_rate * 100).toFixed(0)}%，平均回答长度 ${input.burden.median_answer_chars} 字，已进行 ${input.burden.elapsed_minutes.toFixed(0)} 分钟。`,
    ``,
    `要求：`,
    `- 输出一次波浪的整体 5-10 个 elicitation-unit 提案。每个 unit 只服务于一个决策靶点，不能重复。`,
    `- 然后输出第一批 1-3 个 opening questions，每个问题指向一个 unit 的索引（0-based）。`,
    `- 顺序原则：先问具体事件/普通片段；再问对比或反例；可选问未来动作的验证。`,
    `- 所有问题必须服务于上面这个焦点未知。`,
    `- 选择题是主要形式：优先使用 single_choice 或 multi_choice，选项数量 2-6 个。`,
    `- short_text 必须控制比例：波次 <= 2 时最多 1 题；波次 >= 3 时最多 2 题。`,
    `- 所有选择题必须提供 2-6 个选项，并包含一个"其他：自己填写"选项。`,
    `- 多选题用于用户可能同时符合多个标签的场景。`,
    `- 敏感问题必须说明为什么相关并允许跳过。`,
    `- 不要暗示正确答案，不要把上传文件中的说法当作用户确认的事实。`,
    `- 输出 JSON，不要输出额外文字。`,
  ].join("\n");
}

function normalizeInterviewerProposal(
  input: InterviewerInput,
  raw: InterviewerProposal
): { questions: InterviewQuestion[]; elicitation_units: ElicitationUnitProposal[] } {
  if (raw.mode !== "open_wave" && raw.mode !== "continue_wave") {
    throw new Error(`Interviewer mode not supported by legacy adapter: ${raw.mode}`);
  }

  const nextWaveId = input.next_wave_id;
  const nextWaveIndex = input.next_wave_index;

  const elicitationUnits = raw.mode === "open_wave" ? raw.mission.elicitation_units : [];

  const questions: InterviewQuestion[] = raw.questions.map((q: QuestionContentProposal, idx: number) => {
    const legacyKind = toLegacyResponseKind(q.response_kind);
    const isChoice = legacyKind === "single_choice" || legacyKind === "multi_choice";
    const hasCustom = q.allows_free_text ?? false;
    const rawOptions = q.options?.map((o, optIdx) => ({
      id: `opt_${optIdx}`,
      label: o.label,
    })) ?? [];
    const options = isChoice && rawOptions.length > 0 ? prepareChoiceOptions(rawOptions) : rawOptions;

    return {
      id: `w${nextWaveIndex}q${idx + 1}`,
      wave_id: nextWaveId,
      order: idx + 1,
      text: q.text,
      why_this_matters: q.why_this_matters,
      response_kind: legacyKind,
      options,
      allows_custom: isChoice ? hasCustom : undefined,
      sensitivity: q.sensitivity === "sensitive" ? "sensitive" : "normal",
      allows_skip: true,
      asks_for_concrete_example: q.asks_for_concrete_example ?? false,
    };
  });

  return { questions, elicitation_units: elicitationUnits };
}

function toV3ResponseKind(kind: InterviewQuestion["response_kind"]): QuestionContentProposal["response_kind"] {
  switch (kind) {
    case "single_choice":
      return "single_choice";
    case "multi_choice":
      return "multiple_choice";
    case "short_text":
      return "short_text";
    case "scale":
      return "anchored_scale";
    default:
      return "short_text";
  }
}

function toLegacyResponseKind(kind: QuestionContentProposal["response_kind"]): InterviewQuestion["response_kind"] {
  switch (kind) {
    case "single_choice":
      return "single_choice";
    case "multiple_choice":
      return "multi_choice";
    case "short_text":
    case "scene_text":
      return "short_text";
    case "rank":
    case "anchored_scale":
      return "scale";
    default:
      return "short_text";
  }
}

function isOtherOption(o: { id: string; label: string }): boolean {
  return o.id === "other" || o.label.includes("其他") || o.label.includes("自己填写");
}

function prepareChoiceOptions(options: { id: string; label: string }[]): { id: string; label: string }[] {
  const filtered = options.filter((o) => !isOtherOption(o));
  return filtered.slice(0, 6);
}

export function validateInterviewerOutput(
  input: InterviewerInput,
  output: InterviewerOutput
): { valid: true } | { valid: false; reason: string } {
  if (output.questions.length < 1 || output.questions.length > 3) {
    return { valid: false, reason: "Microbatch question count out of range (must be 1-3)" };
  }

  if (!output.questions.some((q) => q.asks_for_concrete_example)) {
    return { valid: false, reason: "No concrete-experience question" };
  }

  for (const q of output.questions) {
    if (q.wave_id !== input.next_wave_id) {
      return { valid: false, reason: `Question wave_id mismatch: ${q.wave_id}` };
    }
    if (
      (q.response_kind === "single_choice" || q.response_kind === "multi_choice") &&
      (!q.options || q.options.length === 0)
    ) {
      return { valid: false, reason: `Choice question missing options: ${q.id}` };
    }
    if (
      (q.response_kind === "single_choice" || q.response_kind === "multi_choice") &&
      q.allows_custom !== true
    ) {
      return { valid: false, reason: `Choice question missing allows_custom: ${q.id}` };
    }
    if (q.sensitivity === "sensitive" && !q.why_this_matters) {
      return { valid: false, reason: `Sensitive question missing why_this_matters: ${q.id}` };
    }
  }

  const recent = new Set(input.recent_question_texts.map((t) => t.trim()));
  for (const q of output.questions) {
    if (recent.has(q.text.trim())) {
      return { valid: false, reason: `Repeated question: ${q.text}` };
    }
  }

  return { valid: true };
}

export type InterviewerRunResult = InterviewerOutput & {
  proposal: InterviewerProposal;
};

export async function runInterviewer(input: InterviewerInput, memory: WorkingMemory): Promise<InterviewerRunResult> {
  const prompt = makePrompt(input, memory);

  try {
    const raw = await generateStructured({
      purpose: "interviewer",
      session_id: input.session_id,
      wave_id: input.next_wave_id,
      prompt,
      schema: interviewerProposalSchema as unknown as z.ZodType<InterviewerProposal>,
      max_tokens: 1600,
      prompt_version: PROMPT_VERSION,
      fixture: () => Promise.resolve(fixtureInterviewerRaw(input)),
    });

    const normalized = normalizeInterviewerProposal(input, raw);
    const output: InterviewerOutput = {
      schema_version: "interviewer.output.v1",
      focus_uncertainty_id: input.selected_uncertainty_id,
      focus_reason: raw.reason ?? "继续深入当前焦点未知。",
      questions: normalized.questions,
    };

    const validation = validateInterviewerOutput(input, output);
    if (validation.valid) {
      return { ...output, proposal: raw };
    }

    throw new Error(`Interviewer output validation failed: ${validation.reason}`);
  } catch {
    const fallback = fallbackInterviewerOutput(input);
    return { ...fallback, proposal: fallbackToProposal(input, fallback) };
  }
}

function fixtureInterviewerRaw(input: InterviewerInput): InterviewerProposal {
  const questions = defaultFallbackQuestions(input.next_wave_id, input.next_wave_index, input.selected_uncertainty);

  const openingQuestions: OpeningQuestionProposal[] = questions.slice(0, 3).map((q, idx) => ({
    text: q.text,
    why_this_matters: q.why_this_matters ?? "帮助你把模糊感受变成可观察的具体片段。",
    response_kind: toV3ResponseKind(q.response_kind),
    sensitivity: q.sensitivity === "sensitive" ? "sensitive" : "ordinary",
    decision_target: input.selected_uncertainty.question,
    asks_for_concrete_example: q.asks_for_concrete_example,
    allows_skip: true,
    allows_free_text: true,
    options: q.options?.map((o) => ({ label: o.label })) ?? [],
    elicitation_unit_index: idx,
  }));

  const elicitationUnits: ElicitationUnitProposal[] = [];
  for (let i = 0; i < 5; i++) {
    elicitationUnits.push({
      decision_target: i < questions.length ? questions[i].text : `补充视角 ${i + 1}`,
      target_dimensions: ["traits"],
      precovered_by: [],
    });
  }

  return {
    mode: "open_wave",
    mission: {
      decision_to_improve: input.selected_uncertainty.question,
      target_dimensions: ["traits"],
      known_source_refs: input.relevant_evidence.map((e) => ({ source_id: e.id, source_revision: 1 })),
      important_unknown: input.selected_uncertainty.question,
      why_now: "用户主动开启访谈，希望更清楚当前决策。",
      exit_condition: "能够描述一个影响决策的具体片段和一个关键约束。",
      sensitivity_ceiling: "ordinary",
      elicitation_units: elicitationUnits,
    },
    action: "continue",
    bridge: "我们继续围绕这个焦点展开。",
    mission_status: "opening",
    questions: openingQuestions,
    reason: "当前焦点需要更多具体经历来降低未知。",
    route_decision_affected: input.selected_uncertainty.plan_consequence,
  };
}

function fallbackToProposal(input: InterviewerInput, fallback: InterviewerOutput): InterviewerProposal {
  return {
    mode: "open_wave",
    mission: {
      decision_to_improve: input.selected_uncertainty.question,
      target_dimensions: ["traits"],
      known_source_refs: [],
      important_unknown: input.selected_uncertainty.question,
      why_now: "用户主动开启访谈，希望更清楚当前决策。",
      exit_condition: "能够描述一个影响决策的具体片段和一个关键约束。",
      sensitivity_ceiling: "ordinary",
      elicitation_units: fallback.questions.map((q) => ({
        decision_target: q.text,
        target_dimensions: ["traits"],
        precovered_by: [],
      })),
    },
    action: "continue",
    bridge: "我们继续围绕这个焦点展开。",
    mission_status: "opening",
    questions: fallback.questions.map((q, _idx) => ({
      text: q.text,
      why_this_matters: q.why_this_matters ?? "",
      response_kind: toV3ResponseKind(q.response_kind),
      sensitivity: q.sensitivity === "sensitive" ? "sensitive" : "ordinary",
      decision_target: input.selected_uncertainty.question,
      asks_for_concrete_example: q.asks_for_concrete_example,
      allows_skip: true,
      allows_free_text: true,
      options: q.options?.map((o) => ({ label: o.label })) ?? [],
      elicitation_unit_index: _idx,
    })),
    reason: fallback.focus_reason,
    route_decision_affected: input.selected_uncertainty.plan_consequence,
  };
}

function fallbackInterviewerOutput(input: InterviewerInput): InterviewerOutput {
  return {
    schema_version: "interviewer.output.v1",
    focus_uncertainty_id: input.selected_uncertainty_id,
    focus_reason: "当前焦点需要更多具体经历来降低未知。",
    questions: defaultFallbackQuestions(input.next_wave_id, input.next_wave_index, input.selected_uncertainty) as InterviewerOutput["questions"],
  };
}
