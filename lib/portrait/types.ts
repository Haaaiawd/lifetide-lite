// Persona Portrait — comprehensive synthesis of WorkingMemory into a
// structured "character panel" shown before blueprint generation.
//
// Theoretical anchor: McAdams' three-layer personality framework:
//   Layer 1: Dispositional traits (broad, decontextualized)
//   Layer 2: Characteristic adaptations (situated habits, coping, goals)
//   Layer 3: Life story (narrative identity, themes)
// Plus cross-layer implicit mining (said vs done, blind spots).

import { z } from "zod";
import type { Id, RadarDimension, RadarState, SourceRef } from "@/lib/state/contracts";
import { idSchema, radarDimensionSchema, radarStateSchema, sourceRefSchema } from "@/lib/state/contracts";

// ── Layer 1: Trait scales (5-level, game-like) ──

export const traitDimensionSchema = z.enum([
  "energy_mode",      // 能量模式: 独处恢复 ←→ 社交恢复
  "structure_pref",   // 结构偏好: 自由安排 ←→ 严格计划
  "novelty_seeking",  // 新异探索: 已知优先 ←→ 新异优先
  "decision_speed",   // 决策速度: 反复权衡 ←→ 快速决断
  "emotional_range",  // 情感表达: 内敛含蓄 ←→ 外放直接
]);
export type TraitDimension = z.infer<typeof traitDimensionSchema>;

export const traitScaleSchema = z.object({
  dimension: traitDimensionSchema,
  level: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]),
  label: z.string().min(1).max(24), // short Chinese label for this level
});
export type TraitScale = z.infer<typeof traitScaleSchema>;

// ── Layer 2: Behavioral patterns (small habits) ──

export const behavioralPatternSchema = z.object({
  pattern: z.string().min(1),
  evidence_ref: sourceRefSchema,
  confidence: z.enum(["low", "medium", "high"]),
});
export type BehavioralPattern = z.infer<typeof behavioralPatternSchema>;

// ── Layer 2: Psychological features ──

export const psychologicalFeatureSchema = z.object({
  feature: z.string().min(1),
  evidence_ref: sourceRefSchema,
});
export type PsychologicalFeature = z.infer<typeof psychologicalFeatureSchema>;

// ── Cross-layer: Said vs done ──

export const saidVsDoneSchema = z.object({
  said: z.string().min(1),
  done: z.string().min(1),
  possible_reading: z.string().min(1),
});
export type SaidVsDone = z.infer<typeof saidVsDoneSchema>;

// ── Cross-layer: Blind spots ──

export const blindSpotSchema = z.object({
  observation: z.string().min(1),
  why_it_matters: z.string().min(1),
});
export type BlindSpot = z.infer<typeof blindSpotSchema>;

// ── Radar snapshot ──

export const radarSnapshotSchema = z.object({
  dimension: radarDimensionSchema,
  state: radarStateSchema,
  one_line: z.string().min(1),
});
export type RadarSnapshot = z.infer<typeof radarSnapshotSchema>;

// ── Full portrait (model output schema) ──

export const personaPortraitSchema = z.object({
  // Layer 1: 5 trait scales + summary paragraph
  trait_scales: z.array(traitScaleSchema).length(5),
  trait_summary: z.string().min(1),

  // Layer 2: Behavioral patterns, psychological features, relationship, environment
  behavioral_patterns: z.array(behavioralPatternSchema).min(2).max(8),
  psychological_features: z.array(psychologicalFeatureSchema).min(1).max(6),
  relationship_mode: z.string().min(1),
  environment_fit: z.string().min(1),

  // Layer 3: Narrative identity
  self_narrative: z.string().min(1),
  current_identity: z.string().min(1),
  life_theme: z.string().min(1),

  // Cross-layer: Implicit mining
  said_vs_done: z.array(saidVsDoneSchema).max(5),
  blind_spots: z.array(blindSpotSchema).max(4),

  // Radar snapshot (6 dimensions)
  radar_snapshot: z.array(radarSnapshotSchema).length(6),

  // Open questions still unresolved
  open_questions: z.array(z.string()).max(5),

  // One-line essence
  essence: z.string().min(1).max(120),
});
export type PersonaPortraitProposal = z.infer<typeof personaPortraitSchema>;

