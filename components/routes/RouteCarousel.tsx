"use client";

import { useCallback, useRef, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { CaretLeft, CaretRight } from "@phosphor-icons/react";
import type { Route } from "@/lib/fixtures";

export type RouteCarouselProps = {
  routes: Route[];
  framing?: string;
  blueprint?: {
    current_coordinate: string;
    key_tensions: string[];
    recurring_elements: string[];
  };
  onNavigate: (routeId: string) => void;
};

const ROUTE_THEMES = [
  {
    accent: "var(--cobalt)",
    accentSoft: "var(--cobalt-soft)",
    tape: "rgba(36, 87, 230, 0.22)",
    label: "靛蓝",
    rot: -1.2,
  },
  {
    accent: "var(--amber)",
    accentSoft: "var(--amber-soft)",
    tape: "rgba(201, 123, 47, 0.22)",
    label: "赭石",
    rot: 0.8,
  },
  {
    accent: "var(--teal)",
    accentSoft: "var(--teal-soft)",
    tape: "rgba(42, 138, 138, 0.22)",
    label: "青绿",
    rot: -0.6,
  },
] as const;

const SWIPE_THRESHOLD = 40;

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

export function RouteCarousel({ routes, framing, blueprint, onNavigate }: RouteCarouselProps) {
  const reduce = useReducedMotion();
  const [index, setIndex] = useState(0);
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);

  const canPrev = index > 0;
  const canNext = index < routes.length - 1;

  const go = useCallback(
    (nextIndex: number) => {
      setIndex(clamp(nextIndex, 0, routes.length - 1));
    },
    [routes.length]
  );

  const prev = useCallback(() => {
    if (canPrev) go(index - 1);
  }, [canPrev, go, index]);

  const next = useCallback(() => {
    if (canNext) go(index + 1);
  }, [canNext, go, index]);

  const handleTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    const touch = e.touches[0];
    touchStartRef.current = { x: touch.clientX, y: touch.clientY };
  };

  const handleTouchEnd = (e: React.TouchEvent<HTMLDivElement>) => {
    const start = touchStartRef.current;
    if (!start) return;

    const touch = e.changedTouches[0];
    const dx = touch.clientX - start.x;
    const dy = touch.clientY - start.y;
    touchStartRef.current = null;

    if (
      (e.target as HTMLElement).closest("button, a, [role='button']") ||
      Math.abs(dx) < SWIPE_THRESHOLD ||
      Math.abs(dx) <= Math.abs(dy)
    ) {
      return;
    }

    if (dx < 0) next();
    else prev();
  };

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-8 md:gap-8 md:py-12">
      {blueprint && (
        <motion.section
          initial={reduce ? false : { opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="relative mx-auto w-full max-w-2xl bg-paper-raised/90 p-6 shadow-[4px_4px_0_rgba(23,23,23,0.08)] md:p-8"
          style={{
            backgroundImage:
              "radial-gradient(circle at 20% 30%, rgba(36,87,230,0.04) 0%, transparent 40%), radial-gradient(circle at 80% 70%, rgba(201,123,47,0.04) 0%, transparent 40%)",
          }}
        >
          <div
            className="absolute -left-2 top-6 h-10 w-5 -rotate-6 bg-amber-soft/70 opacity-60"
            style={{ boxShadow: "inset 0 0 0 1px rgba(23,23,23,0.08)" }}
          />
          <h2 className="mb-3 font-serif text-lg md:text-xl">当前坐标</h2>
          <p className="text-base leading-relaxed text-ink md:text-lg">
            {blueprint.current_coordinate}
          </p>
          {blueprint.key_tensions.length > 0 && (
            <div className="mt-4 flex flex-col gap-2">
              <h3 className="text-xs font-medium uppercase tracking-wide text-ink-muted">
                关键张力
              </h3>
              {blueprint.key_tensions.map((tension, i) => (
                <p key={i} className="text-sm leading-relaxed text-ink-muted">
                  · {tension}
                </p>
              ))}
            </div>
          )}
          {blueprint.recurring_elements.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {blueprint.recurring_elements.map((el, i) => (
                <span
                  key={i}
                  className="border border-ink/20 bg-paper px-2 py-0.5 text-xs text-ink-muted"
                >
                  {el}
                </span>
              ))}
            </div>
          )}
        </motion.section>
      )}

      {framing && (
        <p className="max-w-2xl self-center text-center text-sm leading-relaxed text-ink-muted md:text-base">
          {framing}
        </p>
      )}

      <div className="flex items-center justify-between">
        <h2 className="font-serif text-xl md:text-2xl">三条平行人生</h2>
        <span className="text-sm text-ink-muted tabular-nums">
          {index + 1} / {routes.length}
        </span>
      </div>

      <div className="relative w-full">
        {canPrev && (
          <button
            type="button"
            aria-label="上一条路线"
            onClick={prev}
            className="absolute left-2 top-1/2 z-10 -translate-y-1/2 rounded-full border-2 border-ink bg-paper-raised/90 p-2 shadow-sm transition-transform hover:scale-105 active:translate-x-[1px] active:translate-y-[1px] active:shadow-sm md:left-4"
          >
            <CaretLeft size={24} weight="bold" className="text-ink" />
          </button>
        )}
        {canNext && (
          <button
            type="button"
            aria-label="下一条路线"
            onClick={next}
            className="absolute right-2 top-1/2 z-10 -translate-y-1/2 rounded-full border-2 border-ink bg-paper-raised/90 p-2 shadow-sm transition-transform hover:scale-105 active:translate-x-[1px] active:translate-y-[1px] active:shadow-sm md:right-4"
          >
            <CaretRight size={24} weight="bold" className="text-ink" />
          </button>
        )}

        <div
          className="overflow-hidden"
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
        >
          <motion.div
            className="flex w-full"
            animate={{ x: `-${index * 100}%` }}
            transition={
              reduce
                ? { duration: 0 }
                : { type: "spring", stiffness: 280, damping: 30 }
            }
          >
            {routes.map((route, i) => {
              const theme = ROUTE_THEMES[i % ROUTE_THEMES.length];
              const rotate = reduce ? 0 : theme.rot;
              return (
                <div key={route.id} className="w-full flex-shrink-0 px-1 md:px-6">
                  <article
                    className="relative mx-auto flex min-h-[520px] max-w-2xl flex-col bg-paper-raised p-5 md:p-8"
                    style={{
                      transform: `rotate(${rotate}deg)`,
                      boxShadow:
                        "6px 8px 0 rgba(91, 70, 57, 0.08), 12px 16px 24px rgba(91, 70, 57, 0.05)",
                      backgroundImage:
                        "repeating-linear-gradient(0deg, transparent, transparent 31px, rgba(23,23,23,0.03) 31px, rgba(23,23,23,0.03) 32px)",
                    }}
                  >
                    {/* Washi-tape top strip */}
                    <div
                      className="absolute -top-3 left-1/2 h-6 w-24 -translate-x-1/2 opacity-70"
                      style={{
                        backgroundColor: theme.tape,
                        transform: `translateX(-50%) rotate(${-theme.rot}deg)`,
                        boxShadow: "inset 0 0 0 1px rgba(23,23,23,0.06)",
                      }}
                    />

                    {/* Header */}
                    <div className="mb-5 flex items-start justify-between gap-3">
                      <div className="flex flex-col gap-1">
                        <div className="flex items-baseline gap-3">
                          <span
                            className="font-mono text-5xl font-bold leading-none"
                            style={{ color: theme.accent }}
                          >
                            {route.number}
                          </span>
                          <h3
                            className="font-serif text-2xl italic leading-tight md:text-3xl"
                            style={{ color: theme.accent }}
                          >
                            {route.title}
                          </h3>
                        </div>
                        <span
                          className="w-fit rounded-sm px-2 py-0.5 text-xs font-medium uppercase tracking-wide"
                          style={{
                            color: theme.accent,
                            backgroundColor: theme.accentSoft,
                          }}
                        >
                          {theme.label}
                        </span>
                      </div>
                    </div>

                    <p className="mb-6 font-serif text-base italic leading-snug text-ink md:text-lg">
                      “{route.coreExperience}”
                    </p>

                    {/* Ordinary day as a torn-note block */}
                    {route.ordinaryDay && (
                      <div
                        className="mb-6 border-l-4 pl-4 pr-2 py-2"
                        style={{
                          borderLeftColor: theme.accent,
                          backgroundColor: theme.accentSoft,
                        }}
                      >
                        <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-ink-muted/70">
                          普通的一天
                        </span>
                        <p className="text-sm leading-snug text-ink/90 md:text-base">
                          {route.ordinaryDay}
                        </p>
                      </div>
                    )}

                    {/* Three-year timeline as pasted snippets */}
                    <div className="mb-6 flex flex-col gap-3">
                      {[
                        { label: "第一年", text: route.year1 },
                        { label: "第二年", text: route.year2 },
                        { label: "第三年", text: route.year3 },
                      ].map((y, yi) => (
                        <div
                          key={yi}
                          className="relative bg-paper p-3 shadow-sm"
                          style={{
                            boxShadow: "2px 3px 0 rgba(23,23,23,0.06)",
                            transform: `rotate(${yi % 2 === 0 ? 0.3 : -0.3}deg)`,
                          }}
                        >
                          <span
                            className="mb-1 block text-xs font-medium uppercase tracking-wide"
                            style={{ color: theme.accent }}
                          >
                            {y.label}
                          </span>
                          <p className="text-sm leading-snug text-ink-muted">
                            {y.text}
                          </p>
                        </div>
                      ))}
                    </div>

                    {/* Attractions / tradeoffs as collage tags */}
                    {(route.attractions.length > 0 || route.costsAndTradeoffs.length > 0) && (
                      <div className="mb-6 flex flex-col gap-3">
                        {route.attractions.length > 0 && (
                          <div className="flex flex-wrap gap-2">
                            {route.attractions.slice(0, 3).map((a, ai) => (
                              <span
                                key={ai}
                                className="border border-ink/10 bg-paper px-2 py-1 text-xs text-ink"
                                style={{ transform: `rotate(${ai % 2 === 0 ? 0.8 : -0.8}deg)` }}
                              >
                                + {a}
                              </span>
                            ))}
                          </div>
                        )}
                        {route.costsAndTradeoffs.length > 0 && (
                          <div className="flex flex-wrap gap-2">
                            {route.costsAndTradeoffs.slice(0, 3).map((c, ci) => (
                              <span
                                key={ci}
                                className="border border-ink/10 bg-paper-raised px-2 py-1 text-xs text-ink-muted"
                                style={{ transform: `rotate(${ci % 2 === 0 ? -0.6 : 0.6}deg)` }}
                              >
                                · {c}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    {/* CTA */}
                    <button
                      type="button"
                      onClick={() => onNavigate(route.id)}
                      className="mt-auto flex w-full items-center justify-between border-t-2 border-ink/10 pt-4 text-left transition-transform active:translate-x-[1px] active:translate-y-[1px]"
                    >
                      <span
                        className="text-sm font-medium"
                        style={{ color: theme.accent }}
                      >
                        走进这条人生
                      </span>
                      <span
                        className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-ink bg-paper-raised shadow-sm"
                        style={{ borderColor: theme.accent }}
                      >
                        <CaretRight
                          size={16}
                          weight="bold"
                          style={{ color: theme.accent }}
                        />
                      </span>
                    </button>
                  </article>
                </div>
              );
            })}
          </motion.div>
        </div>
      </div>

      <p className="text-center text-sm text-ink-muted">
        选择一条不是为了决定终身，而是为了先试玩三天。
      </p>
    </div>
  );
}
