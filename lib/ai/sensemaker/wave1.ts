// Deterministic Wave 1 Sensemaker — zero Interviewer calls, zero external model calls.
// Produces a runtime-validated SensemakerWaveOutput from the four Wave 1 template answers.
// See .loom/design/insight-plan-contracts.md

import { randomUUID } from "node:crypto";
import type {
  WorkingMemory,
  SensemakerWaveOutput,
  InterviewQuestion,
  InterviewAnswer,
  MemoryOperation,
  ImmediateInsight,
  EvidenceNote,
  SourceRef,
} from "@/lib/working-memory/types";
import { applyMemoryOperations } from "@/lib/working-memory/operations";

const WAVE_ID = "w1";

function tempId() {
  return randomUUID();
}

function findQuestion(questions: InterviewQuestion[], id: string): InterviewQuestion | undefined {
  return questions.find((q) => q.id === id);
}

function findAnswer(answers: InterviewAnswer[], questionId: string): InterviewAnswer | undefined {
  return answers.find((a) => a.question_id === questionId);
}

function labelForQ1(questions: InterviewQuestion[], answer?: InterviewAnswer): string {
  if (!answer || answer.skipped) return "没有明确说明";
  const value = Array.isArray(answer.value) ? answer.value[0] : answer.value;
  if (typeof value !== "string") return "没有明确说明";
  const q = findQuestion(questions, "w1q1");
  const opt = q?.options?.find((o) => o.id === value);
  return opt?.label ?? value;
}

function textValue(answer?: InterviewAnswer): string | undefined {
  if (!answer || answer.skipped) return undefined;
  const value = Array.isArray(answer.value) ? answer.value.join("；") : answer.value;
  if (typeof value !== "string") return undefined;
  return value.trim();
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return text.slice(0, max - 1) + "…";
}

function answerSource(answer: InterviewAnswer): SourceRef {
  return {
    kind: "answer",
    answer_id: answer.id,
    question_id: answer.question_id,
    wave_id: answer.wave_id,
  };
}

function makeEvidenceFromAnswer(
  answer: InterviewAnswer,
  statement: string,
  epistemic: EvidenceNote["epistemic"],
  relevance: EvidenceNote["relevance"],
  confidence: EvidenceNote["confidence"] = "medium"
): { evidence: Omit<EvidenceNote, "id"> & { temp_id: string }; id: string } {
  const id = tempId();
  return {
    id,
    evidence: {
      temp_id: id,
      statement: truncate(statement, 280),
      source_refs: [answerSource(answer)],
      epistemic,
      relevance,
      confidence,
      status: "active",
    },
  };
}

