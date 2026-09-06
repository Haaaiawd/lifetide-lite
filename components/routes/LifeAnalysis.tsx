"use client";

import { useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { CaretDown, CaretUp } from "@phosphor-icons/react";
import type { Route } from "@/lib/fixtures";

export type LifeAnalysisProps = {
  route: Route;
  accentColor: string;
};

export function LifeAnalysis({ route, accentColor }: LifeAnalysisProps) {
  const reduce = useReducedMotion();
  const [showPrototype, setShowPrototype] = useState(false);

  return (
    <div className="flex flex-col gap-6">
      {/* 三年走向 */}
      <section>
        <h3 className="mb-3 font-serif text-base font-medium" style={{ color: accentColor }}>
          三年走向
        </h3>
        <div className="flex flex-col gap-3 border-l-2 pl-4" style={{ borderColor: accentColor }}>
          <div>
            <span className="font-mono text-xs text-ink-muted">第一年</span>
            <p className="text-sm leading-relaxed text-ink">{route.year1}</p>
          </div>
          <div>
            <span className="font-mono text-xs text-ink-muted">第二年</span>
            <p className="text-sm leading-relaxed text-ink">{route.year2}</p>
          </div>
          <div>
            <span className="font-mono text-xs text-ink-muted">第三年</span>
            <p className="text-sm leading-relaxed text-ink">{route.year3}</p>
          </div>
        </div>
      </section>

      {/* 吸引力 / 代价 */}
      <section className="grid gap-5 md:grid-cols-2">
        <div className="border-2 border-ink bg-paper-raised p-4 shadow-sm">
          <h3 className="mb-3 font-serif text-sm font-medium" style={{ color: accentColor }}>
            这条路让人期待的是什么
          </h3>
          <ul className="flex flex-col gap-2 text-sm leading-relaxed text-ink">
            {route.attractions.map((a, i) => (
              <li key={i} className="flex gap-2">
                <span style={{ color: accentColor }}>·</span>
                <span>{a}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="border-2 border-ink bg-paper-raised p-4 shadow-sm">
          <h3 className="mb-3 font-serif text-sm font-medium text-ink-muted">
            走这条路会失去什么
          </h3>
          <ul className="flex flex-col gap-2 text-sm leading-relaxed text-ink-muted">
            {route.costsAndTradeoffs.map((c, i) => (
              <li key={i} className="flex gap-2">
                <span className="text-ink-muted">·</span>
                <span>{c}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* 还有些不确定的地方 */}
      <section>
        <h3 className="mb-2 font-serif text-sm font-medium text-ink-muted">
          还有些不确定的地方
        </h3>
        <ul className="flex flex-col gap-1.5 text-sm leading-relaxed text-ink-muted">
          {route.unknowns.map((u, i) => (
            <li key={i} className="flex gap-2">
              <span>?</span>
              <span>{u}</span>
            </li>
          ))}
        </ul>
      </section>

      {/* 这些判断从哪里来 */}
      <section>
        <h3 className="mb-2 font-serif text-sm font-medium text-ink-muted">
          这些判断从哪里来
        </h3>
        <div className="flex flex-wrap gap-2">
          {route.evidenceFor.map((ev, i) => (
            <span
              key={i}
              className="border border-ink px-2 py-1 text-xs text-ink-muted"
              title={ev.supports}
            >
              {ev.supports.slice(0, 24)}
              {ev.supports.length > 24 ? "…" : ""}
            </span>
          ))}
        </div>
      </section>

      {/* 当前假设 */}
      {route.assumptions.length > 0 && (
        <section>
          <h3 className="mb-2 font-serif text-sm font-medium text-ink-muted">
            我们暂时这样假设
          </h3>
          <ul className="flex flex-col gap-1.5 text-sm leading-relaxed text-ink-muted">
            {route.assumptions.map((a, i) => (
              <li key={i} className="flex gap-2">
                <span>假设：</span>
                <span>{a}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* 需要留意的风险 */}
      <section>
        <h3 className="mb-2 font-serif text-sm font-medium text-ink-muted">
          需要留意的风险
        </h3>
        <ul className="flex flex-col gap-1.5 text-sm leading-relaxed text-ink-muted">
          {route.risks.map((r, i) => (
            <li key={i} className="flex gap-2">
              <span>!</span>
              <span>{r}</span>
            </li>
          ))}
        </ul>
      </section>

      {/* 三天试玩 */}
      <section className="border-2 border-ink bg-paper-raised p-4 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="font-serif text-sm font-medium" style={{ color: accentColor }}>
              三天试玩
            </h3>
            <p className="mt-1 text-sm leading-relaxed text-ink">{route.prototype.hypothesis}</p>
          </div>
        </div>

        {!showPrototype && (
          <button
            type="button"
            onClick={() => setShowPrototype(true)}
            className="mt-3 flex items-center gap-1 text-sm font-medium transition-colors"
            style={{ color: accentColor }}
          >
            <CaretDown size={16} />
            查看三天计划
          </button>
        )}

        {showPrototype && (
          <motion.div
            initial={reduce ? false : { opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: reduce ? 0 : 0.2 }}
            className="mt-4 flex flex-col gap-3 border-t-2 border-ink/20 pt-4"
          >
            <div>
              <h4 className="text-xs font-medium text-ink-muted">今天最小动作</h4>
              <p className="mt-1 text-sm leading-relaxed">{route.prototype.todayAction}</p>
            </div>
            <div>
              <h4 className="text-xs font-medium text-ink-muted">观察什么</h4>
              <p className="mt-1 text-sm leading-relaxed">{route.prototype.whatToObserve}</p>
            </div>
            <div>
              <h4 className="text-xs font-medium text-ink-muted">三天计划</h4>
              <ol className="mt-1 flex flex-col gap-2 text-sm leading-relaxed">
                <li className="flex gap-2">
                  <span className="font-mono text-xs text-ink-muted">D1</span>
                  <span>{route.prototype.day1}</span>
                </li>
                <li className="flex gap-2">
                  <span className="font-mono text-xs text-ink-muted">D2</span>
                  <span>{route.prototype.day2}</span>
                </li>
                <li className="flex gap-2">
                  <span className="font-mono text-xs text-ink-muted">D3</span>
                  <span>{route.prototype.day3}</span>
                </li>
              </ol>
            </div>
            <div className="grid gap-2 text-sm leading-relaxed md:grid-cols-2">
              <p><span className="text-ink-muted">时间上限：</span>{route.prototype.timeCeilingHours} 小时</p>
              <p><span className="text-ink-muted">金钱上限：</span>{route.prototype.moneyCeiling}</p>
            </div>
            <p className="text-sm leading-relaxed"><span className="text-ink-muted">可逆性：</span>{route.prototype.reversibleBecause}</p>
            <p className="text-sm leading-relaxed"><span className="text-ink-muted">继续信号：</span>{route.prototype.continueSignal}</p>
            <p className="text-sm leading-relaxed"><span className="text-ink-muted">暂停 / 退出：</span>{route.prototype.pauseOrExitNote}</p>
            <p className="text-sm leading-relaxed"><span className="text-ink-muted">安全边界：</span>{route.prototype.safetyCheck}</p>

            <button
              type="button"
              onClick={() => setShowPrototype(false)}
              className="mt-2 flex items-center gap-1 text-sm font-medium transition-colors"
              style={{ color: accentColor }}
            >
              <CaretUp size={16} />
              收起
            </button>
          </motion.div>
        )}
      </section>
    </div>
  );
}
