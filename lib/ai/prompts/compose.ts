import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import { loadPrompt, type PromptKey } from "./loader";
import type { WorkingMemory } from "@/lib/working-memory/types";

function schemaAsJson(schema: z.ZodType<unknown, z.ZodTypeDef, unknown>): string {
  const json = zodToJsonSchema(schema, { target: "openApi3" });
  return JSON.stringify(json, null, 2);
}

// Six-dimension radar is injected as a shared baseline for all analysis roles.
// It sits between the role prompt and the runtime envelope, so the model always
// has the dimension definitions and state rules when deciding what to ask or analyze.
const SIX_DIMENSION_RADAR = loadPrompt("six_dimension_radar");

const MAX_WAVES = 8;

/**
 * Build a concise progress summary so the Agent knows how much runway is left
 * and how much of the six-dimensional radar is still uncovered. This gives it
 * a sense of pacing — e.g. "2 waves left, 3 dimensions still unseen" means
 * it should be more aggressive about covering those dimensions now, rather
 * than going deeper on already-grounded ones.
 */
export function buildProgressSummary(memory: WorkingMemory, nextWaveIndex?: number): string {
  const currentWave = nextWaveIndex ?? memory.last_wave_index + 1;
  const remainingWaves = Math.max(0, MAX_WAVES - currentWave);
  const totalDimensions = 6;

  const states = Object.entries(memory.radar).map(([dim, cell]) => ({ dim, state: cell.state }));
  const grounded = states.filter((s) => s.state === "grounded").length;
  const conflicted = states.filter((s) => s.state === "conflicted").length;
  const signaled = states.filter((s) => s.state === "signaled").length;
  const unseen = states.filter((s) => s.state === "unseen").length;
  const declined = states.filter((s) => s.state === "declined").length;

  const covered = grounded + conflicted; // dimensions with real evidence
  const touched = covered + signaled; // dimensions with at least a clue

  const uncoveredDims = states
    .filter((s) => s.state === "unseen" || s.state === "declined")
    .map((s) => s.dim)
    .join("、") || "无";

  const thinDims = states
    .filter((s) => s.state === "signaled")
    .map((s) => s.dim)
    .join("、") || "无";

  const lines = [
    `当前波次: ${currentWave} / ${MAX_WAVES}`,
    `剩余波次: ${remainingWaves}`,
    `雷达覆盖: ${covered}/${totalDimensions} 已有实质证据, ${signaled} 有线索, ${unseen} 未触及, ${declined} 用户拒绝`,
    `未触及维度: ${uncoveredDims}`,
    `线索薄维度: ${thinDims}`,
  ];

  if (remainingWaves <= 1) {
    lines.push("节奏提醒: 这是最后一个波次（第 8 波），优先补齐最缺证据且最影响决定的维度，不再发散。");
  } else if (currentWave >= 6) {
    lines.push("节奏提醒: 已进入后半程，尽量在本波让所有维度至少达到 signaled，特别是仍 unseen 的维度；已有实质证据的维度不再深入。");
  } else if (currentWave >= 4) {
    lines.push("节奏提醒: 已过半程，优先覆盖未触及维度，确保到第 6 波时六维都有至少 signaled 状态。已有实质证据的维度不再深入。");
  } else if (currentWave === 3) {
    lines.push("节奏提醒: 第 3 波，还在早期。优先打开维度广度（让 signaled 覆盖更多维度），再逐波深化。到第 6 波时尽量让所有维度至少达到 signaled。");
  } else if (currentWave <= 2) {
    lines.push("节奏提醒: 还在早期波次，优先打开维度广度（让 signaled 覆盖更多维度），再逐波深化。");
  } else {
    lines.push("节奏提醒: 还有充足波次，可以兼顾深度和广度，但确保每波至少推进一个未触及或线索薄的维度。");
  }

  return lines.join("\n");
}

export function composePrompt<T>(
  key: PromptKey,
  envelope: string,
  schema: z.ZodType<T, z.ZodTypeDef, unknown>
): string {
  const base = loadPrompt(key);
  const jsonSchema = schemaAsJson(schema);

  return [
    base,
    "",
    "=== 六维决策雷达（共享基准，所有分析必须对齐）===",
    SIX_DIMENSION_RADAR,
    "",
    "=== 本次调用的输入上下文（trusted envelope）===",
    envelope,
    "",
    "=== 本次调用必须返回的 JSON Schema ===",
    jsonSchema,
    "",
    "要求：只输出符合上述 schema 的纯 JSON 对象，不要 markdown 代码块，不要解释。",
  ].join("\n");
}