export function runWave1Sensemaker(
  memory: WorkingMemory,
  questions: InterviewQuestion[],
  answers: InterviewAnswer[]
): SensemakerWaveOutput {
  const operations: MemoryOperation[] = [];

  const q1Answer = findAnswer(answers, "w1q1");
  const q2Answer = findAnswer(answers, "w1q2");
  const q3Answer = findAnswer(answers, "w1q3");
  const q4Answer = findAnswer(answers, "w1q4");

  const q1Label = labelForQ1(questions, q1Answer);
  const q2Text = textValue(q2Answer);
  const q3Text = textValue(q3Answer);
  const q4Text = textValue(q4Answer);

  // Evidence notes
  const evidenceIds: string[] = [];

  if (q1Answer && !q1Answer.skipped) {
    const ev = makeEvidenceFromAnswer(
      q1Answer,
      `你最想先想清楚的是：${q1Label}`,
      "user_reported",
      ["direction"],
      "high"
    );
    operations.push({ op: "add_evidence", item: ev.evidence });
    evidenceIds.push(ev.id);
  }

  if (q2Answer && q2Text) {
    const ev = makeEvidenceFromAnswer(
      q2Answer,
      `有能量的具体时刻：${q2Text}`,
      "user_reported",
      ["energy", "direction"],
      "medium"
    );
    operations.push({ op: "add_evidence", item: ev.evidence });
    evidenceIds.push(ev.id);
  }

  if (q3Answer && q3Text) {
    const ev = makeEvidenceFromAnswer(
      q3Answer,
      `明显消耗你的片段：${q3Text}`,
      "user_reported",
      ["direction", "risk"],
      "medium"
    );
    operations.push({ op: "add_evidence", item: ev.evidence });
    evidenceIds.push(ev.id);
  }

  if (q4Answer && q4Text) {
    const ev = makeEvidenceFromAnswer(
      q4Answer,
      `现实护栏：${q4Text}`,
      "user_confirmed",
      ["constraint"],
      "high"
    );
    operations.push({ op: "add_evidence", item: ev.evidence });
    evidenceIds.push(ev.id);
  }

  if (evidenceIds.length === 0) {
    // All skipped: add a placeholder evidence so the insight can still cite something.
    const id = tempId();
    operations.push({
      op: "add_evidence",
      item: {
        temp_id: id,
        statement: "首波问题全部跳过，系统暂时只能依据你的主动选择来理解。",
        source_refs: [{ kind: "answer", answer_id: "none", question_id: "w1q1", wave_id: WAVE_ID }],
        epistemic: "user_reported",
        relevance: ["direction"],
        confidence: "low",
        status: "active",
      },
    });
    evidenceIds.push(id);
  }

  // Claim
  const claimId = tempId();
  const claimText =
    q1Answer && !q1Answer.skipped
      ? `你眼下最需要的不是一份更轻松的工作，而是一个能让你重新解释自己经历的方向。`
      : q2Text
        ? `你正在寻找让"有能量"的时刻变得更大的空间。`
        : `目前的信息还不足以形成一条具体的理解，但首波已经标出了你想要先想清楚的问题。`;

  operations.push({
    op: "upsert_claim",
    item: {
      temp_id: claimId,
      text: claimText,
      evidence_ids: evidenceIds.slice(0, 3) as [string, ...string[]],
      confidence: evidenceIds.length >= 2 ? "medium" : "low",
      status: "active",
    },
  });

  // Constraint from q4
  if (q4Answer && q4Text) {
    const constraintId = tempId();
    operations.push({
      op: "upsert_constraint",
      item: {
        temp_id: constraintId,
        text: q4Text,
        kind: "other",
        flexibility: "negotiable",
        evidence_ids: [evidenceIds[evidenceIds.length - 1]] as [string, ...string[]],
        status: "active",
      },
    });
  }

  // Route seeds (the three parallel frames, deliberately non-ranked)
  const routeSeedIds: string[] = [];
  for (const [title_hint, life_shape, distinct_on] of [
    ["延续线", "在现有轨道上争取更多解释空间", "组织内角色"],
    ["邻近转向线", "把能力迁移到相邻领域", "自主性与收入结构"],
    ["释放型通配线", "降低固定成本，探索更不一样的可能", "生活方式与信息量"],
  ] as const) {
    const id = tempId();
    routeSeedIds.push(id);
    operations.push({
      op: "upsert_route_seed",
      item: {
        temp_id: id,
        title_hint,
        life_shape,
        distinct_on,
        appeal_evidence_ids: evidenceIds.filter((_, i) => i < 2),
        feasibility_evidence_ids: q4Text ? [evidenceIds[evidenceIds.length - 1]] : [],
        uncertainty_ids: [],
        status: "active",
      },
    });
  }

  // Uncertainty
  const uncertaintyId = tempId();
  operations.push({
    op: "upsert_uncertainty",
    item: {
      temp_id: uncertaintyId,
      question: `你更在意的是身份认同、收入下限，还是日常生活的可控感？`,
      plan_consequence: `答案会决定路线更偏向组织内延续、邻近转向还是释放型探索。`,
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
      created_wave: 1,
      status: "active",
    },
  });

  // Build the insight
  const observation = q2Text
    ? `你正在${q1Label}的张力中，同时提到一个有能量的具体时刻。`
    : `你正在${q1Label}的张力中。`;

  const interpretation =
    evidenceIds.length >= 2
      ? `你眼下最需要的不是一份更轻松的工作，而是一个能让你重新解释自己经历的方向。`
      : `目前信息还很少，我先把你的选择当作起点，后续需要你补充更多具体经历。`;

  const uncertainty = `你更在意的是身份认同、收入下限，还是日常生活的可控感。`;

  const insight: ImmediateInsight = {
    observation: truncate(observation, 220),
    interpretation: truncate(interpretation, 280),
    uncertainty: truncate(uncertainty, 180),
    evidence_ids: evidenceIds.slice(0, 3) as [string, ...string[]],
    confidence: evidenceIds.length >= 2 ? "medium" : "low",
    kind: "tension",
    feedback_prompt: "这条理解贴近你吗？哪里需要调整？",
  };

  const output: SensemakerWaveOutput = {
    schema_version: "sensemaker.wave.output.v1",
    expected_revision: memory.revision + 1,
    operations,
    insight,
  };

  // Runtime validation: the insight citations must resolve after applying operations.
  const patched = applyMemoryOperations(memory, operations, { wave_id: WAVE_ID });
  for (const eid of insight.evidence_ids) {
    if (!patched.evidence.some((e) => e.id === eid && e.status === "active")) {
      throw new Error(`Insight cites missing or inactive evidence: ${eid}`);
    }
  }

  return output;
}
