"use client";

import { useEffect, useState, useRef } from "react";
import { motion, useReducedMotion } from "motion/react";
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

  // Walking phase: advances until either (a) stream content arrives, or
  // (b) the safety cap is reached. Not fixed to a set duration.
  useEffect(() => {
    if (error) {
      setPhase("error");
      return;
    }
    if (reduce) {
      setWalkProgress(1);
      setPhase(hasStreamContent ? "streaming" : "walking");
      return;
    }
    if (phase !== "walking") return; // 避免重入时重置 phase
    setPhase("walking");
    setWalkProgress(0);
    walkStartRef.current = null;

    const tick = (now: number) => {
      if (walkStartRef.current === null) walkStartRef.current = now;
      const elapsed = now - walkStartRef.current;
      const p = Math.min(elapsed / MAX_WALK_DURATION, 1);
      setWalkProgress(p);

      // Stream content arrived — end walking and hand over to streaming.
      if (hasStreamContent) {
        setWalkProgress(1);
        setPhase("streaming");
        rafRef.current = null;
        return;
      }

      // Safety cap: if nothing arrives for a long time, show "正在生成……".
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
  }, [error, reduce, hasStreamContent, phase]);

  // Once streaming, show streaming content. When complete, wait a beat
  // before calling onComplete so the user actually sees the final text.
  useEffect(() => {
    if (phase !== "streaming" || !isComplete || !onComplete) return;
    setPhase("complete");
    const timer = setTimeout(() => {
      if (!isComplete) return;
      onComplete();
    }, STREAMING_SETTLE_MS);
    return () => clearTimeout(timer);
  }, [phase, isComplete, onComplete]);

  return (
    <motion.div
      initial={reduce ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
      className="fixed inset-0 bottom-0 top-14 z-[60] flex flex-col items-center justify-center bg-paper/95 backdrop-blur-sm"
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
          className="flex w-full max-w-2xl flex-col px-6"
        >
          <h2 className="mb-4 font-serif text-xl font-medium text-ink">
            {variant === "portrait" ? "你的人格画像" : "三条平行人生"}
          </h2>
          <div className="max-h-[70dvh] space-y-4 overflow-y-auto">
            {streamingSections && streamingSections.length > 0 ? (
              streamingSections
                .filter((s) => s.text)
                .map((s, i) => (
                  <StreamingSectionCard key={i} section={s} delay={i * 0.3} reduce={reduce} variant={variant} />
                ))
            ) : (
              <div className="flex items-center gap-2 text-ink-muted">
                <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-cobalt" />
                <span className="text-sm">正在生成……</span>
              </div>
            )}
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
      {phase === "streaming" && onCancel && (
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

function StreamingSectionCard({
  section,
  delay,
  reduce,
  variant,
}: {
  section: StreamingSection;
  delay: number;
  reduce: boolean | null;
  variant: "portrait" | "final";
}) {
  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, x: -16 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.4, delay, ease: [0.16, 1, 0.3, 1] }}
      className="border-l-4 border-cobalt/40 bg-paper-raised/60 px-4 py-3"
    >
      <div className="mb-1 text-xs font-medium uppercase tracking-wide text-ink-muted/70">
        {section.label}
      </div>
      <p className="font-serif text-base leading-snug">
        {variant === "final" ? (
          <TypewriterText text={section.text} />
        ) : (
          <>
            <span className="stream-wave-text">{section.text}</span>
            <span className="animate-pulse text-cobalt/50">▎</span>
          </>
        )}
      </p>
    </motion.div>
  );
}

function TypewriterText({ text, cps = 40 }: { text: string; cps?: number }) {
  const revealed = useTypewriter(text, cps);
  return (
    <>
      {revealed}
      {revealed.length < text.length && (
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
