// Deterministic Wave 1 Sensemaker — zero Interviewer calls, zero external model calls.
// Produces a v3 SensemakerWaveOutput from the eight Wave 1 template answers.
// See .loom/design/insight-plan-contracts.md

import { randomUUID } from "node:crypto";
import type {
  WorkingMemory,
  SensemakerWaveOutput,
  InterviewQuestion,
  InterviewAnswer,
  MemoryOperation,
  ImmediateInsightProposal,
  EvidenceLink,
  SourceRef,
} from "@/lib/working-memory/types";
import type { RadarDelta } from "@/lib/state/contracts";

const WAVE_ID = "w1";

function tempId() {
  return randomUUID();
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return text.slice(0, max - 1) + "…";
}

function findQuestion(questions: InterviewQuestion[], id: string): InterviewQuestion | undefined {
  return questions.find((q) => q.id === id);
}

function findAnswer(answers: InterviewAnswer[], questionId: string): InterviewAnswer | undefined {
  return answers.find((a) => a.question_id === questionId);
}

function textValue(answer?: InterviewAnswer): string | undefined {
  if (!answer || answer.skipped) return undefined;
  const value = Array.isArray(answer.value) ? answer.value.join("；") : answer.value;
  if (typeof value !== "string") return undefined;
  return value.trim();
}

function labelForChoice(
  questions: InterviewQuestion[],
  questionId: string,
  answer?: InterviewAnswer
): string | undefined {
  if (!answer || answer.skipped) return undefined;
  const value = Array.isArray(answer.value) ? answer.value[0] : answer.value;
  if (typeof value !== "string") return undefined;
  const q = findQuestion(questions, questionId);
  const opt = q?.options?.find((o) => o.id === value);
  return opt?.label ?? value;
}

function sourceRef(answer: InterviewAnswer): SourceRef {
  return { source_id: answer.id, source_revision: 1 };
}

function answerEvidence(
  answer: InterviewAnswer,
  excerpt: string,
  relevance: string
): EvidenceLink {
  return {
    source_id: answer.id,
    source_revision: 1,
    epistemic_status: "user_stated",
    evidence_shape: "concrete_scene",
    relevance,
    excerpt,
  };
}

