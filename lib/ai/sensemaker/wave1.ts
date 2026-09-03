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

  // Build current_reading: a provisional interpretation or tension, not a
  // restatement of facts. Surface a pattern that might be true but needs
  // verification in later waves — not a diagnosis.
  const readingParts: string[] = [];
  if (hook && intent && stage) {
    readingParts.push(`一种可能的解读是：你想${intent}，现在${stage}，同时提到「${hook}」——这三者之间可能有一个尚未被说出来的张力。也许「${hook}」不只是兴趣，而是对当前${stage}状态的一种回应；也可能它只是一个模糊方向，还没有和具体行动连接。后续需要验证的是，这是信息不足还是行动受阻。`);
  } else if (hook && intent) {
    readingParts.push(`你来这里想${intent}，同时提到「${hook}」。一种解读是「${hook}」背后有一个具体的场景或经历推动了你来，但目前还没有证据区分这是主动探索还是被动逃避。后续可以看看这个方向背后有没有已经发生过的具体行为。`);
  } else if (hook && stage) {
    readingParts.push(`你现在${stage}，提到最近在想「${hook}」。可能的张力在于：「${hook}」是对当前阶段的自然延伸，还是对它的某种不满？目前信息不足以区分这两种可能。`);
  } else if (hook) {
    readingParts.push(`你提到最近在想「${hook}」。这可能是当前最重要的一条线索，但目前还不知道它背后是已经有了具体行动、还只是一个想法。后续需要了解有没有已经发生的具体场景。`);
  } else if (intent && stage) {
    readingParts.push(`你说想${intent}，现在${stage}。一种可能的解读是：当前${stage}的状态在某种程度上维持着「还没行动」的舒适——想${intent}是真实的，但可能缺少一个触发点或允许自己试错的条件。这只是假设，后续可以验证。`);
  } else if (intent) {
    readingParts.push(`你来这里想${intent}。目前还不知道这个想法是最近才出现的还是持续了一段时间——如果是持续的，可能值得看看是什么在阻止下一步。`);
  } else if (stage) {
    readingParts.push(`你现在${stage}。这个阶段本身可能包含一些未被说出来的压力或期待，但目前信息还比较轻，需要后续展开。`);
  } else {
    readingParts.push("目前信息还比较轻，一种解读是你可能在用填写这个工具来试探自己的方向，但还没有准备好展开具体内容。后续可以慢慢来。");
  }
  const currentReading = readingParts.join("");

  const insight: ImmediateInsightProposal = {
    wave_id: WAVE_ID,
    user_told_me: truncate(userToldMe, 280),
    current_reading: truncate(currentReading, 320),
    important_unknown: hook
      ? `我暂不知晓的是「${hook}」背后的具体场景和阻碍——是缺乏信息、缺乏兴趣还是缺乏信心，目前还没有证据区分。`
      : "我暂不知晓的是用户最近最关心的选择、卡点或变化的具体内容，需要后续波次补充。",
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
