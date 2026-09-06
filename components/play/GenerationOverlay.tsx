"use client";

import { useEffect, useState, useRef } from "react";
import { motion, useReducedMotion, AnimatePresence } from "motion/react";
import { WalkProgress } from "@/components/play/WalkProgress";

type Phase = "walking" | "streaming" | "complete" | "error";

type StreamingSection = {
  label: string;
  text: string;
};

export type GenerationOverlayProps = {
  /** What kind of generation this overlay is for. */
  variant: "portrait" | "final";
  /** Title shown above the walking animation. */
  title: string;
  /** Subtitle shown during walking phase. */
  subtitle: string;
  /** Streaming data — drives both early transition from walking and content display. */
  streamingSections?: StreamingSection[] | null;
  /** When true, all content has arrived; overlay waits briefly then calls onComplete. */
  isComplete?: boolean;
  /** Called after the streaming content has been shown for a moment. */
  onComplete?: () => void;
  /** Error message — if set, overlay shows error + retry. */
  error?: string | null;
  /** Retry callback. */
  onRetry?: () => void;
  /** Cancel / close callback. */
  onCancel?: () => void;
};

const MAX_WALK_DURATION = 8000; // ms — fallback cap so it cannot hang forever
const STREAMING_SETTLE_MS = 2500; // ms — how long to show streamed content before transition

/**
 * Full-screen overlay for portrait and final-plan generation.
 *
 * Stream-driven experience:
 * 1. Walking phase: pixel-art traveler walks along a progress line. The walking
 *    phase ends as soon as real streaming content arrives — it does NOT wait
 *    for a fixed duration.
 * 2. Streaming phase: text content fades in section by section as it arrives.
 *    The model's live reasoning is shown first, then the generated content.
 * 3. Complete phase: when isComplete becomes true, the overlay waits a short
 *    moment so the user can see the final content, then calls onComplete.
 *
 * A max walking duration exists only as a safety cap (e.g., if the provider
 * streams no partials at all).
 */