export function runWave1Sensemaker(
  memory: WorkingMemory,
  questions: InterviewQuestion[],
  answers: InterviewAnswer[],
  provenanceId: string = ""
): SensemakerWaveOutput {
  const q1Answer = findAnswer(answers, "w1q1");
  const q2Answer = findAnswer(answers, "w1q2");
  const q3Answer = findAnswer(answers, "w1q3");
  const q4Answer = findAnswer(answers, "w1q4");
  const q5Answer = findAnswer(answers, "w1q5");
  const q6Answer = findAnswer(answers, "w1q6");
  const q7Answer = findAnswer(answers, "w1q7");
  const q8Answer = findAnswer(answers, "w1q8");

  const name = textValue(q1Answer) ?? "没有说名字";
  const from = textValue(q2Answer) ?? "没有说来自哪里";
  const mbti = labelForChoice(questions, "w1q3", q3Answer) ?? "还没测过";
  const rhythm = labelForChoice(questions, "w1q4", q4Answer);
  const intent = labelForChoice(questions, "w1q5", q5Answer);
  const people = labelForChoice(questions, "w1q6", q6Answer);
  const stage = labelForChoice(questions, "w1q7", q7Answer);
  const hook = textValue(q8Answer);

  const links: EvidenceLink[] = [];

  if (q1Answer && !q1Answer.skipped) {
    links.push(answerEvidence(q1Answer, `称呼：${name}`, "基础身份"));
  }
  if (q2Answer && !q2Answer.skipped) {
    links.push(answerEvidence(q2Answer, `来自：${from}`, "地理环境"));
  }
  if (q3Answer && !q3Answer.skipped) {
    links.push(answerEvidence(q3Answer, `MBTI：${mbti}`, "性格参考"));
  }
  if (q4Answer && rhythm) {
    links.push(answerEvidence(q4Answer, `生活节奏：${rhythm}`, "日常框架"));
  }
  if (q5Answer && intent) {
    links.push(answerEvidence(q5Answer, `来访意图：${intent}`, "动机"));
  }
  if (q6Answer && people) {
    links.push(answerEvidence(q6Answer, `身边的人：${people}`, "关系结构"));
  }
  if (q7Answer && stage) {
    links.push(answerEvidence(q7Answer, `当前阶段：${stage}`, "人生阶段"));
  }
  if (q8Answer && hook) {
    links.push(answerEvidence(q8Answer, `想聊的事：${hook}`, "叙事钩子"));
  }

  // Fallback source so the insight can always cite something.
  if (links.length === 0) {
    links.push({
      source_id: "w1-skipped",
      source_revision: 1,
      epistemic_status: "user_stated",
      evidence_shape: "concrete_scene",
      relevance: "首波全部跳过，需后续补充",
      excerpt: "首波问题全部跳过，系统暂时只能依据你的主动选择来理解。",
    });
  }

  const operations: MemoryOperation[] = [];

  // Claim: a simple, friendly fact summary, not an interpretation.
  const parts: string[] = [`我叫${name}，来自${from}`];
  if (q3Answer && !q3Answer.skipped) parts.push(`MBTI 是${mbti}`);
  if (rhythm) parts.push(`最近节奏是「${rhythm}」`);
  if (intent) parts.push(`来这里想${intent}`);
  if (people) parts.push(`身边的人是「${people}」`);
  if (stage) parts.push(`当前阶段是「${stage}」`);
  if (hook) parts.push(`最近想聊的是「${hook}」`);
  const claimText = parts.join("，") + "。";

  operations.push({
    op: "add_claim",
    value: {
      text: truncate(claimText, 280),
      epistemic_status: "working_inference",
      evidence: links.slice(0, 6),
      dimensions: ["narrative"],
    },
  });

  // Route intent seeds: use the richer Wave 1 info to make them less generic.
  const routeSeeds: [string, string, string, string][] = [
    ["延续线", "在现有节奏和关系里保持连续性", "当前环境中的角色", rhythm ? `节奏从${rhythm}出发` : "后续需要具体化"],
    ["邻近转向线", "把已有能力迁移到相邻领域", "自主性与收入结构", intent ? `来访意图是${intent}` : "后续需要具体化"],
    ["释放型通配线", "探索更不一样的可能", "生活方式与信息量", hook ? `从「${hook}」出发探索` : "后续需要具体化"],
  ];

  for (const [title, shapeHint, axis, cost] of routeSeeds) {
    operations.push({
      op: "add_route_intent_seed",
      value: {
        title_hint: title,
        life_shape: {
          daily_rhythm: `${shapeHint}的日常节奏`,
          work_or_study: title,
          relationships: `${axis}中的主要关系`,
          environment: people ? `身边的人：${people}` : "需后续波次具体化",
          responsibilities: "需后续波次具体化",
          resources: "需后续波次具体化",
        },
        real_cost: cost,
        evidence: links.slice(0, 3),
      },
    });
  }

  // Radar deltas: map each answered question to its dimension(s).
  const radarDeltas: RadarDelta[] = [];

  function pushDelta(
    dimension: RadarDelta["dimension"],
    answer: InterviewAnswer | undefined,
    reason: string
  ): void {
    if (answer && !answer.skipped) {
      radarDeltas.push({
        dimension,
        from: "unseen",
        to: "signaled",
        reason,
        source_refs: [{ source_id: answer.id, source_revision: 1 }],
      });
    }
  }

  pushDelta("narrative", q1Answer, "用户提供了称呼");
  pushDelta("environment", q2Answer, "用户说明了来源地");
  pushDelta("traits", q3Answer, "用户提供了 MBTI 参考");
  pushDelta("environment", q4Answer, "用户描述了当前生活节奏");
  pushDelta("motivation", q5Answer, "用户说明了来访意图");
  pushDelta("relationships", q6Answer, "用户描述了身边的人");
  pushDelta("narrative", q7Answer, "用户说明了当前人生阶段");
  if (q8Answer && !q8Answer.skipped) {
    radarDeltas.push({
      dimension: "narrative",
      from: "unseen",
      to: "signaled",
      reason: "用户提供了一个想聊的具体事",
      source_refs: [{ source_id: q8Answer.id, source_revision: 1 }],
    });
  }

  for (const delta of radarDeltas) {
    operations.push({
      op: "update_radar",
      value: delta,
    });
  }

  // Build user_told_me: concise, source-faithful.
  const toldParts: string[] = [`我叫${name}，来自${from}。`];
  if (q3Answer && !q3Answer.skipped) toldParts.push(`MBTI 是${mbti}。`);
  if (rhythm) toldParts.push(`最近节奏${rhythm}。`);
  if (intent) toldParts.push(`来这里想${intent}。`);
  if (people) toldParts.push(`身边的人是${people}。`);
  if (stage) toldParts.push(`当前阶段${stage}。`);
  if (hook) toldParts.push(`最近想聊「${hook}」。`);
  const userToldMe = toldParts.join("");

  // Build current_reading: one provisional pattern or tension, not a diagnosis.
  // Prioritize hook (q8 text) if present — it's the user's own framing of what
  // they want to explore, and should appear in the reading when available.
  const readingParts: string[] = [];
  if (hook) {
    if (intent && stage) {
      readingParts.push(`你说想${intent}，现在${stage}。你提到最近在想「${hook}」——这可能是连接当前状态和想去的方向的一个线索，下一波可以展开看看。`);
    } else if (intent) {
      readingParts.push(`你来这里想${intent}。你提到最近在想「${hook}」，具体是什么让你有这个感觉，下一波可以慢慢聊。`);
    } else if (stage) {
      readingParts.push(`你现在${stage}。你提到最近在想「${hook}」，这个阶段里它意味着什么，后面可以展开。`);
    } else {
      readingParts.push(`你提到最近在想「${hook}」，我先记下来，下一波再聊这背后更具体的想法。`);
    }
  } else if (intent && stage) {
    readingParts.push(`你说想${intent}，现在${stage}——这两者之间可能有关联，也可能没有，下一波可以看看。`);
  } else if (intent) {
    readingParts.push(`你来这里想${intent}，具体是什么让你有这个感觉，下一波可以慢慢聊。`);
  } else if (stage) {
    readingParts.push(`你现在${stage}，这个阶段里有没有让你想调整的地方，后面可以展开。`);
  } else {
    readingParts.push("你给的信息还比较轻，我先记下来，下一波再聊你真正想解决的事。");
  }
  const currentReading = readingParts.join("");

  const insight: ImmediateInsightProposal = {
    wave_id: WAVE_ID,
    user_told_me: truncate(userToldMe, 280),
    current_reading: truncate(currentReading, 320),
    important_unknown: "你最近最关心的选择、卡点或变化是什么？",
    radar_deltas: radarDeltas,
    route_impact: "Wave 1 不决定路线，只打开三个非排序框架供后续验证。",
    evidence: links.slice(0, 6),
    status: "proposed",
    language_strength: links.length >= 4 ? "well_supported" : "tentative",
  };

  const output: SensemakerWaveOutput = {
    base_revision: memory.revision,
    operations,
    insight,
    expected_revision: memory.revision + 1,
  };

  return output;
}
