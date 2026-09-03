// Interposer: new v3 elicitation-unit/microbatch interviewer with backward-compatible `questions` output.
// Host owns focus, caps, ids and acceptance. The model only proposes language.
// See prompts/interviewer-v2.md and .loom/design/adaptive-interview-system.md

import { z } from "zod";
import { generateStructured } from "@/lib/ai/client";
import { composePrompt } from "@/lib/ai/prompts/compose";
import { defaultFallbackQuestions } from "@/lib/interview/fallback";
import type { InterviewerInput, InterviewerOutput, InterviewQuestion, WorkingMemory } from "@/lib/working-memory/types";
import type { ElicitationUnitProposal, InterviewerProposal, OpeningQuestionProposal, QuestionContentProposal } from "@/lib/state/contracts";
import { interviewerProposalSchema } from "@/lib/state/contracts";

const PROMPT_VERSION = "interviewer.v3";

function buildInterviewerEnvelope(input: InterviewerInput, memory: WorkingMemory): string {
  const evidence = input.relevant_evidence
    .map((e) => `- source ${e.source_id} rev ${e.revision} (${e.kind}, ref ${e.text_ref}, untrusted=${e.untrusted})`)
    .join("\n");

  const constraints = input.relevant_constraints
    .map((c) => `- ${c.text} (${c.kind}, ${c.flexibility})`)
    .join("\n");

  const recent = input.recent_question_texts.map((q) => `- ${q}`).join("\n");

  const materials = (input.upload_chunks ?? [])
    .map((c) => `- doc:${c.document_id} chunk:${c.ordinal}\n  ${c.text.slice(0, 300).replace(/\n/g, " ")}`)
    .join("\n");

  // Group radar by state, leading with what's still missing so the Interviewer
  // knows where to direct the next wave. unseen/declined come first, then
  // signaled (has clues but not yet grounded), then grounded/conflicted.
  const radarEntries = Object.entries(memory.radar);
  const stateOrder: Record<string, number> = { unseen: 0, declined: 1, signaled: 2, conflicted: 3, grounded: 4 };
  const sorted = [...radarEntries].sort((a, b) => (stateOrder[a[1].state] ?? 9) - (stateOrder[b[1].state] ?? 9));

  const missing = sorted
    .filter(([, cell]) => cell.state === "unseen" || cell.state === "declined")
    .map(([dim, cell]) => `- ${dim}: ${cell.state}${cell.reason ? ` — ${cell.reason}` : ""}`);
  const thin = sorted
    .filter(([, cell]) => cell.state === "signaled")
    .map(([dim, cell]) => `- ${dim}: signaled — ${cell.reason}（线索已有，但还缺具体场景/行为/取舍来 grounded）`);
  const solid = sorted
    .filter(([, cell]) => cell.state === "grounded" || cell.state === "conflicted")
    .map(([dim, cell]) => `- ${dim}: ${cell.state} — ${cell.reason}`);

  const radarSections: string[] = [];
  if (missing.length > 0) {
    radarSections.push("尚缺证据的维度：", ...missing);
  }
  if (thin.length > 0) {
    radarSections.push("有线索但证据还薄：", ...thin);
  }
  if (solid.length > 0) {
    radarSections.push("已有实质证据或冲突：", ...solid);
  }
  const radar = radarSections.join("\n");

  const unc = input.selected_uncertainty;

  return [
    `mode: open_wave`,
    `next_wave_id: ${input.next_wave_id}`,
    `next_wave_index: ${input.next_wave_index}`,
    `selected_uncertainty_id: ${input.selected_uncertainty_id}`,
    `selected_uncertainty_topic: ${unc.topic}`,
    `selected_uncertainty_question: ${unc.question}`,
    `selected_uncertainty_plan_consequence: ${unc.plan_consequence}`,
    "",
    "=== 六维雷达当前状态 ===",
    radar || "（暂无）",
    "",
    "=== 相关证据 ===",
    evidence || "（无）",
    "",
    "=== 相关约束 ===",
    constraints || "（无）",
    "",
    "=== 最近问过的问题（不要重复）===",
    recent || "（无）",
    "",
    "=== 上传材料片段（仅当与焦点未知相关时引用）===",
    materials || "（无）",
    "",
    "=== 负担信号 ===",
    `- 跳过率：${(input.burden.skip_rate * 100).toFixed(0)}%`,
    `- 平均回答长度：${input.burden.median_answer_chars} 字`,
    `- 已进行：${input.burden.elapsed_minutes.toFixed(0)} 分钟`,
    `- 用户要求缩短：${input.burden.user_requested_shorter ? "是" : "否"}`,
    "",
    "注意：一次产出 5-8 道问题，不再使用 continue_wave 分批模式。",
  ].join("\n");
}

