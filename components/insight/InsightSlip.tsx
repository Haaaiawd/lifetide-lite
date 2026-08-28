"use client";

import { useState, useEffect } from "react";
import { motion, useReducedMotion, AnimatePresence } from "motion/react";
import { Check, X } from "@phosphor-icons/react";
import type { InsightView } from "@/lib/working-memory/types";

export type InsightSlipProps = {
  insight: InsightView;
  onContinue: (feedback: { accuracy: "accurate" | "partial" | "inaccurate"; note: string; direction: string }) => void | Promise<void>;
};

type Accuracy = "accurate" | "partial" | "inaccurate" | null;

const accuracyLabels: Record<string, string> = {
  accurate: "准确",
  partial: "部分准确",
  inaccurate: "不准确",
};

const easeOutQuart: [number, number, number, number] = [0.16, 1, 0.3, 1];

export function InsightSlip({ insight, onContinue }: InsightSlipProps) {
  const reduce = useReducedMotion();
  const [accuracy, setAccuracy] = useState<Accuracy>(null);
  const [note, setNote] = useState("");
  const [direction, setDirection] = useState("");
  const [revealIndex, setRevealIndex] = useState(0);

  // progressive reveal of the three segments
  const segments = [
    {
      label: "你告诉我的",
      content: (
        <div className="space-y-2">
          {insight.facts.map((fact, i) => (
            <p key={i} className="font-serif text-xl leading-snug md:text-2xl">
              {fact}
            </p>
          ))}
          <ul className="mt-2 flex flex-wrap gap-2 text-xs text-ink-muted">
            {insight.evidence.map((ev, i) => (
              <li key={i} className="border border-ink px-1.5 py-0.5">
                来源：{ev}
              </li>
            ))}
          </ul>
        </div>
      ),
    },
    {
      label: "我目前的理解",
      content: (
        <p className="font-serif text-2xl leading-snug md:text-3xl">
          {insight.interpretation}
        </p>
      ),
    },
    {
      label: "还不确定",
      content: (
        <p className="text-lg leading-relaxed text-ink-muted">
          {insight.uncertainty}
        </p>
      ),
    },
  ];

  useEffect(() => {
    if (reduce) {
      setRevealIndex(segments.length);
    }
  }, [reduce, segments.length]);

  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28 }}
      className="border-2 border-ink bg-paper-raised p-5 shadow-md md:p-6"
    >
      <div className="mb-4 flex items-center gap-2">
        <span className="font-mono text-sm text-cobalt">WAVE {insight.wave}</span>
        <span className="text-sm text-ink-muted">即时理解</span>
      </div>

      <div className="space-y-5">
        {segments.map((segment, i) => (
          <motion.div
            key={segment.label}
            initial={reduce ? false : { opacity: 0, y: 8 }}
            animate={
              revealIndex >= i
                ? { opacity: 1, y: 0 }
                : reduce
                  ? { opacity: 1, y: 0 }
                  : { opacity: 0, y: 8 }
            }
            transition={{
              delay: i * 0.08,
              duration: 0.22,
              ease: easeOutQuart,
            }}
            className="border-l-4 border-cobalt pl-4"
            onAnimationComplete={() => {
              if (i === revealIndex && !reduce) {
                setTimeout(() => setRevealIndex((r) => Math.min(r + 1, segments.length)), 240);
              }
            }}
          >
            <div className="mb-1 text-xs font-medium uppercase tracking-wide text-ink-muted">
              {segment.label}
            </div>
            {segment.content}
          </motion.div>
        ))}

        <AnimatePresence>
          {revealIndex >= segments.length && (
            <motion.div
              initial={reduce ? false : { opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.25 }}
              className="overflow-hidden"
            >
              <div className="border-t-2 border-ink pt-4">
                <p className="mb-3 text-base">这条理解对你来说有多像？</p>
                <div className="flex flex-wrap gap-2">
                  {(["accurate", "partial", "inaccurate"] as const).map((key) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setAccuracy(key)}
                      className={`
                        border-2 border-ink px-4 py-2 text-sm font-medium shadow-sm transition-transform
                        focus:outline-none focus-visible:ring-2 focus-visible:ring-ink focus-visible:ring-offset-2 focus-visible:ring-offset-paper
                        active:translate-x-[2px] active:translate-y-[2px] active:shadow-sm
                        ${
                          accuracy === key
                            ? "bg-cobalt text-white"
                            : "bg-paper-raised text-ink hover:shadow-md"
                        }
                      `}
                    >
                      {accuracyLabels[key]}
                    </button>
                  ))}
                </div>

                <div className="mt-4 space-y-3">
                  <label htmlFor="insight-note" className="block text-sm text-ink-muted">
                    哪里需要改？（可选）
                  </label>
                  <textarea
                    id="insight-note"
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    className="w-full border-2 border-ink bg-paper p-3 text-base shadow-inner focus:outline-none focus-visible:ring-2 focus-visible:ring-ink focus-visible:ring-offset-2 focus-visible:ring-offset-paper"
                    rows={2}
                  />
                </div>

                <div className="mt-4 space-y-3">
                  <label htmlFor="continue-direction" className="block text-sm text-ink-muted">
                    想沿哪里继续？（可选）
                  </label>
                  <input
                    id="continue-direction"
                    value={direction}
                    onChange={(e) => setDirection(e.target.value)}
                    placeholder="例如：先确认我对收入的底线"
                    className="w-full border-2 border-ink bg-paper p-3 text-base shadow-inner focus:outline-none focus-visible:ring-2 focus-visible:ring-ink focus-visible:ring-offset-2 focus-visible:ring-offset-paper"
                  />
                </div>

                <button
                  type="button"
                  disabled={!accuracy}
                  onClick={() =>
                    onContinue({
                      accuracy: accuracy!,
                      note,
                      direction,
                    })
                  }
                  className={`
                    mt-5 inline-flex w-full items-center justify-center gap-2 border-2 border-ink px-6 py-4 text-lg font-medium shadow-md
                    transition-transform active:translate-x-[2px] active:translate-y-[2px] active:shadow-sm
                    ${
                      accuracy
                        ? "bg-cobalt text-white hover:shadow-md"
                        : "bg-paper-raised text-ink-muted cursor-not-allowed"
                    }
                  `}
                >
                  {accuracy === "inaccurate" ? (
                    <>
                      <X size={20} weight="bold" />
                      撤回并继续
                    </>
                  ) : (
                    <>
                      <Check size={20} weight="bold" />
                      确认并继续
                    </>
                  )}
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {revealIndex < segments.length && !reduce && (
        <div className="sr-only" aria-live="polite">
          正在整理理解，共 {segments.length} 段。
        </div>
      )}
    </motion.div>
  );
}
