// Sensemaker Agent: produces a wave-level v3 proposal (memory operations + immediate insight).
// Host owns validation, ID assignment and commit.
// See .loom/design/adaptive-interview-system.md §3

import { z } from "zod";
import { waveSensemakerProposalSchema, immediateInsightProposalSchema, memoryOperationProposalSchema } from "@/lib/state/contracts";
import { generateStructured, streamStructured } from "@/lib/ai/client";
import { composePrompt } from "@/lib/ai/prompts/compose";
import { runWave1Sensemaker } from "@/lib/ai/sensemaker/wave1";
import type {
  SensemakerWaveInput,
  SensemakerWaveOutput,
  WaveSensemakerProposal,
  ImmediateInsightProposal,
  MemoryOperationProposal,
  EvidenceLink,
} from "@/lib/working-memory/types";

function evidenceFromAnswer(
  answer: SensemakerWaveInput["answers"][number],
  questions?: SensemakerWaveInput["questions"]
): EvidenceLink {
  const rawValues = Array.isArray(answer.value) ? answer.value : [answer.value];
  const q = questions?.find((qq) => qq.id === answer.question_id);
  const resolved = rawValues
    .filter((v) => v !== null && v !== undefined && v !== "")
    .map((v) => {
      if (typeof v !== "string") return String(v);
      const opt = q?.options?.find((o) => o.id === v);
      return opt?.label ?? v;
    });
  const value = resolved.join("；") || "（空回答）";
  return {
    source_id: answer.id,
    source_revision: 1,
    epistemic_status: "user_stated",
    evidence_shape: "concrete_scene",
    relevance: "本波回答",
    excerpt: value.slice(0, 200),
  };
}

function buildWaveEnvelope(input: SensemakerWaveInput): string {
  const answered = input.answers
    .filter((a) => !a.skipped)
    .map((a) => {
      const q = input.questions.find((qq) => qq.id === a.question_id);
      const rawValue = Array.isArray(a.value) ? a.value : [a.value];
      // Resolve option IDs to human-readable labels for single/multi choice questions.
      // Skip null/undefined values instead of stringifying them to "undefined".
      const resolvedValues = rawValue
        .filter((v) => v !== null && v !== undefined && v !== "")
        .map((v) => {
          if (typeof v !== "string") return String(v);
          const opt = q?.options?.find((o) => o.id === v);
          return opt?.label ?? v;
        });
      const value = resolvedValues.join("；") || "（空回答）";
      const source = `{source_id: ${a.id}, source_revision: 1}`;
      return [
        `问题：${q ? q.text : a.question_id}`,
        `回答：${value}`,
        `来源：${source}`,
      ].join("\n");
    })
    .join("\n\n");

  const skipped = input.answers.filter((a) => a.skipped).map((a) => a.question_id);

  const claims = input.memory.claims
    .filter((c) => c.status === "active")
    .slice(0, 6)
    .map((c) => `- [${c.id}] ${c.text}`)
    .join("\n");

  const constraints = input.memory.constraints
    .filter((c) => c.status === "active")
    .slice(0, 6)
    .map((c) => `- [${c.id}] (${c.kind}, ${c.flexibility}) ${c.text}`)
    .join("\n");

  const routeIntents = input.memory.route_intents
    .filter((r) => r.status === "seed" || r.status === "accepted")
    .slice(0, 6)
    .map((r) => `- [${r.id}] ${r.title_hint}`)
    .join("\n");

  const radar = Object.entries(input.memory.radar)
    .map(([dimension, cell]) => `- ${dimension}: ${cell.state} — ${cell.reason}`)
    .join("\n");

  const sourceVersions = input.memory.source_versions
    .slice(-20)
    .map((sv) => `- [${sv.source_id}@${sv.revision}] kind=${sv.kind}, text_ref=${sv.text_ref}`)
    .join("\n");

  const focus = input.focus_uncertainty_id
    ? input.memory.uncertainties.find((u) => u.id === input.focus_uncertainty_id)
    : undefined;

  return [
    `session_id: ${input.session_id}`,
    `wave_id: ${input.wave_id}`,
    `wave_index: ${input.wave_index}`,
    `focus_uncertainty_id: ${input.focus_uncertainty_id ?? "（无）"}`,
    `focus_uncertainty_question: ${focus ? focus.question : "（首波模板，无单一焦点）"}`,
    `expected_base_revision: ${input.memory.revision}`,
    "",
    "=== 用户回答 ===",
    answered || "（本波全部跳过）",
    skipped.length > 0 ? `跳过题目：${skipped.join(", ")}` : "",
    "",
    "=== 当前活跃的理解 ===",
    claims || "（还没有形成理解）",
    "",
    "=== 约束 ===",
    constraints || "（暂无）",
    "",
    "=== 路线意图种子 ===",
    routeIntents || "（暂无）",
    "",
    "=== 六维雷达当前状态（供参考，你根据本波证据决定是否更新）===",
    radar || "（暂无）",
    "",
    "=== 来源版本 ===",
    sourceVersions || "（暂无）",
    "",
    "注意：请输出符合下面 WaveSensemakerProposal schema 的完整对象。必须包含 base_revision、operations 和 insight。不要输出 schema 之外的字段。",
    "特别要求：user_told_me 必须忠实引用用户的文本回答原文（不只是选择题 label），current_reading 应当关联用户自己提出的方向或困惑（尤其是文本回答中提到的内容），不要忽略用户主动提供的文本信息。",
  ].join("\n");
}