function makePrompt(input: InterviewerInput, memory: WorkingMemory): string {
  return composePrompt<InterviewerProposal>(
    "interviewer",
    buildInterviewerEnvelope(input, memory),
    interviewerProposalSchema as z.ZodType<InterviewerProposal, z.ZodTypeDef, unknown>
  );
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
  if (output.questions.length < 5 || output.questions.length > 8) {
    return { valid: false, reason: "Question count out of range (must be 5-8)" };
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
    const raw = await generateStructured<InterviewerProposal>({
      purpose: "interviewer",
      session_id: input.session_id,
      wave_id: input.next_wave_id,
      prompt,
      schema: interviewerProposalSchema as z.ZodType<InterviewerProposal, z.ZodTypeDef, unknown>,
      max_tokens: 8000,
      timeout_ms: 60000,
      prompt_version: PROMPT_VERSION,
      fixture: () => Promise.resolve(fixtureInterviewerRaw(input)),
    });

    const normalized = normalizeInterviewerProposal(input, raw);
    const output: InterviewerOutput = {
      schema_version: "interviewer.output.v3",
      focus_uncertainty_id: input.selected_uncertainty_id,
      focus_reason: raw.reason ?? "继续深入当前焦点未知。",
      questions: normalized.questions,
      proposal: raw,
    };

    const validation = validateInterviewerOutput(input, output);
    if (validation.valid) {
      return output;
    }

    throw new Error(`Interviewer output validation failed: ${validation.reason}`);
  } catch {
    const fallback = fallbackInterviewerOutput(input);
    return { ...fallback, proposal: fallbackToProposal(input, fallback) };
  }
}

function fixtureInterviewerRaw(input: InterviewerInput): InterviewerProposal {
  const questions = defaultFallbackQuestions(input.next_wave_id, input.next_wave_index, input.selected_uncertainty);

  const openingQuestions: OpeningQuestionProposal[] = questions.slice(0, 6).map((q, idx) => ({
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
      decision_to_improve: input.selected_uncertainty.topic,
      target_dimensions: ["traits"],
      known_source_refs: input.relevant_evidence.map((e) => ({ source_id: e.source_id, source_revision: e.revision })),
      important_unknown: input.selected_uncertainty.topic,
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
      decision_to_improve: input.selected_uncertainty.topic,
      target_dimensions: ["traits"],
      known_source_refs: [],
      important_unknown: input.selected_uncertainty.topic,
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
  const questions = defaultFallbackQuestions(
    input.next_wave_id,
    input.next_wave_index,
    input.selected_uncertainty
  ) as InterviewerOutput["questions"];

  const output: InterviewerOutput = {
    schema_version: "interviewer.output.v3",
    focus_uncertainty_id: input.selected_uncertainty_id,
    focus_reason: "当前焦点需要更多具体经历来降低未知。",
    questions,
    proposal: fallbackToProposal(input, { schema_version: "interviewer.output.v3", focus_uncertainty_id: input.selected_uncertainty_id, focus_reason: "当前焦点需要更多具体经历来降低未知。", questions } as InterviewerOutput),
  };

  return output;
}
