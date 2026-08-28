import { randomUUID } from "node:crypto";
import {
  type SensemakerWaveInput,
  type SensemakerWaveOutput,
  type ImmediateInsight,
  type EvidenceNote,
  type MemoryOperation,
  type SourceRef,
  type InterviewAnswer,
  type InterviewQuestion,
} from "@/lib/working-memory/types";
import { applyMemoryOperations } from "@/lib/working-memory/operations";

function newId() {
  return randomUUID();
}

function answerSource(waveId: string, answer: InterviewAnswer): SourceRef {
  return {
    kind: "answer",
    answer_id: answer.id,
    question_id: answer.question_id,
    wave_id: waveId,
  };
}

function optionLabel(question: InterviewQuestion, value: unknown): string | undefined {
  if ((question.response_kind === "single_choice" || question.response_kind === "multi_choice") && typeof value === "string") {
    const opt = question.options?.find((o) => o.id === value);
    return opt?.label;
  }
  return undefined;
}

function answerValueText(answer: InterviewAnswer, question: InterviewQuestion): string | undefined {
  if (answer.skipped) return undefined;

  if (Array.isArray(answer.value)) {
    const parts = answer.value
      .map((v) => (typeof v === "string" ? optionLabel(question, v) ?? v.trim() : String(v)))
      .filter(Boolean);
    if (parts.length === 0) return undefined;
    return parts.join("；");
  }

  if (answer.value === undefined || answer.value === null) return undefined;
  if (typeof answer.value === "number") return String(answer.value);

  const label = optionLabel(question, answer.value);
  if (label) return label;

  if (typeof answer.value === "string") return answer.value.trim() || undefined;
  return undefined;
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return text.slice(0, max - 1) + "…";
}

const CONSTRAINT_KEYWORDS = ["时间", "金钱", "健康", "照护", "地域", "关系", "法律", "每周", "每月", "每年", "必须", "不能", "只能", "最多", "至少", "必须", "固定", "约束"];

function looksLikeConstraint(text: string): boolean {
  return CONSTRAINT_KEYWORDS.some((k) => text.includes(k));
}

function relevanceForAnswer(question: InterviewQuestion, text: string): EvidenceNote["relevance"] {
  const categories: EvidenceNote["relevance"] = ["direction"];
  if (question.text.includes("能量") || question.text.includes("投入") || text.includes("投入")) {
    categories.push("energy");
  }
  if (question.text.includes("消耗") || text.includes("消耗") || text.includes("累")) {
    categories.push("risk");
  }
  if (looksLikeConstraint(text) || question.text.includes("约束")) {
    categories.push("constraint");
  }
  return categories;
}

export function defaultInsightForWave(input: SensemakerWaveInput): ImmediateInsight {
  const waveId = input.wave_id;
  const answered = input.answers.filter((a) => !a.skipped);
  const statements = answered
    .map((a) => {
      const q = input.questions.find((qq) => qq.id === a.question_id);
      return q ? answerValueText(a, q) : undefined;
    })
    .filter((s): s is string => !!s);

  const observation = statements.length > 0
    ? truncate(`你提到：${statements.slice(0, 2).join("；")}`, 80)
    : "首波问题被跳过，我暂时只能按你的选择继续。";

  const interpretation = statements.length >= 2
    ? "你眼下最需要的不是一份更轻松的工作，而是一个能让你重新解释自己经历的方向。"
    : "目前信息还很少，我先把你的选择当作起点，后续需要你补充更多具体经历。";

  return {
    observation: truncate(observation, 80),
    interpretation: truncate(interpretation, 100),
    uncertainty: "你更在意的是身份认同、收入下限，还是日常生活的可控感。",
    evidence_ids: ["e1"],
    confidence: statements.length >= 2 ? ("medium" as const) : ("low" as const),
    kind: statements.length >= 2 ? ("tension" as const) : ("pattern" as const),
    feedback_prompt: "这条理解贴近你吗？哪里需要调整？",
  };
}