function makePrompt(input: SensemakerWaveInput): string {
  return composePrompt<WaveSensemakerProposal>(
    "sensemaker_wave",
    buildWaveEnvelope(input),
    waveSensemakerProposalSchema as z.ZodType<WaveSensemakerProposal, z.ZodTypeDef, unknown>
  );
}

function fallbackWaveProposal(input: SensemakerWaveInput): WaveSensemakerProposal {
  const answeredLinks = input.answers.filter((a) => !a.skipped).map((a) => evidenceFromAnswer(a, input.questions));
  const links: EvidenceLink[] = answeredLinks.length > 0 ? answeredLinks : [
    {
      source_id: input.wave_id,
      source_revision: 1,
      epistemic_status: "user_stated",
      evidence_shape: "concrete_scene",
      relevance: "本波无有效回答",
      excerpt: "本波回答全部跳过或生成失败。",
    },
  ];

  const focus = input.focus_uncertainty_id
    ? input.memory.uncertainties.find((u) => u.id === input.focus_uncertainty_id)
    : undefined;

  // Build a user_told_me that actually references the user's answers instead of
  // a generic hardcoded string. This way even the fallback preserves what the
  // user said, making it distinguishable from a truly empty response.
  const answerSummary = input.answers
    .filter((a) => !a.skipped)
    .map((a) => {
      const q = input.questions.find((qq) => qq.id === a.question_id);
      const rawValue = Array.isArray(a.value) ? a.value : [a.value];
      const resolved = rawValue
        .filter((v) => v !== null && v !== undefined && v !== "")
        .map((v) => {
          if (typeof v !== "string") return String(v);
          const opt = q?.options?.find((o) => o.id === v);
          return opt?.label ?? v;
        });
      return resolved.join("；");
    })
    .filter((v) => v && v !== "undefined")
    .join("；");

  const insight: ImmediateInsightProposal = {
    wave_id: input.wave_id,
    user_told_me: answerSummary
      ? `本波回答已记录：${answerSummary}。系统未能生成深入理解，将在下一波继续。`
      : "本波回答已记录，但系统未能生成深入理解。",
    current_reading: "目前信息不足以更新理解，需要更多具体场景和行为证据。",
    important_unknown: focus ? focus.topic : "我暂不知晓的是本波回答背后更具体的场景和动机，需要后续波次补充。",
    radar_deltas: [],
    route_impact: "没有新增路线影响。",
    evidence: links.slice(0, 3),
    status: "proposed",
    language_strength: "tentative",
  };

  return {
    base_revision: input.memory.revision,
    operations: [],
    insight,
  };
}

