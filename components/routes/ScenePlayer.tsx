"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence, useReducedMotion } from "motion/react";
import { Pause, Play } from "@phosphor-icons/react";

export type ScenePlayerProps = {
  scenes: { text: string }[];
  /** ms per scene before auto-advancing */
  durationPerScene?: number;
  /** accent color */
  accentColor?: string;
  /** callback when progress changes (0 to 1) */
  onProgress?: (progress: number) => void;
  /** callback when the first full playthrough completes (player keeps looping) */
  onComplete?: () => void;
};

export function ScenePlayer({
  scenes,
  durationPerScene = 4500,
  accentColor = "var(--cobalt)",
  onProgress,
  onComplete,
}: ScenePlayerProps) {
  const reduce = useReducedMotion();
  const [index, setIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(true);
  const [completedOnce, setCompletedOnce] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const total = scenes.length;
  const progress = total > 0 ? (index + 1) / total : 0;

  useEffect(() => {
    onProgress?.(progress);
  }, [progress, onProgress]);

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const advance = useCallback(() => {
    setIndex((current) => {
      const next = current + 1;
      if (next >= total) {
        return 0; // loop back to start
      }
      return next;
    });
  }, [total]);

  // Detect wrap-around (index went from last → 0) to fire onComplete once.
  const prevIndexRef = useRef(0);
  useEffect(() => {
    if (prevIndexRef.current === total - 1 && index === 0 && !completedOnce) {
      setCompletedOnce(true);
      onComplete?.();
    }
    prevIndexRef.current = index;
  }, [index, total, completedOnce, onComplete]);

  useEffect(() => {
    if (!isPlaying) return;
    clearTimer();
    timerRef.current = setTimeout(advance, durationPerScene);
    return clearTimer;
  }, [index, isPlaying, advance, durationPerScene, clearTimer]);

  const handleTogglePlay = () => {
    setIsPlaying((p) => !p);
  };

  const currentScene = scenes[index];

  return (
    <div className="flex w-full flex-col gap-4">
      {/* Scene text card */}
      <div className="relative flex min-h-[120px] w-full items-center justify-center border-2 border-ink bg-paper-raised px-6 py-8 shadow-sm">
        <AnimatePresence mode="popLayout" initial={false}>
          {currentScene && (
            <motion.p
              key={index}
              initial={reduce ? false : { opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={reduce ? undefined : { opacity: 0 }}
              transition={{ duration: reduce ? 0 : 0.4 }}
              className="max-w-2xl text-center font-serif text-lg leading-relaxed text-ink md:text-xl"
            >
              {currentScene.text}
            </motion.p>
          )}
        </AnimatePresence>
      </div>

      {/* Controls: play button + framed step counter + step dots */}
      <div className="flex flex-wrap items-center justify-center gap-3">
        <button
          type="button"
          onClick={handleTogglePlay}
          className="flex h-10 w-10 items-center justify-center border-2 border-ink bg-paper-raised shadow-sm transition-transform active:translate-x-[1px] active:translate-y-[1px] active:shadow-sm"
          aria-label={isPlaying ? "暂停" : "播放"}
        >
          {isPlaying ? <Pause size={16} weight="fill" /> : <Play size={16} weight="fill" />}
        </button>

        <div className="flex items-center gap-2 border-2 border-ink bg-paper-raised px-3 py-2 shadow-sm">
          <span className="font-mono text-sm font-bold" style={{ color: accentColor }}>
            {String(index + 1).padStart(2, "0")}
          </span>
          <span className="text-ink/40">/</span>
          <span className="font-mono text-sm text-ink-muted">
            {String(total).padStart(2, "0")}
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          {scenes.map((_, i) => (
            <button
              key={i}
              type="button"
              onClick={() => {
                clearTimer();
                setIndex(i);
                setIsPlaying(false);
              }}
              className={`h-2.5 w-2.5 border border-ink transition-colors ${
                i === index ? "bg-ink" : i < index ? "bg-ink/40" : "bg-transparent"
              }`}
              aria-label={`第 ${i + 1} 段`}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