export function buildWavePatch(input: SensemakerWaveInput, insight: ImmediateInsight): SensemakerWaveOutput {
  const waveId = input.wave_id;
  const waveIndex = input.wave_index;
  const operations: MemoryOperation[] = [];
  const evidenceIds: string[] = [];

  for (const answer of input.answers) {
    const question = input.questions.find((q) => q.id === answer.question_id);
    if (!question) continue;
    const text = answerValueText(answer, question);
    if (!text) continue;

    const id = newId();
    const epistemic: EvidenceNote["epistemic"] = question.text.includes("约束") || question.text.includes("护栏") ? "user_confirmed" : "user_reported";
    const relevance = relevanceForAnswer(question, text);

    operations.push({
      op: "add_evidence",
      item: {
        temp_id: id,
        statement: truncate(text, 120),
        source_refs: [answerSource(waveId, answer)],
        epistemic,
        relevance,
        confidence: epistemic === "user_confirmed" ? "high" : "medium",
        status: "active",
      },
    });
    evidenceIds.push(id);
  }

  if (evidenceIds.length === 0) {
    const id = newId();
    operations.push({
      op: "add_evidence",
      item: {
        temp_id: id,
        statement: `本波问题（${waveId}）全部跳过，系统暂时只能依据你的主动选择来理解。`,
        source_refs: [{ kind: "answer", answer_id: "none", question_id: "none", wave_id: waveId }],
        epistemic: "user_reported",
        relevance: ["direction"],
        confidence: "low",
        status: "active",
      },
    });
    evidenceIds.push(id);
  }

  const claimId = newId();
  operations.push({
    op: "upsert_claim",
    item: {
      temp_id: claimId,
      text: truncate(insight.interpretation, 280),
      evidence_ids: evidenceIds.slice(0, 3) as [string, ...string[]],
      confidence: evidenceIds.length >= 2 ? "medium" : "low",
      status: "active",
    },
  });

  // Heuristic constraint from any evidence that looks like a constraint.
  const constraintEvidenceIds = evidenceIds.filter((eid) => {
    const answer = input.answers.find((a) => {
      const q = input.questions.find((qq) => qq.id === a.question_id);
      return q && answerValueText(a, q);
    });
    const q = answer && input.questions.find((qq) => qq.id === answer.question_id);
    const text = q ? answerValueText(answer, q) : "";
    return !!text && looksLikeConstraint(text);
  });

  if (constraintEvidenceIds.length > 0) {
    const constraintId = newId();
    const text = constraintEvidenceIds
      .map((eid) => {
        const answer = input.answers.find((a) => {
          const q = input.questions.find((qq) => qq.id === a.question_id);
          return q && answerValueText(a, q);
        });
        const q = answer && input.questions.find((qq) => qq.id === answer.question_id);
        return q ? answerValueText(answer, q) : "";
      })
      .filter(Boolean)
      .join("；") || "一个尚未明确的现实约束";

    operations.push({
      op: "upsert_constraint",
      item: {
        temp_id: constraintId,
        text,
        kind: "other",
        flexibility: "negotiable",
        evidence_ids: [constraintEvidenceIds[0]] as [string, ...string[]],
        status: "active",
      },
    });
  }

  const routeSeedIds: string[] = [];
  for (const [title_hint, life_shape, distinct_on] of [
    ["延续线", "在现有轨道上争取更多解释空间", "组织内角色"],
    ["邻近转向线", "把能力迁移到相邻领域", "自主性与收入结构"],
    ["释放型通配线", "降低固定成本，探索更不一样的可能", "生活方式与信息量"],
  ] as const) {
    const id = newId();
    routeSeedIds.push(id);
    operations.push({
      op: "upsert_route_seed",
      item: {
        temp_id: id,
        title_hint,
        life_shape,
        distinct_on,
        appeal_evidence_ids: evidenceIds.filter((_, i) => i < 2),
        feasibility_evidence_ids: constraintEvidenceIds.length > 0 ? [constraintEvidenceIds[0]] : [],
        uncertainty_ids: [],
        status: "active",
      },
    });
  }

  // Add an uncertainty if the memory has none.
  if (input.memory.uncertainties.filter((u) => u.status === "active").length === 0) {
    const uncertaintyId = newId();
    operations.push({
      op: "upsert_uncertainty",
      item: {
        temp_id: uncertaintyId,
        question: "你更在意的是身份认同、收入下限，还是日常生活的可控感？",
        plan_consequence: "答案会决定路线更偏向组织内延续、邻近转向还是释放型探索。",
        related_evidence_ids: evidenceIds.slice(0, 3),
        related_route_seed_ids: routeSeedIds,
        factors: {
          plan_impact: 3,
          evidence_gap: 2,
          user_salience: 3,
          reversibility_value: 2,
          sensitivity_cost: 0,
          repetition_cost: 0,
        },
        created_wave: waveIndex,
        status: "active",
      },
    });
  }

  // Resolve the focus uncertainty if the insight names it and there is evidence.
  if (input.focus_uncertainty_id && evidenceIds.length >= 1) {
    const focus = input.memory.uncertainties.find((u) => u.id === input.focus_uncertainty_id && u.status === "active");
    if (focus) {
      operations.push({
        op: "resolve_uncertainty",
        uncertainty_id: focus.id,
        resolution_evidence_ids: evidenceIds.slice(0, 2),
      });
    }
  }

  // Ensure the insight cites evidence that will exist after operations.
  const patched = applyMemoryOperations(input.memory, operations, { wave_id: waveId });
  const safeEvidenceIds = evidenceIds
    .filter((eid) => patched.evidence.some((e) => e.id === eid && e.status === "active"))
    .slice(0, 3);

  if (safeEvidenceIds.length === 0) {
    throw new Error("No active evidence to cite in insight");
  }

  const finalInsight: ImmediateInsight = {
    ...insight,
    evidence_ids: safeEvidenceIds as [string, ...string[]],
  };

  // Validate insight fields length.
  finalInsight.observation = truncate(finalInsight.observation, 220);
  finalInsight.interpretation = truncate(finalInsight.interpretation, 280);
  finalInsight.uncertainty = truncate(finalInsight.uncertainty, 180);
  finalInsight.feedback_prompt = truncate(finalInsight.feedback_prompt, 160);

  return {
    schema_version: "sensemaker.wave.output.v1",
    expected_revision: input.expected_revision + 1,
    operations,
    insight: finalInsight,
  };
}