export async function runSensemakerWave(input: SensemakerWaveInput): Promise<SensemakerWaveOutput> {
  try {
    const raw = await generateStructured<WaveSensemakerProposal>({
      purpose: "sensemaker_wave",
      session_id: input.session_id,
      wave_id: input.wave_id,
      prompt: makePrompt(input),
      schema: waveSensemakerProposalSchema as z.ZodType<WaveSensemakerProposal, z.ZodTypeDef, unknown>,
      max_tokens: 16000,
      timeout_ms: 120000,
      prompt_version: "sensemaker.wave.v3",
      fixture: () => Promise.resolve(
        input.wave_id === "w1"
          ? runWave1Sensemaker(input.memory, input.questions, input.answers)
          : fallbackWaveProposal(input)
      ),
    });

    return {
      ...raw,
      expected_revision: input.memory.revision + 1,
    };
  } catch (err) {
    console.error("Sensemaker wave failed, using fallback:", err instanceof Error ? err.message : "unknown");
    return {
      ...fallbackWaveProposal(input),
      expected_revision: input.memory.revision + 1,
    };
  }
}

/**
 * Streaming version of runSensemakerWave.
 * Calls onInsightPartial whenever the insight fields become available in the partial JSON.
 */
export async function runSensemakerWaveStream(
  input: SensemakerWaveInput,
  onInsightPartial: (partial: { user_told_me?: string; current_reading?: string; important_unknown?: string }) => void
): Promise<SensemakerWaveOutput> {
  try {
    const raw = await streamStructured<WaveSensemakerProposal>({
      purpose: "sensemaker_wave",
      session_id: input.session_id,
      wave_id: input.wave_id,
      prompt: makePrompt(input),
      schema: waveSensemakerProposalSchema as z.ZodType<WaveSensemakerProposal, z.ZodTypeDef, unknown>,
      max_tokens: 16000,
      timeout_ms: 120000,
      prompt_version: "sensemaker.wave.v3",
      fixture: () => Promise.resolve(
        input.wave_id === "w1"
          ? runWave1Sensemaker(input.memory, input.questions, input.answers)
          : fallbackWaveProposal(input)
      ),
      onPartial: (partial) => {
        const insight = (partial as Partial<WaveSensemakerProposal>)?.insight;
        if (insight) {
          onInsightPartial({
            user_told_me: insight.user_told_me,
            current_reading: insight.current_reading,
            important_unknown: insight.important_unknown,
          });
        }
      },
    });

    return {
      ...raw,
      expected_revision: input.memory.revision + 1,
    };
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : "unknown";
    console.error("Sensemaker wave stream failed:", errMsg);

    // Attempt partial recovery: if the AI generated a valid insight but
    // operations were malformed (common with complex nested schemas),
    // salvage the insight and derive host-owned operations from it.
    //
    // We do NOT pick through the AI's operations array — that risks
    // internal inconsistency (e.g. keeping an update_radar but dropping
    // its supporting add_claim). Instead, we derive a minimal consistent
    // operation set directly from the validated insight:
    //   - update_radar for each insight.radar_delta
    // These are guaranteed valid because they come from the already-
    // validated insight schema. AI's original operations are discarded
    // entirely. This means claims/constraints/route_intents from this
    // wave are lost, but radar state stays in sync with what the user
    // saw, and later waves can see the dimension shifts.
    const rawObject = (err as Error & { rawObject?: unknown }).rawObject;
    if (rawObject && typeof rawObject === "object") {
      const rawRecord = rawObject as Record<string, unknown>;
      const rawInsight = rawRecord.insight;
      if (rawInsight && typeof rawInsight === "object") {
        const insightResult = immediateInsightProposalSchema.safeParse(rawInsight);
        if (insightResult.success) {
          const derivedOps: MemoryOperationProposal[] = insightResult.data.radar_deltas.map(
            (delta) => ({ op: "update_radar" as const, value: delta })
          );
          console.log(
            `[Sensemaker] Recovered insight, derived ${derivedOps.length} radar ops from it` +
            ` (AI operations discarded to preserve consistency)`
          );
          return {
            base_revision: input.memory.revision,
            operations: derivedOps,
            insight: insightResult.data,
            expected_revision: input.memory.revision + 1,
          };
        } else {
          console.error("[Sensemaker] Insight recovery also failed:", insightResult.error.issues.map(i => `${i.path.join(".")}: ${i.message}`).join("; "));
        }
      }
    }

    console.log("[Sensemaker] Using full fallback");
    return {
      ...fallbackWaveProposal(input),
      expected_revision: input.memory.revision + 1,
    };
  }
}
