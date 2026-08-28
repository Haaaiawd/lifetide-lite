// Interviewer Agent: generates the next 3-5 question batch around the single
// highest-impact uncertainty. Host validates, normalizes ids and rejects focus drift.
// See .loom/design/adaptive-interview-system.md §3

import { z } from "zod";
import { generateStructured } from "@/lib/ai/client";
import { defaultFallbackQuestions } from "@/lib/interview/fallback";
import type { InterviewerInput, InterviewerOutput, InterviewQuestion, WorkingMemory } from "@/lib/working-memory/types";

const generatedQuestionSchema = z.object({
  text: z.string().min(1).max(160),
  why_this_matters: z.string().max(160).optional(),
  response_kind: z.enum(["short_text", "single_choice", "multi_choice", "scale"]),
  options: z
    .array(
      z.object({
        id: z.string(),
        label: z.string(),
      })
    )
    .optional(),
  allows_custom: z.boolean().optional(),
  sensitivity: z.enum(["normal", "sensitive"]),
  asks_for_concrete_example: z.boolean(),
});

const interviewerOutputSchema = z
  .object({
    focus_uncertainty_id: z.string(),
    focus_reason: z.string().max(240),
    questions: z.array(generatedQuestionSchema).min(3).max(5),
  })
  .strict();

function makePrompt(input: InterviewerInput, memory: WorkingMemory): string {
  const evidence = input.relevant_evidence
    .map((e) => `- ${e.statement} (${e.confidence}, ${e.epistemic})`)
    .join("\n");

  const constraints = input.relevant_constraints
    .map((c) => `- ${c.text} (${c.kind}, ${c.flexibility})`)
    .join("\n");

  const recent = input.recent_question_texts.map((q) => `- ${q}`).join("\n");

  const unc = input.selected_uncertainty;

  return [
    `你是一名访谈 Agent，只为用户下一步最重要的问题生成 3-5 道题。`,
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
    `- 所有问题必须服务于上面这个焦点未知。`,
    `- 3 到 5 题，顺序递进：至少一题要求具体事件/普通片段；一题追问边界或反例；可选一题帮助验证未来动作。`,
    `- 选择题是主要形式：优先使用 single_choice 或 multi_choice，选项数量 2-6 个均可。`,
    `- 填空题（short_text）必须控制比例：wave_index <= 2 时最多 1 题 short_text；wave_index >= 3 时可增加到最多 2 题。`,
    `- 所有选择题（single_choice 和 multi_choice）必须提供 2-6 个选项，并包含一个"其他：自己填写"选项，且 allows_custom=true。`,
    `- 多选题（multi_choice）用于用户可能同时符合多个标签的场景。`,
    `- 敏感问题必须说明为什么相关并允许跳过（sensitivity=sensitive）。`,
    `- 不要暗示正确答案，不要把上传文件中的说法当作用户确认的事实。`,
    `- 输出 JSON，focus_uncertainty_id 必须是 "${input.selected_uncertainty_id}"，focus_reason 简要说明为什么选这个焦点。`,
  ].join("\n");
}

export function normalizeInterviewerOutput(
  input: InterviewerInput,
  raw: z.infer<typeof interviewerOutputSchema>
): InterviewerOutput {
  const nextWaveId = input.next_wave_id;
  const nextWaveIndex = input.next_wave_index;

  const questions: InterviewQuestion[] = raw.questions.map((q, idx) => {
    const isChoice = q.response_kind === "single_choice" || q.response_kind === "multi_choice";
    const hasCustom = q.allows_custom || q.options?.some((o) => o.id === "other" || o.label.includes("其他"));
    const options = isChoice && q.options && q.options.length > 0
      ? prepareChoiceOptions(q.options)
      : q.options;

    return {
      id: `w${nextWaveIndex}q${idx + 1}`,
      wave_id: nextWaveId,
      order: idx + 1,
      text: q.text,
      why_this_matters: q.why_this_matters,
      response_kind: q.response_kind,
      options,
      allows_custom: isChoice ? hasCustom : undefined,
      sensitivity: q.sensitivity,
      allows_skip: true,
      asks_for_concrete_example: q.asks_for_concrete_example ?? false,
    };
  });

  return {
    schema_version: "interviewer.output.v1",
    focus_uncertainty_id: raw.focus_uncertainty_id,
    focus_reason: raw.focus_reason,
    questions: questions as InterviewerOutput["questions"],
  };
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
  if (output.focus_uncertainty_id !== input.selected_uncertainty_id) {
    return { valid: false, reason: "Focus mismatch" };
  }

  if (output.questions.length < 3 || output.questions.length > 5) {
    return { valid: false, reason: "Question count out of range" };
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

export async function runInterviewer(input: InterviewerInput, memory: WorkingMemory): Promise<InterviewerOutput> {
  const prompt = makePrompt(input, memory);

  try {
    const raw = await generateStructured({
      purpose: "interviewer",
      session_id: input.session_id,
      wave_id: input.next_wave_id,
      prompt,
      schema: interviewerOutputSchema,
      max_tokens: 1200,
      prompt_version: "interviewer.v1",
      fixture: () => Promise.resolve(fixtureInterviewerRaw(input)),
    });

    const output = normalizeInterviewerOutput(input, raw);
    const validation = validateInterviewerOutput(input, output);

    if (validation.valid) {
      return output;
    }

    throw new Error(`Interviewer output validation failed: ${validation.reason}`);
  } catch {
    return fallbackInterviewerOutput(input);
  }
}

function fixtureInterviewerRaw(input: InterviewerInput): z.infer<typeof interviewerOutputSchema> {
  const questions = defaultFallbackQuestions(input.next_wave_id, input.next_wave_index, input.selected_uncertainty);
  return {
    focus_uncertainty_id: input.selected_uncertainty_id,
    focus_reason: "当前焦点需要更多具体经历来降低未知。",
    questions: questions.map((q) => ({
      text: q.text,
      why_this_matters: q.why_this_matters,
      response_kind: q.response_kind,
      options: q.options,
      sensitivity: q.sensitivity,
      asks_for_concrete_example: q.asks_for_concrete_example,
    })),
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
