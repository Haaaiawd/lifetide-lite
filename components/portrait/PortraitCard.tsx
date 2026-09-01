"use client";

import { motion, useReducedMotion } from "motion/react";
import Image from "next/image";
import type { PersonaPortrait, TraitDimension } from "@/lib/portrait/types";
import { matchArchetype } from "@/lib/portrait/archetypes";
import { PixelIcon } from "@/components/art/PixelIcon";

const TRAIT_LABELS: Record<TraitDimension, { left: string; right: string; name: string }> = {
  energy_mode: { name: "能量模式", left: "独处恢复", right: "社交恢复" },
  structure_pref: { name: "结构偏好", left: "自由安排", right: "严格计划" },
  novelty_seeking: { name: "新异探索", left: "已知优先", right: "新异优先" },
  decision_speed: { name: "决策速度", left: "反复权衡", right: "快速决断" },
  emotional_range: { name: "情感表达", left: "内敛含蓄", right: "外放直接" },
};

// 每个特质维度有自己的主题色
const TRAIT_COLORS: Record<TraitDimension, string> = {
  energy_mode: "bg-cobalt",
  structure_pref: "bg-teal",
  novelty_seeking: "bg-purple",
  decision_speed: "bg-amber",
  emotional_range: "bg-success",
};

const RADAR_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  grounded: { bg: "bg-success-soft", text: "text-success", label: "已 grounded" },
  signaled: { bg: "bg-cobalt-soft", text: "text-cobalt", label: "signaled" },
  conflicted: { bg: "bg-danger-soft", text: "text-danger", label: "conflicted" },
  unseen: { bg: "bg-paper", text: "text-ink-muted", label: "unseen" },
  declined: { bg: "bg-paper", text: "text-ink-muted", label: "declined" },
};

const CONFIDENCE_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  high: { bg: "bg-cobalt", text: "text-white", label: "高" },
  medium: { bg: "bg-cobalt-soft", text: "text-cobalt", label: "中" },
  low: { bg: "bg-paper", text: "text-ink-muted", label: "低" },
};

function TraitBar({ dimension, level, label }: { dimension: TraitDimension; level: number; label: string }) {
  const meta = TRAIT_LABELS[dimension];
  const fillClass = TRAIT_COLORS[dimension];
  const segments = [1, 2, 3, 4, 5];

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between text-xs">
        <span className="font-medium text-ink">{meta.name}</span>
        <span className="text-ink-muted">{label}</span>
      </div>
      <div className="flex items-center gap-1">
        <span className="w-16 text-right text-[10px] text-ink-muted">{meta.left}</span>
        <div className="flex flex-1 gap-0.5">
          {segments.map((seg) => (
            <div
              key={seg}
              className={`h-4 flex-1 border border-ink ${seg <= level ? fillClass : "bg-paper-raised"}`}
            />
          ))}
        </div>
        <span className="w-16 text-[10px] text-ink-muted">{meta.right}</span>
      </div>
    </div>
  );
}

function SectionTitle({ children, color = "text-ink-muted" }: { children: React.ReactNode; color?: string }) {
  return (
    <div className="mb-2 flex items-center gap-2 border-b border-ink/20 pb-1">
      <span className={`inline-block h-3 w-3 border border-ink ${color.replace("text-", "bg-")}`} />
      <h3 className="text-xs font-medium uppercase tracking-wide text-ink-muted">{children}</h3>
    </div>
  );
}