export function GenerationOverlay({
  variant,
  title,
  subtitle,
  streamingSections,
  isComplete,
  onComplete,
  error,
  onRetry,
  onCancel,
}: GenerationOverlayProps) {
  const reduce = useReducedMotion();
  const [phase, setPhase] = useState<Phase>("walking");
  const [walkProgress, setWalkProgress] = useState(0);
  const walkStartRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);

  const hasStreamContent = streamingSections && streamingSections.some((s) => s.text);

  // Walking phase: advances until either (a) stream content arrives,
  // (b) the generation is already complete, or (c) the safety cap is reached.
  // Not fixed to a set duration. If content/complete arrives early, end
  // immediately without resetting the progress bar (avoids flicker).
  useEffect(() => {
    if (error) {
      setPhase("error");
      return;
    }
    if (reduce) {
      setWalkProgress(1);
      setPhase(isComplete ? "complete" : hasStreamContent ? "streaming" : "walking");
      return;
    }
    if (phase !== "walking") return;

    // Stream content or done already arrived — hand over to streaming.
    if (hasStreamContent || isComplete) {
      setWalkProgress(1);
      setPhase("streaming");
      return;
    }

    // Start fresh walking animation only on the first mount/entry into walking.
    setWalkProgress(0);
    walkStartRef.current = null;

    const tick = (now: number) => {
      if (walkStartRef.current === null) walkStartRef.current = now;
      const elapsed = now - walkStartRef.current;
      const p = Math.min(elapsed / MAX_WALK_DURATION, 1);
      setWalkProgress(p);

      if (hasStreamContent || isComplete) {
        setWalkProgress(1);
        setPhase("streaming");
        rafRef.current = null;
        return;
      }

      // Safety cap: if nothing arrives for a long time, still show streaming UI.
      if (p >= 1) {
        setPhase("streaming");
        rafRef.current = null;
        return;
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [error, reduce, hasStreamContent, isComplete, phase]);

  // Move from streaming to complete as soon as the generation is done.
  useEffect(() => {
    if (phase === "streaming" && isComplete) {
      setPhase("complete");
    }
  }, [phase, isComplete]);

  // Once complete, let the user see the final streamed content for a moment
  // before invoking onComplete. This effect is intentionally independent of
  // the phase-transition effect above so that setPhase("complete") does not
  // cancel the settle timer.
  useEffect(() => {
    if (phase !== "complete" || !onComplete) return;
    const timer = setTimeout(() => {
      if (!isComplete) return;
      onComplete();
    }, STREAMING_SETTLE_MS);
    return () => clearTimeout(timer);
  }, [phase, isComplete, onComplete]);

  // Separate the thinking section from the rest so it can be styled differently.
  const thinkingSection = streamingSections?.find((s) => s.label === "思考中");
  const contentSections = streamingSections?.filter((s) => s.label !== "思考中") ?? [];

  return (
    <motion.div
      initial={reduce ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
      className="fixed inset-0 bottom-0 top-14 z-[60] flex flex-col items-center justify-center graph-paper"
    >
      {/* Walking phase */}
      {phase === "walking" && (
        <motion.div
          initial={reduce ? false : { opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
          className="flex w-full max-w-2xl flex-col items-center px-6"
        >
          <h2 className="mb-2 font-serif text-2xl font-medium text-ink">
            {title}
          </h2>
          <p className="mb-6 text-sm text-ink-muted">
            {subtitle}
          </p>
          <div className="w-full">
            <WalkProgress
              progress={walkProgress}
              accentColor={variant === "portrait" ? "var(--cobalt)" : "var(--purple)"}
            />
          </div>
          <p className="mt-4 text-xs text-ink-muted">
            {variant === "portrait" ? "正在综合你说的所有话，找你的模式……" : "正在为你设计三条不同的路线……"}
          </p>
        </motion.div>
      )}

      {/* Streaming / content phase */}
      {(phase === "streaming" || phase === "complete") && !error && (
        <motion.div
          initial={reduce ? false : { opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
          className="flex h-[calc(100dvh-3.5rem)] w-full max-w-3xl flex-col px-4 py-6 md:px-6 md:py-8"
        >
          <div className="mb-4 text-center">
            <h2 className="font-serif text-xl font-medium text-ink md:text-2xl">
              {variant === "portrait" ? "你的人格画像" : "三条平行人生"}
            </h2>
            <p className="text-xs text-ink-muted md:text-sm">
              {variant === "portrait" ? "正在整理你的模式……" : "正在从你的生活里长出三条路……"}
            </p>
          </div>

          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
            <AnimatePresence>
              {thinkingSection?.text ? (
                <ThinkingCard
                  key="thinking"
                  text={thinkingSection.text}
                  reduce={reduce}
                />
              ) : phase === "streaming" ? (
                <FakeThinkingCard key="fake-thinking" reduce={reduce} />
              ) : null}
            </AnimatePresence>

            {contentSections.length > 0 ? (
              <div className="space-y-3">
                {contentSections.map((s, i) => (
                  <StreamingSectionCard
                    key={s.label}
                    section={s}
                    index={i}
                    reduce={reduce}
                    isComplete={phase === "complete"}
                  />
                ))}
              </div>
            ) : !thinkingSection?.text && phase !== "streaming" ? (
              <div className="flex items-center gap-2 text-ink-muted">
                <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-cobalt" />
                <span className="text-sm">正在生成……</span>
              </div>
            ) : null}
          </div>
        </motion.div>
      )}

      {/* Cancel controls — anchored to the overlay's bottom-right corner */}
      {phase === "walking" && onCancel && (
        <button
          type="button"
          onClick={onCancel}
          className="absolute bottom-6 right-6 text-sm text-ink-muted underline underline-offset-2 hover:text-cobalt"
        >
          返回
        </button>
      )}
      {(phase === "streaming" || phase === "complete") && onCancel && (
        <button
          type="button"
          onClick={onCancel}
          className="absolute bottom-6 right-6 border-2 border-ink bg-paper-raised px-4 py-2 text-sm font-medium text-ink shadow-sm transition-transform active:translate-x-[1px] active:translate-y-[1px] active:shadow-sm"
        >
          取消
        </button>
      )}

      {/* Error phase */}
      {phase === "error" && error && (
        <motion.div
          initial={reduce ? false : { opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="flex w-full max-w-md flex-col items-center px-6 text-center"
        >
          <div className="mb-4 border-2 border-danger bg-danger-soft/30 p-4">
            <p className="text-sm text-danger">{error}</p>
          </div>
          <div className="flex gap-3">
            {onRetry && (
              <button
                type="button"
                onClick={onRetry}
                className="border-2 border-ink bg-cobalt px-4 py-2 text-sm font-medium text-white shadow-md transition-transform active:translate-x-[1px] active:translate-y-[1px] active:shadow-sm"
              >
                重试
              </button>
            )}
            {onCancel && (
              <button
                type="button"
                onClick={onCancel}
                className="border-2 border-ink bg-paper-raised px-4 py-2 text-sm font-medium text-ink shadow-sm transition-transform active:translate-x-[1px] active:translate-y-[1px] active:shadow-sm"
              >
                返回
              </button>
            )}
          </div>
        </motion.div>
      )}
    </motion.div>
  );
}

function ThinkingCard({ text, reduce }: { text: string; reduce: boolean | null }) {
  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, height: 0 }}
      transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
      className="border-2 border-dashed border-ink/30 bg-paper-raised p-4 shadow-sm md:p-5"
    >
      <div className="mb-2 flex items-center gap-2 text-ink-muted">
        <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-cobalt" />
        <span className="text-xs font-medium uppercase tracking-wide">思考中</span>
      </div>
      <p className="font-serif text-sm leading-relaxed text-ink md:text-base">
        <TypewriterText text={text} hideCursor={false} />
      </p>
    </motion.div>
  );
}

/**
 * Pseudo thinking card shown while the model hasn't produced any real
 * thinking text yet, so the streaming phase never renders a blank page.
 * Types scripted lines with uneven pacing — quick bursts, slow stretches,
 * and occasional stalls — until real thinking content replaces it.
 */
const FAKE_THINKING_LINES = [
  "正在梳理你的生活模式……",
  "考虑不同的人生可能性……",
  "评估各条路线的可行性……",
  "把零散的线索拼成完整的故事……",
  "权衡每条路线的代价与收获……",
  "寻找那些被你忽略的细节……",
  "把过去的经历连成一条暗线……",
  "试着理解你真正在意的是什么……",
];

function FakeThinkingCard({ reduce }: { reduce: boolean | null }) {
  const text = useFakeThinking(reduce);
  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, height: 0 }}
      transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
      className="border-2 border-dashed border-ink/30 bg-paper-raised p-4 shadow-sm md:p-5"
    >
      <div className="mb-2 flex items-center gap-2 text-ink-muted">
        <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-cobalt" />
        <span className="text-xs font-medium uppercase tracking-wide">思考中</span>
      </div>
      <p className="font-serif text-sm leading-relaxed text-ink md:text-base">
        {text}
        <span className="animate-pulse text-cobalt/50">▎</span>
      </p>
    </motion.div>
  );
}

/**
 * Fake-streaming hook for the pseudo thinking card.
 * Types each line character by character with irregular delays —
 * mostly fast, sometimes slower, occasionally pausing mid-line —
 * then holds briefly and moves on to the next line.
 */
function useFakeThinking(reduce: boolean | null): string {
  const [text, setText] = useState("");

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    let line = 0;
    let char = 0;
    let cancelled = false;

    const schedule = (fn: () => void, delay: number) => {
      timer = setTimeout(() => {
        if (!cancelled) fn();
      }, delay);
    };

    if (reduce) {
      // No typing animation — just rotate the full lines slowly.
      setText(FAKE_THINKING_LINES[0]);
      const cycle = () => {
        line = (line + 1) % FAKE_THINKING_LINES.length;
        setText(FAKE_THINKING_LINES[line]);
        schedule(cycle, 2600);
      };
      schedule(cycle, 2600);
      return () => {
        cancelled = true;
        if (timer) clearTimeout(timer);
      };
    }

    const step = () => {
      const msg = FAKE_THINKING_LINES[line % FAKE_THINKING_LINES.length];
      if (char <= msg.length) {
        setText(msg.slice(0, char));
        char += 1;
        const r = Math.random();
        let delay = 18 + Math.random() * 22; // mostly 18-40ms for fast, natural typing
        if (r < 0.04) delay = 300 + Math.random() * 500; // rare stall — “卡顿”
        else if (r < 0.15) delay = 60 + Math.random() * 100; // occasional slow char
        schedule(step, delay);
      } else {
        // Almost no hold between lines — start next line after a short pause.
        schedule(() => {
          char = 0;
          line += 1;
          step();
        }, 120 + Math.random() * 180);
      }
    };
    step();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [reduce]);

  return text;
}

function StreamingSectionCard({
  section,
  index,
  reduce,
  isComplete,
}: {
  section: StreamingSection;
  index: number;
  reduce: boolean | null;
  isComplete?: boolean;
}) {
  const isThinking = section.label === "思考中";
  const accentColor = isThinking ? "var(--cobalt)" : "var(--purple)";

  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, x: -16, y: 8 }}
      animate={{ opacity: 1, x: 0, y: 0 }}
      transition={{
        duration: 0.45,
        delay: index * 0.12,
        ease: [0.16, 1, 0.3, 1],
      }}
      className="border-l-4 bg-paper-raised px-4 py-3 shadow-sm md:px-5 md:py-4"
      style={{ borderLeftColor: accentColor }}
    >
      <div className="mb-1 text-xs font-medium uppercase tracking-wide text-ink-muted/70">
        {section.label}
      </div>
      <p className="font-serif text-base leading-snug text-ink">
        <TypewriterText text={section.text} hideCursor={isComplete} />
      </p>
    </motion.div>
  );
}

