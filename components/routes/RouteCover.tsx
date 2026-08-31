"use client";

import { useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { Pause, Play, X, Check, CaretDown, CaretUp } from "@phosphor-icons/react";
import { PixelIcon } from "@/components/art/PixelIcon";
import type { Route } from "@/lib/fixtures";
import type { TrialStatus } from "@/lib/working-memory/types";

export type RouteCoverProps = {
  route: Route;
  active?: boolean;
  expanded?: boolean;
  trialStatus?: TrialStatus;
  onToggle?: () => void;
  onTrialStatusChange?: (status: TrialStatus) => void;
};

const statusCopy: Record<TrialStatus, { label: string; tone: "neutral" | "cobalt" | "success" }> = {
  not_started: { label: "未开始", tone: "neutral" },
  active: { label: "进行中", tone: "cobalt" },
  paused: { label: "已暂停", tone: "neutral" },
  completed: { label: "已完成", tone: "success" },
  exited: { label: "已退出", tone: "neutral" },
};

function classForTone(tone: "neutral" | "cobalt" | "success") {
  if (tone === "cobalt") return "text-cobalt";
  if (tone === "success") return "text-success";
  return "text-ink-muted";
}

export function RouteCover({
  route,
  active,
  expanded = false,
  trialStatus = "not_started",
  onToggle,
  onTrialStatusChange,
}: RouteCoverProps) {
  const reduce = useReducedMotion();
  const [showFullPrototype, setShowFullPrototype] = useState(trialStatus !== "not_started");

  const isStarted = trialStatus !== "not_started";

  const handleStart = () => {
    setShowFullPrototype(true);
    onTrialStatusChange?.("active");
  };

  const handlePause = () => onTrialStatusChange?.("paused");
  const handleResume = () => onTrialStatusChange?.("active");
  const handleExit = () => onTrialStatusChange?.("exited");
  const handleComplete = () => onTrialStatusChange?.("completed");

  return (
    <article
      className={`
        flex h-full w-[88vw] max-w-[360px] flex-shrink-0 snap-center flex-col
        border-2 border-ink bg-paper-raised p-5 shadow-md transition-shadow
        md:w-full md:max-w-none
        ${active ? "shadow-lg" : "shadow-sm"}
      `}
    >
      <header>
        <div className="flex items-baseline justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="font-mono text-3xl font-bold text-cobalt">{route.number}</span>
            <PixelIcon name="compass" size={20} className="text-cobalt" />
          </div>
          <h2 className="font-serif text-lg">{route.title}</h2>
        </div>
        <p className="mt-2 font-serif text-base italic leading-snug text-ink line-clamp-3">
          {route.coreExperience}
        </p>
      </header>

      <div className="mt-4">
        <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-ink-muted">三年走向</h3>
        <div className="flex flex-col gap-2">
          <div className="flex items-start gap-2">
            <span className="mt-0.5 inline-block h-2 w-2 flex-shrink-0 border-2 border-ink bg-cobalt" />
            <p className="text-sm leading-snug line-clamp-2">{route.year1}</p>
          </div>
          <div className="ml-1 h-4 w-0.5 border-l-2 border-dashed border-ink/30" />
          <div className="flex items-start gap-2">
            <span className="mt-0.5 inline-block h-2 w-2 flex-shrink-0 border-2 border-ink bg-paper" />
            <p className="text-sm leading-snug line-clamp-2">{route.year2}</p>
          </div>
          <div className="ml-1 h-4 w-0.5 border-l-2 border-dashed border-ink/30" />
          <div className="flex items-start gap-2">
            <span className="mt-0.5 inline-block h-2 w-2 flex-shrink-0 border-2 border-ink bg-paper" />
            <p className="text-sm leading-snug line-clamp-2">{route.year3}</p>
          </div>
        </div>
      </div>

      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        className="mt-4 flex w-full items-center justify-between border-2 border-ink bg-paper p-3 text-left text-sm font-medium text-ink shadow-sm transition-transform active:translate-x-[2px] active:translate-y-[2px] active:shadow-sm"
      >
        <span>{expanded ? "收起这条人生" : "展开这条人生"}</span>
        {expanded ? <CaretUp size={18} /> : <CaretDown size={18} />}
      </button>

      {expanded && (
        <motion.div
          initial={reduce ? false : { opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: reduce ? 0 : 0.2 }}
          className="mt-4 flex flex-1 flex-col gap-4"
        >
          <section>
            <h3 className="mb-1 text-xs font-medium uppercase tracking-wide text-ink-muted">普通一天</h3>
            <p className="text-base leading-relaxed text-ink-muted line-clamp-3">{route.ordinaryDay}</p>
          </section>

          <section className="grid gap-3 md:grid-cols-2">
            <div>
              <h3 className="mb-1 text-xs font-medium uppercase tracking-wide text-cobalt">为什么吸引你</h3>
              <ul className="flex flex-col gap-1 text-sm leading-snug">
                {route.attractions.map((a, i) => (
                  <li key={i} className="flex gap-2">
                    <span className="text-cobalt">·</span>
                    <span>{a}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h3 className="mb-1 text-xs font-medium uppercase tracking-wide text-ink-muted">真正要付出的代价</h3>
              <ul className="flex flex-col gap-1 text-sm leading-snug">
                {route.costsAndTradeoffs.map((c, i) => (
                  <li key={i} className="flex gap-2">
                    <span className="text-ink-muted">·</span>
                    <span>{c}</span>
                  </li>
                ))}
              </ul>
            </div>
          </section>

          <section>
            <h3 className="mb-1 text-xs font-medium uppercase tracking-wide text-ink-muted">还不知道的事情</h3>
            <ul className="flex flex-col gap-1 text-sm leading-snug">
              {route.unknowns.map((u, i) => (
                <li key={i} className="flex gap-2">
                  <span className="text-ink-muted">?</span>
                  <span>{u}</span>
                </li>
              ))}
            </ul>
          </section>

          <section>
            <h3 className="mb-1 text-xs font-medium uppercase tracking-wide text-ink-muted">现实依据</h3>
            <ul className="flex flex-wrap gap-2 text-xs text-ink-muted">
              {route.evidenceFor.map((ev, i) => (
                <li key={i} className="border border-ink px-1.5 py-0.5" title={ev.supports}>
                  {ev.supports.slice(0, 20)}
                  {ev.supports.length > 20 ? "…" : ""}
                </li>
              ))}
            </ul>
          </section>

          {route.assumptions.length > 0 && (
            <section>
              <h3 className="mb-1 text-xs font-medium uppercase tracking-wide text-ink-muted">当前假设</h3>
              <ul className="flex flex-col gap-1 text-sm leading-snug text-ink-muted">
                {route.assumptions.map((a, i) => (
                  <li key={i} className="flex gap-2">
                    <span>假设：</span>
                    <span>{a}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section>
            <h3 className="mb-1 text-xs font-medium uppercase tracking-wide text-ink-muted">风险</h3>
            <ul className="flex flex-col gap-1 text-sm leading-snug">
              {route.risks.map((r, i) => (
                <li key={i} className="flex gap-2">
                  <span className="text-ink-muted">!</span>
                  <span>{r}</span>
                </li>
              ))}
            </ul>
          </section>

          <section className="border-2 border-ink bg-paper p-3 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-xs font-medium uppercase tracking-wide text-cobalt">最小原型</h3>
                <p className="mt-1 text-sm leading-snug line-clamp-2">{route.prototype.hypothesis}</p>
              </div>
              <span className={`text-xs font-medium ${classForTone(statusCopy[trialStatus].tone)}`}>
                {statusCopy[trialStatus].label}
              </span>
            </div>

            {showFullPrototype && (
              <div className="mt-3 flex flex-col gap-3 border-t-2 border-ink/20 pt-3">
                <div>
                  <h4 className="text-xs font-medium text-ink-muted">今天最小动作</h4>
                  <p className="text-sm leading-snug">{route.prototype.todayAction}</p>
                </div>
                <div>
                  <h4 className="text-xs font-medium text-ink-muted">观察什么</h4>
                  <p className="text-sm leading-snug">{route.prototype.whatToObserve}</p>
                </div>
                <div>
                  <h4 className="text-xs font-medium text-ink-muted">三天试玩计划</h4>
                  <ol className="mt-1 flex flex-col gap-1 text-sm leading-snug">
                    <li className="flex gap-2"><span className="text-ink-muted">1.</span><span>{route.prototype.day1}</span></li>
                    <li className="flex gap-2"><span className="text-ink-muted">2.</span><span>{route.prototype.day2}</span></li>
                    <li className="flex gap-2"><span className="text-ink-muted">3.</span><span>{route.prototype.day3}</span></li>
                  </ol>
                </div>
                <div className="grid gap-2 text-sm leading-snug md:grid-cols-2">
                  <p><span className="text-ink-muted">时间上限：</span>{route.prototype.timeCeilingHours} 小时</p>
                  <p><span className="text-ink-muted">金钱上限：</span>{route.prototype.moneyCeiling}</p>
                </div>
                <p className="text-sm leading-snug"><span className="text-ink-muted">可逆性：</span>{route.prototype.reversibleBecause}</p>
                <p className="text-sm leading-snug"><span className="text-ink-muted">继续信号：</span>{route.prototype.continueSignal}</p>
                <p className="text-sm leading-snug"><span className="text-ink-muted">暂停 / 退出：</span>{route.prototype.pauseOrExitNote}</p>
                <p className="text-sm leading-snug"><span className="text-ink-muted">安全检查：</span>{route.prototype.safetyCheck}</p>
              </div>
            )}

            <div className="mt-3 flex flex-wrap gap-2">
              {!isStarted && (
                <button
                  type="button"
                  onClick={handleStart}
                  className="flex items-center gap-1 border-2 border-ink bg-cobalt px-4 py-2 text-sm font-medium text-white shadow-sm transition-transform active:translate-x-[2px] active:translate-y-[2px] active:shadow-sm"
                >
                  <Play size={16} weight="fill" />
                  开始试玩
                </button>
              )}

              {isStarted && (
                <>
                  {trialStatus === "active" && (
                    <button
                      type="button"
                      onClick={handlePause}
                      className="flex items-center gap-1 border-2 border-ink bg-paper-raised px-3 py-2 text-sm font-medium text-ink shadow-sm transition-transform active:translate-x-[2px] active:translate-y-[2px] active:shadow-sm"
                    >
                      <Pause size={16} weight="fill" />
                      暂停
                    </button>
                  )}
                  {trialStatus === "paused" && (
                    <button
                      type="button"
                      onClick={handleResume}
                      className="flex items-center gap-1 border-2 border-ink bg-cobalt px-3 py-2 text-sm font-medium text-white shadow-sm transition-transform active:translate-x-[2px] active:translate-y-[2px] active:shadow-sm"
                    >
                      <Play size={16} weight="fill" />
                      继续
                    </button>
                  )}
                  {trialStatus !== "exited" && (
                    <button
                      type="button"
                      onClick={handleExit}
                      className="flex items-center gap-1 border-2 border-ink bg-paper-raised px-3 py-2 text-sm font-medium text-ink shadow-sm transition-transform active:translate-x-[2px] active:translate-y-[2px] active:shadow-sm"
                    >
                      <X size={16} />
                      退出
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={handleComplete}
                    className="flex items-center gap-1 border-2 border-ink bg-paper-raised px-3 py-2 text-sm font-medium text-ink shadow-sm transition-transform active:translate-x-[2px] active:translate-y-[2px] active:shadow-sm"
                  >
                    <Check size={16} weight="bold" />
                    完成
                  </button>
                </>
              )}
            </div>
          </section>
        </motion.div>
      )}
    </article>
  );
}
