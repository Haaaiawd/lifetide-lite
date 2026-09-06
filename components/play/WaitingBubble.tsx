"use client";

import { useEffect, useState, useRef } from "react";
import { motion, useReducedMotion } from "motion/react";
import { PixelIcon } from "@/components/art/PixelIcon";

// Fallback "thinking" text shown before any real stream data arrives.
// Loops: types out, pauses, restarts.
const INSIGHT_THINKING = [
  "正在整理你刚才的回答",
  "正在核对前后出现的线索",
  "正在写下这一波的理解",
];

const FINAL_THINKING = [
  "正在展开三种不同的生活",
  "正在检查三条路是否太相似",
  "正在整理每条路的真实代价",
];

const WAVE_THINKING = [
  "正在准备下一组问题",
  "正在寻找自然的继续方向",
  "正在避开已经问过的内容",
];

const PORTRAIT_THINKING = [
  "正在综合这几波对话",
  "正在核对反复出现的线索",
  "正在保留尚未确定的部分",
];

type StreamingInsight = {
  user_told_me?: string;
  current_reading?: string;
  important_unknown?: string;
};

export function WaitingBubble({
  variant = "insight",
  streamingInsight,
  streamingPortrait,
}: {
  variant?: "insight" | "final" | "wave" | "portrait";
  streamingInsight?: StreamingInsight | null;
  streamingPortrait?: { thinking?: string; essence?: string; trait_summary?: string } | null;
}) {
  const reduce = useReducedMotion();

  // If we have real stream data, show it directly — no typewriter needed,
  // the stream itself is the "typing".
  if (streamingInsight && (streamingInsight.user_told_me || streamingInsight.current_reading || streamingInsight.important_unknown)) {
    return <StreamingBubble streamingInsight={streamingInsight} reduce={reduce} />;
  }

  if (streamingPortrait && (streamingPortrait.essence || streamingPortrait.trait_summary)) {
    return <StreamingPortraitBubble streamingPortrait={streamingPortrait} reduce={reduce} />;
  }

  return <ThinkingBubble variant={variant} reduce={reduce} />;
}

/** Shows real streaming insight text as it arrives from SSE. */
function StreamingBubble({ streamingInsight, reduce }: { streamingInsight: StreamingInsight; reduce: boolean | null }) {
  const sections = [
    { label: "你告诉我的", text: streamingInsight.user_told_me },
    { label: "我目前的理解", text: streamingInsight.current_reading },
    { label: "还不确定", text: streamingInsight.important_unknown },
  ].filter((s) => s.text);

  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
      className="flex w-full gap-3 justify-start"
    >
      <span className="mt-1 inline-flex h-7 w-7 shrink-0 items-center justify-center border-2 border-ink/40 bg-paper-raised/70 shadow-sm">
        <PixelIcon name="sparkle" size={12} className="text-cobalt/60" />
      </span>
      <div className="max-h-[60dvh] max-w-[85%] overflow-y-auto rounded-sm border-2 border-dashed border-ink/30 bg-paper-raised/60 px-4 py-3 text-base leading-snug shadow-sm backdrop-blur-sm">
        <div className="space-y-3">
          {sections.map((s, i) => (
            <div key={i} className="border-l-4 border-cobalt/40 pl-3" style={{ animationDelay: `${i * 0.4}s` }}>
              <div className="mb-0.5 text-xs font-medium uppercase tracking-wide text-ink-muted/70">
                {s.label}
              </div>
              <p className="font-serif text-lg leading-snug">
                <span className="stream-wave-text" style={{ animationDelay: `${i * 0.5}s` }}>{s.text}</span>
                <span className="animate-pulse text-cobalt/50">▎</span>
              </p>
            </div>
          ))}
        </div>
      </div>
    </motion.div>
  );
}

