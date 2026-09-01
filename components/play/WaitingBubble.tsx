"use client";

import { useEffect, useState, useRef } from "react";
import { motion, useReducedMotion } from "motion/react";
import { PixelIcon } from "@/components/art/PixelIcon";

// Fallback "thinking" text shown before any real stream data arrives.
// Loops: types out, pauses, restarts.
const INSIGHT_THINKING = [
  "让我想想你说的这些……你提到的几件事之间，好像有些联系。",
  "你说最近节奏不太规律，身边的人主要是同学——这两个放在一起看……",
  "你来的原因是想更清楚接下来怎么走，现在还在读，还没想好……",
];

const FINAL_THINKING = [
  "在把你说的整理成几条不同的路线……每条都得是一个真的能过的日子。",
  "第一条想从你现在的节奏出发，看看不换环境能调整什么……",
  "第二条想试试把你想做的那些事串起来……第三条再放开一点想……",
];

const WAVE_THINKING = [
  "在准备下一组问题……想基于你刚才说的，找到更具体的切入点。",
  "你提到的几个方向，我想挑一个最关键的展开……",
  "不是随便问，是想让下一轮帮你看清一个真的需要决定的事……",
];

const PORTRAIT_THINKING = [
  "在把你说的所有话综合起来看……不只是整理，是在找你自己可能没注意到的模式。",
  "你说喜欢自由，但三次都选了有框架的安排——这种差距值得想一下……",
  "在找反复出现的东西……不是贴标签，是找一个真正能解释你几个行为的模式……",
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
  streamingPortrait?: { essence?: string; trait_summary?: string } | null;
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
      <span className="mt-1 inline-flex h-7 w-7 shrink-0 items-center justify-center border-2 border-ink bg-paper-raised shadow-sm">
        <PixelIcon name="sparkle" size={12} className="text-cobalt" />
      </span>
      <div className="max-w-[85%] rounded-sm border-2 border-ink bg-paper-raised px-4 py-3 text-base leading-snug shadow-sm">
        <div className="space-y-3">
          {sections.map((s, i) => (
            <div key={i} className="border-l-4 border-cobalt pl-3">
              <div className="mb-0.5 text-xs font-medium uppercase tracking-wide text-ink-muted">
                {s.label}
              </div>
              <p className="font-serif text-lg leading-snug">
                <span className="text-ink">{s.text}</span>
                <span className="animate-pulse">▎</span>
              </p>
            </div>
          ))}
        </div>
      </div>
    </motion.div>
  );
}

/** Shows real streaming portrait text as it arrives from SSE. */
function StreamingPortraitBubble({ streamingPortrait, reduce }: { streamingPortrait: { essence?: string; trait_summary?: string }; reduce: boolean | null }) {
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
      <span className="mt-1 inline-flex h-7 w-7 shrink-0 items-center justify-center border-2 border-ink bg-paper-raised shadow-sm">
        <PixelIcon name="sparkle" size={12} className="text-cobalt" />
      </span>
      <div className="max-w-[85%] rounded-sm border-2 border-ink bg-paper-raised px-4 py-3 text-base leading-snug shadow-sm">
        <div className="space-y-3">
          {sections.map((s, i) => (
            <div key={i} className="border-l-4 border-cobalt pl-3">
              <div className="mb-0.5 text-xs font-medium uppercase tracking-wide text-ink-muted">
                {s.label}
              </div>
              <p className="font-serif text-lg leading-snug">
                <span className="text-ink">{s.text}</span>
                <span className="animate-pulse">▎</span>
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

  const visibleText = currentLine.slice(0, charCount);
  const fadeLen = 14;
  const fadeText = currentLine.slice(charCount, charCount + fadeLen);

  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
      className="flex w-full gap-3 justify-start"
    >
      <span className="mt-1 inline-flex h-7 w-7 shrink-0 items-center justify-center border-2 border-ink bg-paper-raised shadow-sm">
        <PixelIcon name="sparkle" size={12} className="text-cobalt" />
      </span>
      <div className="max-w-[85%] rounded-sm border-2 border-ink bg-paper-raised px-4 py-3 text-base leading-snug shadow-sm">
        <p className="font-serif text-lg leading-snug">
          <span className="text-ink">{visibleText}</span>
          <span
            className="text-ink-muted"
            style={{ opacity: 0.3, filter: "blur(0.4px)" }}
          >
            {fadeText}
          </span>
          <span className="animate-pulse">▎</span>
        </p>
      </div>
    </motion.div>
  );
}