// ── Host-decorated portrait (with ids, provenance, timestamps) ──

export const personaPortraitStoredSchema = personaPortraitSchema.extend({
  id: idSchema,
  session_id: idSchema,
  generation_provenance_id: idSchema,
  generated_at: z.string().min(1),
  status: z.enum(["generated", "calibrated", "stale"]),
});

export type PersonaPortrait = z.infer<typeof personaPortraitStoredSchema>;

// ── Streaming partial type (for SSE) ──

export type PartialPortrait = Partial<PersonaPortraitProposal>;

// ── Fixture helper for tests ──

export function makeFixturePortrait(): PersonaPortraitProposal {
  return {
    trait_scales: [
      { dimension: "energy_mode", level: 2, label: "主要靠独处恢复" },
      { dimension: "structure_pref", level: 3, label: "有框架但留弹性" },
      { dimension: "novelty_seeking", level: 2, label: "倾向已知路径" },
      { dimension: "decision_speed", level: 2, label: "反复权衡型" },
      { dimension: "emotional_range", level: 2, label: "内敛但非压抑" },
    ],
    trait_summary:
      "你在独处时恢复能量，社交不算排斥但会消耗。偏好有基本框架的安排，不喜欢被精确到小时。面对新事物时倾向先了解再行动，不会冲动跳入。决策时反复权衡，但一旦定了就不太回头。情感表达偏内敛，不等于不感受，只是习惯自己消化。",
    behavioral_patterns: [
      {
        pattern: "晚上效率明显高于白天，但不会主动调整白天安排来配合这个节奏",
        evidence_ref: { source_id: "w1-q5-a", source_revision: 1 },
        confidence: "medium",
      },
      {
        pattern: "课表固定时随大流，备考时能自己定作息——外部结构在时放松自我管理",
        evidence_ref: { source_id: "w1-q4-a", source_revision: 1 },
        confidence: "high",
      },
    ],
    psychological_features: [
      {
        feature: "压力下倾向回避而不是求助，习惯自己扛到实在撑不住",
        evidence_ref: { source_id: "w1-q6-a", source_revision: 1 },
      },
    ],
    relationship_mode:
      "和室友关系稳定但停留在日常层面，不主动深聊。对朋友有选择性——少数几个深的，其余维持友好距离。家人关系不坏但不太说心里话。",
    environment_fit:
      "在当前城市和学校环境里过得还行，但没觉得属于这里。环境给了基本安全感，但缺少让你兴奋的触发点。",
    self_narrative:
      "你把自己叙述为'还没想好但正在找方向的人'。过去的几次尝试都被你说成'还没真正开始'，好像在等一个足够确定的东西才肯认账。",
    current_identity:
      "目前定位自己是'在备考的学生'，但这个身份更像是默认状态而不是主动选择。",
    life_theme:
      "反复出现的主题是'准备好了再开始'——但准备的标准一直在提高，开始的时间一直在推迟。",
    said_vs_done: [
      {
        said: "想找方向",
        done: "过去几次尝试都叙述为'还没真正开始'",
        possible_reading: "可能不是找不到方向，而是对'开始'的门槛设得过高",
      },
    ],
    blind_spots: [
      {
        observation: "你很少提到什么让你兴奋——不是没有，可能是没被当成重要信息",
        why_it_matters: "兴奋感是验证方向是否真实适合你的最直接信号",
      },
    ],
    radar_snapshot: [
      { dimension: "traits", state: "signaled", one_line: "有基本倾向，但缺具体场景" },
      { dimension: "motivation", state: "signaled", one_line: "想找方向，但动机层次还没展开" },
      { dimension: "capabilities", state: "unseen", one_line: "还没提到具体能力和产出" },
      { dimension: "relationships", state: "signaled", one_line: "关系稳定但深度有限" },
      { dimension: "environment", state: "grounded", one_line: "城市、学校、节奏都有具体描述" },
      { dimension: "narrative", state: "signaled", one_line: "自我叙述模式已显现，但还没充分展开" },
    ],
    open_questions: [
      "什么活动让你忘记时间？",
      "如果不用担心准备，你现在最想试什么？",
    ],
    essence:
      "一个在备考节奏里能自律、课表固定时容易随大流的人，正在找方向但还没真正开始——可能不是缺方向，是对'开始'的门槛太高。",
  };
}