function TypewriterText({ text, cps = 45, hideCursor }: { text: string; cps?: number; hideCursor?: boolean }) {
  const revealed = useTypewriter(text, cps);
  return (
    <>
      {revealed}
      {!hideCursor && revealed.length < text.length && (
        <span className="animate-pulse text-cobalt/50">▎</span>
      )}
    </>
  );
}

/**
 * Typewriter hook for fake-streaming non-SSE content (final plan).
 * Reveals text character by character at a fixed rate.
 */
export function useTypewriter(text: string, cps: number = 40): string {
  const [revealed, setRevealed] = useState("");
  // Tracks the text already shown so that when `text` grows (streaming
  // partial updates), the typewriter continues from the revealed prefix
  // instead of restarting from scratch.
  const revealedRef = useRef("");
  const rafRef = useRef<number | null>(null);
  const startRef = useRef<number | null>(null);
  const reduce = useReducedMotion();

  useEffect(() => {
    if (!text) {
      revealedRef.current = "";
      setRevealed("");
      return;
    }
    if (reduce) {
      revealedRef.current = text;
      setRevealed(text);
      return;
    }
    // Continue from the already-revealed prefix when the new text extends
    // it; otherwise (text changed entirely) restart from zero.
    const base = text.startsWith(revealedRef.current) ? revealedRef.current : "";
    revealedRef.current = base;
    setRevealed(base);
    startRef.current = null;
    const interval = Math.max(1000 / cps, 14);

    const tick = (now: number) => {
      if (startRef.current === null) startRef.current = now;
      const elapsed = now - startRef.current;
      const chars = base.length + Math.floor(elapsed / interval);
      if (chars >= text.length) {
        revealedRef.current = text;
        setRevealed(text);
        rafRef.current = null;
        return;
      }
      revealedRef.current = text.slice(0, chars);
      setRevealed(revealedRef.current);
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [text, cps, reduce]);

  return revealed;
}
