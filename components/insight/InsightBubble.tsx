"use client";

import { useState } from "react";
import { motion, AnimatePresence, useReducedMotion } from "motion/react";
import { Check, X, PencilSimple } from "@phosphor-icons/react";
import type { ImmediateInsight } from "@/lib/working-memory/types";

export type InsightFeedback = {
  accuracy: "accurate" | "partial" | "inaccurate";
  note: string;
  direction: string;
};

export type InsightBubbleProps = {
  insight: ImmediateInsight;
  onContinue: (feedback: InsightFeedback) => void;
};

const accuracyMap: Record<string, InsightFeedback["accuracy"]> = {
  准确: "accurate",
  部分准确: "partial",
  不准确: "inaccurate",
};

export function InsightBubble({ insight, onContinue }: InsightBubbleProps) {
  const reduce = useReducedMotion();
  const [openForm, setOpenForm] = useState(false);
  const [note, setNote] = useState("");

  const handleQuick = (key: InsightFeedback["accuracy"]) => {
    onContinue({ accuracy: key, note: "", direction: "" });
  };

  const handleSubmitNote = () => {
    onContinue({ accuracy: openForm ? "partial" : "partial", note, direction: "" });
  };

  return (
    <motion.div
      initial={reduce ? false : { opacity: 1, x: 20, y: -20 }}
      animate={{ opacity: 1, x: 0, y: 0 }}
      exit={reduce ? undefined : { opacity: 0, x: 20, y: -20 }}
      transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
      className="fixed top-4 right-4 z-50 w-[min(92vw,22rem)] border-2 border-ink bg-paper-raised p-4 shadow-[3px_3px_0_var(--ink)]"
    >
      <div className="mb-2 flex items-center justify-between">
        <span className="font-mono text-xs text-cobalt">WAVE 1 即时理解</span>
      </div>

      <p className="text-base leading-snug line-clamp-3">
        {insight.interpretation}
      </p>

      <p className="mt-2 text-sm leading-relaxed text-ink-muted line-clamp-2">
        {insight.uncertainty}
      </p>

      <div className="mt-4 flex items-center gap-2">
        <button
          type="button"
          onClick={() => handleQuick("accurate")}
          className="flex flex-1 items-center justify-center gap-1 border-2 border-ink bg-cobalt px-3 py-2 text-sm font-medium text-white shadow-sm transition-transform active:translate-x-[2px] active:translate-y-[2px] active:shadow-none"
        >
          <Check size={16} weight="bold" />
          继续
        </button>
        <button
          type="button"
          onClick={() => setOpenForm((s) => !s)}
          className="flex items-center justify-center gap-1 border-2 border-ink bg-paper px-3 py-2 text-sm font-medium shadow-sm transition-transform active:translate-x-[2px] active:translate-y-[2px] active:shadow-none"
        >
          <PencilSimple size={16} weight="bold" />
          不太像
        </button>
      </div>

      <AnimatePresence>
        {openForm && (
          <motion.div
            initial={reduce ? false : { opacity: 1, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={reduce ? undefined : { opacity: 1, height: 0 }}
            className="overflow-hidden"
          >
            <div className="mt-3 border-t-2 border-ink pt-3">
              <label htmlFor="insight-note" className="block text-xs text-ink-muted">
                哪里不太对？（可选）
              </label>
              <textarea
                id="insight-note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={2}
                className="mt-1 w-full border-2 border-ink bg-paper p-2 text-sm shadow-inner focus:outline-none focus-visible:ring-2 focus-visible:ring-cobalt"
                placeholder="一句话也行"
              />
              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  onClick={handleSubmitNote}
                  className="flex-1 border-2 border-ink bg-paper-raised px-3 py-2 text-sm shadow-sm transition-transform active:translate-x-[2px] active:translate-y-[2px] active:shadow-none"
                >
                  提交并继续
                </button>
                <button
                  type="button"
                  onClick={() => handleQuick("inaccurate")}
                  className="flex items-center justify-center gap-1 border-2 border-ink bg-paper-raised px-3 py-2 text-sm shadow-sm transition-transform active:translate-x-[2px] active:translate-y-[2px] active:shadow-none"
                >
                  <X size={16} weight="bold" />
                  撤回
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
