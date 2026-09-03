// Portrait Synthesist — generates a structured persona portrait from
// the full WorkingMemory before blueprint generation.
// Uses streaming with thinking enabled for deeper implicit mining.

import { randomUUID } from "node:crypto";
import { z } from "zod";
import { streamStructured, getProviderConfig } from "@/lib/ai/client";
import { composePrompt } from "@/lib/ai/prompts/compose";
import { personaPortraitSchema, makeFixturePortrait } from "@/lib/portrait/types";
import type { PersonaPortrait, PersonaPortraitProposal } from "@/lib/portrait/types";
import type { WorkingMemory, SourceVersion, EvidenceLink } from "@/lib/working-memory/types";
import type { ProviderConfig } from "@/lib/ai/client";

const PROMPT_VERSION = "portrait.v1";

function buildActiveSourceRefSet(memory: WorkingMemory): Set<string> {
  const active = new Set<string>();
  for (const head of memory.source_heads) {
    if (head.status === "active" && head.active_revision !== undefined) {
      active.add(`${head.source_id}@${head.active_revision}`);
    }
  }
  return active;
}

function activeSourceVersions(memory: WorkingMemory): SourceVersion[] {
  const activeRefs = buildActiveSourceRefSet(memory);
  return memory.source_versions.filter((sv) => activeRefs.has(`${sv.source_id}@${sv.revision}`));
}

function buildPortraitEnvelope(memory: WorkingMemory): string {
  const activeRefs = buildActiveSourceRefSet(memory);
  const activeSources = memory.source_versions.filter((sv) => activeRefs.has(`${sv.source_id}@${sv.revision}`));

  const claims = memory.claims
    .filter((c) => c.status === "active")
    .slice(0, 12)
    .map((c) => `- [${c.id}] (${c.calibration}) ${c.text}`)
    .join("\n");

  const constraints = memory.constraints
    .filter((c) => c.status === "active")
    .slice(0, 8)
    .map((c) => `- [${c.id}] (${c.kind}, ${c.flexibility}) ${c.text}`)
    .join("\n");

  const radar = Object.entries(memory.radar)
    .map(([dimension, cell]) => `- ${dimension}: ${cell.state} — ${cell.reason}`)
    .join("\n");

  const sourceVersions = activeSources
    .slice(-25)
    .map((sv) => `- [${sv.source_id}@${sv.revision}] kind=${sv.kind}, text_ref=${sv.text_ref}`)
    .join("\n");

  const routeIntents = memory.route_intents
    .filter((r) => r.status === "seed" || r.status === "accepted")
    .slice(0, 6)
    .map((r) => `- [${r.id}] ${r.title_hint}｜成本：${r.real_cost}`)
    .join("\n");

  const uncertainties = memory.uncertainties
    .filter((u) => u.status === "active")
    .slice(0, 8)
    .map((u) => `- [${u.id}] ${u.question} (priority: ${u.priority})`)
    .join("\n");

  const feedback = memory.recent_feedback
    .slice(-5)
    .map((f) => `- wave=${f.wave_id}, verdict=${f.verdict}${f.correction_text ? `, correction: ${f.correction_text}` : ""}`)
    .join("\n");

  return [
    `session_id: ${memory.session_id}`,
    `memory_revision: ${memory.revision}`,
    `last_wave_index: ${memory.last_wave_index}`,
    "",
    "=== 活跃来源（source_versions）===",
    sourceVersions || "（暂无）",
    "",
    "=== 理解（claims）===",
    claims || "（暂无）",
    "",
    "=== 约束（constraints）===",
    constraints || "（暂无）",
    "",
    "=== 雷达 ===",
    radar || "（暂无）",
    "",
    "=== 路线种子（route_intents）===",
    routeIntents || "（暂无）",
    "",
    "=== 尚未解决的问题（uncertainties）===",
    uncertainties || "（暂无）",
    "",
    "=== 最近校准（feedback）===",
    feedback || "（暂无）",
    "",
    "注意：trait_scales 的 evidence_ref 中 source_id 和 source_revision 必须严格来自上文 '=== 活跃来源 ===' 中列出的活跃来源。",
    "behavioral_patterns 和 psychological_features 的 evidence_ref 同理。",
  ].join("\n");
}

function makePrompt(memory: WorkingMemory): string {
  return composePrompt<PersonaPortraitProposal>(
    "portrait",
    buildPortraitEnvelope(memory),
    personaPortraitSchema as z.ZodType<PersonaPortraitProposal, z.ZodTypeDef, unknown>
  );
}

function decoratePortrait(
  proposal: PersonaPortraitProposal,
  sessionId: string,
  provenanceId: string
): PersonaPortrait {
  return {
    ...proposal,
    id: randomUUID(),
    session_id: sessionId,
    generation_provenance_id: provenanceId,
    generated_at: new Date().toISOString(),
    status: "generated",
  };
}

export type PortraitStreamOptions = {
  onPartial?: (partial: Partial<PersonaPortraitProposal>) => void;
};

export async function generatePortrait(
  memory: WorkingMemory,
  options?: PortraitStreamOptions
): Promise<PersonaPortrait> {
  const sessionId = memory.session_id;
  const config = getProviderConfig();
  const provenanceId = randomUUID();

  const result = await streamStructured<PersonaPortraitProposal>({
    purpose: "portrait",
    session_id: sessionId,
    prompt: makePrompt(memory),
    schema: personaPortraitSchema as z.ZodType<PersonaPortraitProposal, z.ZodTypeDef, unknown>,
    max_tokens: 16000,
    timeout_ms: 180000,
    max_retries: 0,
    temperature: 0.7,
    prompt_version: PROMPT_VERSION,
    enableThinking: true,
    onPartial: options?.onPartial,
    fixture: () => Promise.resolve(makeFixturePortrait(memory)),
  });

  return decoratePortrait(result, sessionId, provenanceId);
}

// Helper for final plan generation: produce a compact text summary
// of the portrait to inject into the odyssey-generator envelope.
export function portraitToContext(portrait: PersonaPortrait): string {
  const scales = portrait.trait_scales
    .map((s) => `- ${s.dimension}: ${s.level}/5 — ${s.label}`)
    .join("\n");

  const patterns = portrait.behavioral_patterns
    .map((p) => `- ${p.pattern} (confidence: ${p.confidence})`)
    .join("\n");

  const features = portrait.psychological_features
    .map((f) => `- ${f.feature}`)
    .join("\n");

  const saidVsDone = portrait.said_vs_done
    .map((s) => `- 说了「${s.said}」但做了「${s.done}」→ ${s.possible_reading}`)
    .join("\n");

  const blindSpots = portrait.blind_spots
    .map((b) => `- ${b.observation}（${b.why_it_matters}）`)
    .join("\n");

  return [
    "=== 综合画像（persona portrait）===",
    "",
    "特质倾向：",
    scales,
    "",
    `概要：${portrait.trait_summary}`,
    "",
    "行为模式：",
    patterns || "（暂无）",
    "",
    "心理特征：",
    features || "（暂无）",
    "",
    `关系模式：${portrait.relationship_mode}`,
    "",
    `环境适应：${portrait.environment_fit}`,
    "",
    `自我叙事：${portrait.self_narrative}`,
    "",
    `当前身份：${portrait.current_identity}`,
    "",
    `生命主题：${portrait.life_theme}`,
    "",
    "说与做的差距：",
    saidVsDone || "（暂无）",
    "",
    "盲区：",
    blindSpots || "（暂无）",
    "",
    `一句话：${portrait.essence}`,
  ].join("\n");
}
