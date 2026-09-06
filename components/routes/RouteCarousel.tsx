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
    tape: "rgba(36, 87, 230, 0.22)",
    rot: -1.2,
  },
  {
    accent: "var(--amber)",
    tape: "rgba(201, 123, 47, 0.22)",
    rot: 0.8,
  },
  {
    accent: "var(--teal)",
    tape: "rgba(42, 138, 138, 0.22)",
    rot: -0.6,
  },
] as const;

const SWIPE_THRESHOLD = 40;

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

export function RouteCarousel({ routes, framing, onNavigate }: RouteCarouselProps) {
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
                    className="relative mx-auto flex min-h-[380px] max-w-2xl flex-col bg-paper-raised p-6 md:min-h-[420px] md:p-10"
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
                      </div>
                    </div>

                    <p className="mb-8 max-w-xl font-serif text-lg italic leading-relaxed text-ink md:text-xl">
                      “{route.coreExperience}”
                    </p>

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
