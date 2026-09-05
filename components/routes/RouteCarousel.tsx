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
    label: "靛蓝",
  },
  {
    accent: "var(--amber)",
    accentSoft: "var(--amber-soft)",
    label: "赭石",
  },
  {
    accent: "var(--teal)",
    accentSoft: "var(--teal-soft)",
    label: "青绿",
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
          className="border-2 border-ink bg-paper-raised/80 p-5 shadow-md backdrop-blur-sm md:p-6"
        >
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
        </motion.section>
      )}

      {framing && (
        <p className="text-center text-sm leading-relaxed text-ink-muted md:text-base">
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
              return (
                <div key={route.id} className="w-full flex-shrink-0 px-1 md:px-6">
                  <article
                    className="mx-auto flex min-h-[420px] max-w-2xl flex-col border-2 border-ink bg-paper-raised/80 p-5 shadow-md backdrop-blur-sm md:p-8"
                    style={{
                      borderTopWidth: "4px",
                      borderTopColor: theme.accent,
                    }}
                  >
                    <div className="mb-4 flex items-start justify-between gap-3">
                      <div className="flex flex-wrap items-baseline gap-2">
                        <span
                          className="font-mono text-4xl font-bold leading-none"
                          style={{ color: theme.accent }}
                        >
                          {route.number}
                        </span>
                        <h3 className="font-serif text-xl leading-tight md:text-2xl">
                          {route.title}
                        </h3>
                      </div>
                      <span
                        className="shrink-0 rounded-sm border px-2 py-0.5 text-xs font-medium uppercase tracking-wide"
                        style={{
                          color: theme.accent,
                          borderColor: theme.accent,
                          backgroundColor: theme.accentSoft,
                        }}
                      >
                        {theme.label}
                      </span>
                    </div>

                    <p className="mb-5 font-serif text-base italic leading-snug text-ink md:text-lg">
                      {route.coreExperience}
                    </p>

                    <div
                      className="mb-6 flex flex-col gap-3 border-l-2 pl-4"
                      style={{ borderColor: theme.accent }}
                    >
                      <div>
                        <span
                          className="text-xs font-medium uppercase tracking-wide"
                          style={{ color: theme.accent }}
                        >
                          第一年
                        </span>
                        <p className="text-sm leading-snug text-ink-muted">
                          {route.year1}
                        </p>
                      </div>
                      <div>
                        <span
                          className="text-xs font-medium uppercase tracking-wide"
                          style={{ color: theme.accent }}
                        >
                          第二年
                        </span>
                        <p className="text-sm leading-snug text-ink-muted">
                          {route.year2}
                        </p>
                      </div>
                      <div>
                        <span
                          className="text-xs font-medium uppercase tracking-wide"
                          style={{ color: theme.accent }}
                        >
                          第三年
                        </span>
                        <p className="text-sm leading-snug text-ink-muted">
                          {route.year3}
                        </p>
                      </div>
                    </div>

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
                      <span className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-ink bg-paper-raised shadow-sm">
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