/** Shows real streaming portrait text as it arrives from SSE. */
function StreamingPortraitBubble({ streamingPortrait, reduce }: { streamingPortrait: { thinking?: string; essence?: string; trait_summary?: string }; reduce: boolean | null }) {
  const sections = [
    { label: "一句话", text: streamingPortrait.essence },
    { label: "特质概要", text: streamingPortrait.trait_summary },
  ].filter((s) => s.text);

  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
      className="flex w-full gap-3 justify-start"
    >
      <span className="mt-1 inline-flex h-7 w-7 shrink-0 items-center justify-center border-2 border-ink/40 bg-paper-raised/70 shadow-sm">
        <PixelIcon name="sparkle" size={12} className="text-cobalt/60" />
      </span>
      <div className="max-h-[60dvh] max-w-[85%] overflow-y-auto rounded-sm border-2 border-dashed border-ink/30 bg-paper-raised/60 px-4 py-3 text-base leading-snug shadow-sm backdrop-blur-sm">
        <div className="space-y-3">
          {sections.map((s, i) => (
            <div key={i} className="border-l-4 border-cobalt/40 pl-3" style={{ animationDelay: `${i * 0.4}s` }}>
              <div className="mb-0.5 text-xs font-medium uppercase tracking-wide text-ink-muted/70">
                {s.label}
              </div>
              <p className="font-serif text-lg leading-snug">
                <span className="stream-wave-text" style={{ animationDelay: `${i * 0.5}s` }}>{s.text}</span>
                <span className="animate-pulse text-cobalt/50">▎</span>
              </p>
            </div>
          ))}
        </div>
      </div>
    </motion.div>
  );
}

/** Fallback: fake typewriter "thinking" text before stream data arrives. */
function ThinkingBubble({ variant, reduce }: { variant: "insight" | "final" | "wave" | "portrait"; reduce: boolean | null }) {
  const lines = variant === "final" ? FINAL_THINKING : variant === "wave" ? WAVE_THINKING : variant === "portrait" ? PORTRAIT_THINKING : INSIGHT_THINKING;
  const [lineIdx, setLineIdx] = useState(0);
  const [charCount, setCharCount] = useState(0);
  const rafRef = useRef<number | null>(null);
  const startTimeRef = useRef<number | null>(null);
  const phaseRef = useRef<"typing" | "pause">("typing");

  const currentLine = lines[lineIdx];

  useEffect(() => {
    if (reduce) return;

    setCharCount(0);
    startTimeRef.current = null;
    phaseRef.current = "typing";
    let cancelled = false;

    const cps = 38;
    const interval = Math.max(1000 / cps, 14);
    const pauseMs = 1200;

    const tick = (now: number) => {
      if (cancelled) return;
      if (phaseRef.current === "pause") return;

      if (startTimeRef.current === null) startTimeRef.current = now;
      const elapsed = now - startTimeRef.current;
      const chars = Math.floor(elapsed / interval);

      if (chars >= currentLine.length) {
        setCharCount(currentLine.length);
        phaseRef.current = "pause";
        setTimeout(() => {
          if (cancelled) return;
          setLineIdx((i) => (i + 1) % lines.length);
        }, pauseMs);
        rafRef.current = null;
        return;
      }
      setCharCount(chars);
      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);

    return () => {
      cancelled = true;
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [currentLine, reduce, lines.length]);

  const visibleText = reduce ? currentLine : currentLine.slice(0, charCount);

  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
      className="flex w-full justify-start gap-3"
    >
      <span className="mt-1 inline-flex h-7 w-7 shrink-0 items-center justify-center border-2 border-ink bg-paper-raised shadow-sm">
        <PixelIcon name="sparkle" size={12} className="text-cobalt" />
      </span>
      <div className="flex min-h-14 w-[min(85%,34rem)] items-center rounded-sm border-2 border-ink bg-paper-raised px-4 py-3 shadow-sm">
        <p className="font-serif text-base leading-snug text-ink/65 md:text-lg" aria-live="polite">
          {visibleText}
          {!reduce && <span className="ml-0.5 animate-pulse text-cobalt/60">▎</span>}
        </p>
      </div>
    </motion.div>
  );
}
