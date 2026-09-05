"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { motion, useReducedMotion } from "motion/react";
import { DayProgressAnimation } from "@/components/routes/DayProgressAnimation";

type Phase = "walking" | "streaming" | "error";

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
  /** Streaming data — when sections appear, we switch from walking to streaming. */
  streamingSections?: StreamingSection[] | null;
  /** Error message — if set, overlay shows error + retry. */
  error?: string | null;
  /** Retry callback. */
  onRetry?: () => void;
  /** Cancel / close callback. */
  onCancel?: () => void;
};

/**
 * Full-screen overlay for portrait and final-plan generation.
 *
 * Two-phase experience:
 * 1. Walking phase: pixel-art traveler walks through a day cycle (~3s).
 *    This is the "ceremony" — a ritual transition before results appear.
 * 2. Streaming phase: once streaming data arrives (or walking completes
 *    for non-streaming final plan), text content fades in section by section.
 *
 * For portrait: SSE provides real streaming text.
 * For final plan: no SSE, so we use a typewriter effect on the result.
 */
export function GenerationOverlay({
  variant,
  title,
  subtitle,
  streamingSections,
  error,
  onRetry,
  onCancel,
}: GenerationOverlayProps) {
  const reduce = useReducedMotion();
  const [phase, setPhase] = useState<Phase>("walking");
  const [walkProgress, setWalkProgress] = useState(0);
  const walkStartRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);

  // Walking phase: 3 seconds, time-driven. Skipped for reduced motion.
  useEffect(() => {
    if (error) {
      setPhase("error");
      return;
    }
    if (reduce) {
      setWalkProgress(1);
      setPhase("streaming");
      return;
    }
    setPhase("walking");
    setWalkProgress(0);
    walkStartRef.current = null;

    const walkDuration = 3000; // 3 seconds

    const tick = (now: number) => {
      if (walkStartRef.current === null) walkStartRef.current = now;
      const elapsed = now - walkStartRef.current;
      const p = Math.min(elapsed / walkDuration, 1);
      setWalkProgress(p);

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
  }, [error, reduce]);

  // If streaming data arrives during walking, transition early.
  const hasStreamContent = streamingSections && streamingSections.some((s) => s.text);
  useEffect(() => {
    if (phase === "walking" && hasStreamContent) {
      setWalkProgress(1);
      setPhase("streaming");
    }
  }, [hasStreamContent, phase]);

  return (
    <motion.div
      initial={reduce ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
      className="fixed inset-0 bottom-0 top-14 z-[60] flex flex-col items-center justify-center"
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
              <DayProgressAnimation
                progress={walkProgress}
                accentColor={variant === "portrait" ? "var(--cobalt)" : "var(--purple)"}
                className="rounded-none"
              />
            </div>
            <p className="mt-4 text-xs text-ink-muted">
              {variant === "portrait" ? "正在综合你说的所有话，找你的模式……" : "正在为你设计三条不同的路线……"}
            </p>
          </motion.div>
        )}

        {/* Streaming / content phase */}
        {phase === "streaming" && !error && (
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
                    <StreamingSectionCard key={i} section={s} delay={i * 0.3} reduce={reduce} />
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
}: {
  section: StreamingSection;
  delay: number;
  reduce: boolean | null;
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
        <span className="stream-wave-text">{section.text}</span>
        <span className="animate-pulse text-cobalt/50">▎</span>
      </p>
    </motion.div>
  );
}

/**
 * Typewriter hook for fake-streaming non-SSE content (final plan).
 * Reveals text character by character at a fixed rate.
 */
export function useTypewriter(text: string, cps: number = 40): string {
  const [revealed, setRevealed] = useState("");
  const rafRef = useRef<number | null>(null);
  const startRef = useRef<number | null>(null);
  const reduce = useReducedMotion();

  const reset = useCallback(() => {
    setRevealed("");
    startRef.current = null;
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
  }, []);

  useEffect(() => {
    if (!text) {
      setRevealed("");
      return;
    }
    if (reduce) {
      setRevealed(text);
      return;
    }
    setRevealed("");
    startRef.current = null;
    const interval = Math.max(1000 / cps, 14);

    const tick = (now: number) => {
      if (startRef.current === null) startRef.current = now;
      const elapsed = now - startRef.current;
      const chars = Math.floor(elapsed / interval);
      if (chars >= text.length) {
        setRevealed(text);
        rafRef.current = null;
        return;
      }
      setRevealed(text.slice(0, chars));
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [text, cps, reduce]);

  return revealed;
}
