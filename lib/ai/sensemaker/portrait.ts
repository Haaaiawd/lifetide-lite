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
    .map((u) => `- [${u.id}] ${u.topic} (priority: ${u.priority})`)
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
    "所有可读字段必须用普通人一遍就能听懂的话：写具体行为和真实矛盾，不使用核心驱力、人格底色、关键张力、呈现出、反映了等分析腔，不堆华丽词。栏目字段保持原 schema，不把字段名写进正文。",
    "各分析字段（trait_summary、behavioral_patterns、psychological_features、relationship_mode、environment_fit、self_narrative、current_identity、life_theme、said_vs_done、blind_spots）的口吻应与 essence 同源：基于真实经历下判断，不带温吞的抽象评价。每条观察后面都应能让人想到「对，确实发生过这件事」。可以尖锐，可以刺人，但必须准——准到读者无法用一句话反驳。不要写成心理咨询记录，也不要写成表扬稿。写这个人真实反复做的事、真实反复摔的跤、真实反复回避的对话，而不是这个人「可能」「或许」「有时候」会怎样。",
    "essence 必须由两个彼此对撞的「人物判词」组成，只用一个逗号连接，优先采用「你既是……，也是……」结构。",
    "前半句必须是基于真实经历的身份级攻击。不是抽象评价，不是泛泛说「想太多」「太固执」「过于完美主义」，也不是随便套用「废物、懦夫、疯子」之类词库。必须先从输入中寻找最刺眼的事实：反复失败过什么、辜负过谁、逃避过什么、搞砸过什么、承诺落空过什么、明知有问题却重复了什么、最想证明自己却最常在哪件事上被现实打脸。然后把这些具体经历压缩成一个准确到残忍的身份定义。",
    "攻击必须带有「证据感」。读者应能立刻想到：对，这句话不是凭空骂我，它后面至少压着两三个真实发生过的瞬间。优先攻击那些本人最想维护的自我形象与现实经历之间的裂缝，例如：自认负责却屡次失约，自认勇敢却总在真正重要时后退，自认重感情却亲手耗掉关系，自认聪明却不断重复同一种错误，自认有野心却长期没有结果，自认保护别人却连最亲近的人都没保护好。",
    "前半句要像判决，不要像观察。不要写「你有时候会逃避」，要写「你既是每次走到关键处都会退回去的逃兵」；不要写「你不太会处理关系」，要写「你既是亲手把最在乎的人越推越远的人」；不要写「你执行力不足」，要写「你既是给自己许过最多诺言也违约最多的人」。",
    "后半句不是安慰、洗白或机械反转，而是从同一批真实经历中提炼出一个同等重量的正面身份。必须和前半句来自同一个人格根源、同一条行为链或同一种执念。它应解释为什么这个人会一边如此失败，一边又值得被重新理解。",
    "前后两句必须形成「同一把刀的正反两面」。例如：「你既是连最想保护的人都保护不好的失败者，也是每次出事都第一个站出来的人」「你既是一次次把机会拖死在自己手里的人，也是认准一件事后最难被耗死的人」「你既是亲手把关系消耗殆尽的人，也是到了最后仍不肯先放手的人」「你既是被现实反复证明高估了自己的人，也是每次摔下来都还敢重新下注自己的人」「你既是许下过最多承诺也失约最多的人，也是最不愿把承诺当成一句废话的人」「你既是聪明到足以看穿问题却蠢到不断重演问题的人，也是少数真会把伤疤变成方法的人」。",
    "整句要有审判感、力量感和命中感。目标不是「骂得狠」，而是「准得让人无法用一句话反驳」。最好的效果不是让人觉得被冒犯，而是让人第一反应想反驳，第二反应开始回忆，第三反应沉默。",
    "禁止：不得脱离真实经历凭空发明创伤、失败或关系问题；不得使用空泛人格词代替事实；不得为了攻击性故意夸大到失真；不得用低级脏话制造廉价刺激；不得在后半句突然变成鸡汤；不得写成「先骂一句再夸一句」的拼接句；不得使用两个以上逗号；总长尽量控制在 16–32 个汉字，宁可短而重，不要长而散。",
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
  abortSignal?: AbortSignal;
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
    timeout_ms: 0,
    max_retries: 0,
    temperature: 0.7,
    prompt_version: PROMPT_VERSION,
    enableThinking: true,
    onPartial: options?.onPartial,
    abortSignal: options?.abortSignal,
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
