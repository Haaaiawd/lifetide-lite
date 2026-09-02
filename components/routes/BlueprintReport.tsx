"use client";

import { useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { CaretDown, CaretUp } from "@phosphor-icons/react";
import type { FinalPlan } from "@/lib/working-memory/types";

export type BlueprintReportProps = {
  plan: FinalPlan;
};

export function BlueprintReport({ plan }: BlueprintReportProps) {
  const reduce = useReducedMotion();
  const [expanded, setExpanded] = useState(false);
  const { blueprint, framing, shared_values, real_tradeoff, open_questions } = plan;

  return (
    <div className="border-2 border-ink bg-paper-raised shadow-md">
      {/* Header — always visible */}
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        className="flex w-full items-center justify-between border-b-2 border-ink bg-cobalt-soft px-4 py-3 text-left"
      >
        <div className="flex items-center gap-2">
          <span className="font-serif text-sm font-medium tracking-wide">
            完整报告
          </span>
          <span className="text-xs text-ink-muted">
            当前坐标 · 共同价值 · 真实取舍
          </span>
        </div>
        {expanded ? <CaretUp size={16} /> : <CaretDown size={16} />}
      </button>

      {/* Framing — always visible */}
      <div className="px-4 py-3">
        <p className="text-sm leading-relaxed text-ink-muted">{framing}</p>
      </div>

      {/* Expanded content */}
      {expanded && (
        <motion.div
          initial={reduce ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: reduce ? 0 : 0.2 }}
          className="flex flex-col gap-5 border-t-2 border-ink/20 px-4 py-4"
        >
          {/* Current coordinate */}
          <section>
            <h3 className="mb-2 font-serif text-sm font-medium text-ink">
              此刻你站在哪里
            </h3>
            <p className="text-sm leading-relaxed text-ink">
              {blueprint.current_coordinate}
            </p>
          </section>

          {/* Key tensions */}
          {blueprint.key_tensions.length > 0 && (
            <section>
              <h3 className="mb-2 font-serif text-sm font-medium text-ink">
                你正在两难的事
              </h3>
              <ul className="flex flex-col gap-2">
                {blueprint.key_tensions.map((tension, i) => (
                  <li key={i} className="flex gap-2 text-sm leading-relaxed text-ink-muted">
                    <span className="text-ink-muted">·</span>
                    <span>{tension}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* Recurring elements */}
          {blueprint.recurring_elements.length > 0 && (
            <section>
              <h3 className="mb-2 font-serif text-sm font-medium text-ink">
                换一条路，也想保留的日常
              </h3>
              <ul className="flex flex-col gap-2">
                {blueprint.recurring_elements.map((el, i) => (
                  <li key={i} className="flex gap-2 text-sm leading-relaxed text-ink-muted">
                    <span className="text-ink-muted">·</span>
                    <span>{el}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* Shared values */}
          {shared_values.length > 0 && (
            <section>
              <h3 className="mb-2 font-serif text-sm font-medium text-ink">
                三条路都在意的东西
              </h3>
              <ul className="flex flex-col gap-2">
                {shared_values.map((v, i) => (
                  <li key={i} className="flex gap-2 text-sm leading-relaxed text-ink-muted">
                    <span className="text-ink-muted">·</span>
                    <span>{v}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* Real tradeoff */}
          <section>
            <h3 className="mb-2 font-serif text-sm font-medium text-ink">
              最关键的取舍
            </h3>
            <p className="text-sm leading-relaxed text-ink">{real_tradeoff}</p>
          </section>

          {/* Open questions */}
          {open_questions.length > 0 && (
            <section>
              <h3 className="mb-2 font-serif text-sm font-medium text-ink">
                还需要弄清楚的事
              </h3>
              <ul className="flex flex-col gap-2">
                {open_questions.map((q, i) => (
                  <li key={i} className="flex gap-2 text-sm leading-relaxed text-ink-muted">
                    <span>?</span>
                    <span>{q}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </motion.div>
      )}
    </div>
  );
}