export function PortraitCard({ portrait }: { portrait: PersonaPortrait }) {
  const reduce = useReducedMotion();
  const archetype = matchArchetype(portrait.trait_scales);

  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      className="mx-auto w-full max-w-2xl"
    >
      {/* Header — ID card style */}
      <div className="border-2 border-ink bg-paper-raised shadow-md">
        <div className="flex items-center justify-between border-b-2 border-ink bg-cobalt-soft px-4 py-2">
          <div className="flex items-center gap-2">
            <span className="inline-flex h-6 w-6 items-center justify-center border-2 border-ink bg-paper-raised shadow-sm">
              <PixelIcon name="sparkle" size={12} className="text-cobalt" />
            </span>
            <span className="font-serif text-sm font-medium tracking-wide">个人画像</span>
          </div>
          <span className="text-[10px] text-ink-muted">
            REV.{portrait.generated_at.slice(0, 10)}
          </span>
        </div>

        <div className="space-y-6 p-5">
          {/* Archetype avatar + name */}
          <div className="flex items-center gap-4">
            <div
              className="relative h-28 w-21 shrink-0 overflow-hidden border-2 border-ink shadow-sm"
              style={{ backgroundColor: archetype.bg, aspectRatio: "3 / 4" }}
            >
              <Image
                src={archetype.image}
                alt={archetype.name}
                fill
                sizes="84px"
                className="object-cover pixelated"
                priority
              />
            </div>
            <div className="flex flex-col gap-1">
              <div className="text-[10px] font-medium uppercase tracking-wider text-ink-muted">你的角色</div>
              <div className="font-serif text-2xl font-medium leading-tight">{archetype.name}</div>
              <div className="text-sm text-ink-muted leading-snug">{archetype.tagline}</div>
            </div>
          </div>

          {/* Essence — one-liner with gradient accent */}
          <div className="border-l-4 border-cobalt bg-cobalt-soft/50 pl-4 pr-3 py-3">
            <div className="mb-1 text-[10px] font-medium uppercase tracking-wider text-cobalt">ESSENCE</div>
            <p className="font-serif text-lg leading-snug">{portrait.essence}</p>
          </div>

          {/* Trait scales — 5 bars with distinct colors */}
          <div>
            <SectionTitle color="text-cobalt">特质倾向</SectionTitle>
            <div className="space-y-3">
              {portrait.trait_scales.map((scale) => (
                <TraitBar key={scale.dimension} dimension={scale.dimension} level={scale.level} label={scale.label} />
              ))}
            </div>
            <p className="mt-3 text-sm leading-snug text-ink-muted">{portrait.trait_summary}</p>
          </div>

          {/* Behavioral patterns — with confidence chips */}
          {portrait.behavioral_patterns.length > 0 && (
            <div>
              <SectionTitle color="text-teal">你反复在做的事</SectionTitle>
              <ul className="space-y-2">
                {portrait.behavioral_patterns.map((p, i) => {
                  const conf = CONFIDENCE_STYLES[p.confidence] ?? CONFIDENCE_STYLES.low;
                  return (
                    <li key={i} className="flex items-start gap-2 text-sm leading-snug">
                      <span className={`mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center border border-ink text-[10px] font-medium ${conf.bg} ${conf.text}`}>
                        {conf.label}
                      </span>
                      <span className="flex-1">{p.pattern}</span>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          {/* Psychological features — purple accent */}
          {portrait.psychological_features.length > 0 && (
            <div>
              <SectionTitle color="text-purple">心理特征</SectionTitle>
              <ul className="space-y-2">
                {portrait.psychological_features.map((f, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm leading-snug">
                    <span className="mt-1 inline-block h-3 w-3 shrink-0 border border-ink bg-purple" />
                    <span className="flex-1">{f.feature}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Relationship + Environment — teal and amber cards */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="border border-ink/30 bg-teal-soft/50 p-3">
              <div className="mb-1.5 flex items-center gap-1.5">
                <span className="inline-block h-3 w-3 border border-ink bg-teal" />
                <h3 className="text-xs font-medium uppercase tracking-wide text-teal">关系模式</h3>
              </div>
              <p className="text-sm leading-snug">{portrait.relationship_mode}</p>
            </div>
            <div className="border border-ink/30 bg-amber-soft/50 p-3">
              <div className="mb-1.5 flex items-center gap-1.5">
                <span className="inline-block h-3 w-3 border border-ink bg-amber" />
                <h3 className="text-xs font-medium uppercase tracking-wide text-amber">环境适应</h3>
              </div>
              <p className="text-sm leading-snug">{portrait.environment_fit}</p>
            </div>
          </div>

          {/* Narrative identity — purple themed */}
          <div className="border border-ink/30 bg-purple-soft/40 p-4">
            <div className="mb-2 flex items-center gap-1.5">
              <span className="inline-block h-3 w-3 border border-ink bg-purple" />
              <h3 className="text-xs font-medium uppercase tracking-wide text-purple">叙事身份</h3>
            </div>
            <div className="space-y-2 text-sm leading-snug">
              <div className="flex gap-2">
                <span className="shrink-0 text-xs font-medium text-purple">自我叙事</span>
                <span className="flex-1">{portrait.self_narrative}</span>
              </div>
              <div className="flex gap-2">
                <span className="shrink-0 text-xs font-medium text-purple">当前身份</span>
                <span className="flex-1">{portrait.current_identity}</span>
              </div>
              <div className="flex gap-2">
                <span className="shrink-0 text-xs font-medium text-purple">生命主题</span>
                <span className="flex-1">{portrait.life_theme}</span>
              </div>
            </div>
          </div>

          {/* Said vs done — danger themed cards */}
          {portrait.said_vs_done.length > 0 && (
            <div>
              <SectionTitle color="text-danger">你说和做之间</SectionTitle>
              <div className="space-y-2">
                {portrait.said_vs_done.map((s, i) => (
                  <div key={i} className="border border-ink/30 bg-danger-soft/50 p-3 text-sm leading-snug">
                    <div className="flex gap-2">
                      <span className="shrink-0 text-xs font-medium text-danger">说了</span>
                      <span className="flex-1">{s.said}</span>
                    </div>
                    <div className="mt-1 flex gap-2">
                      <span className="shrink-0 text-xs font-medium text-danger">做了</span>
                      <span className="flex-1">{s.done}</span>
                    </div>
                    <div className="mt-1.5 border-t border-danger/20 pt-1.5 flex gap-2">
                      <span className="shrink-0 text-xs text-ink-muted">→</span>
                      <span className="flex-1 text-ink-muted">{s.possible_reading}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Blind spots — amber themed */}
          {portrait.blind_spots.length > 0 && (
            <div>
              <SectionTitle color="text-amber">你可能没注意的</SectionTitle>
              <div className="space-y-2">
                {portrait.blind_spots.map((b, i) => (
                  <div key={i} className="border border-ink/30 bg-amber-soft/50 p-3 text-sm leading-snug">
                    <div className="flex items-start gap-2">
                      <span className="mt-0.5 inline-block h-3 w-3 shrink-0 border border-ink bg-amber" />
                      <div className="flex-1">
                        <p>{b.observation}</p>
                        <p className="mt-0.5 text-xs text-ink-muted">{b.why_it_matters}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Radar snapshot — color-coded state grid */}
          <div>
            <SectionTitle color="text-cobalt">六维状态</SectionTitle>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {portrait.radar_snapshot.map((cell) => {
                const style = RADAR_STYLES[cell.state] ?? RADAR_STYLES.unseen;
                return (
                  <div key={cell.dimension} className={`border border-ink/30 p-2 ${style.bg}`}>
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-medium uppercase tracking-wide text-ink-muted">
                        {cell.dimension}
                      </span>
                      <span className={`text-[10px] font-medium ${style.text}`}>
                        {style.label}
                      </span>
                    </div>
                    <div className="mt-0.5 text-[11px] leading-tight text-ink-muted">{cell.one_line}</div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Open questions — cobalt themed chips */}
          {portrait.open_questions.length > 0 && (
            <div>
              <SectionTitle color="text-cobalt">还不确定的</SectionTitle>
              <div className="flex flex-wrap gap-2">
                {portrait.open_questions.map((q, i) => (
                  <div key={i} className="border border-ink/30 bg-cobalt-soft/50 px-3 py-1.5 text-sm leading-snug">
                    <span className="text-cobalt">? </span>
                    <span className="text-ink">{q}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}
