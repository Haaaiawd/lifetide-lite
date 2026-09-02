"use client";

import { motion, useReducedMotion } from "motion/react";
import { CaretRight } from "@phosphor-icons/react";
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

export function RouteCarousel({ routes, framing, blueprint, onNavigate }: RouteCarouselProps) {
  const reduce = useReducedMotion();

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-4 py-8 md:py-12">
      {blueprint && (
        <motion.section
          initial={reduce ? false : { opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="border-2 border-ink bg-paper-raised p-5 shadow-md md:p-6"
        >
          <h2 className="mb-3 font-serif text-lg md:text-xl">当前坐标</h2>
          <p className="text-base leading-relaxed text-ink md:text-lg">{blueprint.current_coordinate}</p>
          {blueprint.key_tensions.length > 0 && (
            <div className="mt-4 flex flex-col gap-2">
              <h3 className="text-xs font-medium uppercase tracking-wide text-ink-muted">关键张力</h3>
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
        <p className="text-center text-sm leading-relaxed text-ink-muted md:text-base">{framing}</p>
      )}

      <div className="flex items-center justify-between">
        <h2 className="font-serif text-xl md:text-2xl">三条平行人生</h2>
        <span className="text-sm text-ink-muted">它们地位平等，没有先后</span>
      </div>

      <div className="grid gap-5 md:grid-cols-3">
        {routes.map((route, i) => {
          const theme = ROUTE_THEMES[i % ROUTE_THEMES.length];
          return (
            <motion.button
              key={route.id}
              type="button"
              onClick={() => onNavigate(route.id)}
              initial={reduce ? false : { opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: i * 0.1 }}
              whileHover={reduce ? undefined : { y: -4 }}
              className="group flex flex-col border-2 border-ink bg-paper-raised p-5 text-left shadow-md transition-shadow hover:shadow-lg"
              style={{ borderTopColor: theme.accent, borderTopWidth: "4px" }}
            >
              <div className="mb-3 flex items-baseline gap-3">
                <span
                  className="font-mono text-3xl font-bold"
                  style={{ color: theme.accent }}
                >
                  {route.number}
                </span>
                <h3 className="font-serif text-lg leading-tight">{route.title}</h3>
              </div>

              <p className="mb-4 font-serif text-base italic leading-snug text-ink">
                {route.coreExperience}
              </p>

              <div className="mb-5 flex flex-col gap-2 border-l-2 pl-3" style={{ borderColor: theme.accent }}>
                <p className="text-sm leading-snug text-ink-muted line-clamp-2">{route.year1}</p>
                <p className="text-sm leading-snug text-ink-muted line-clamp-2">{route.year2}</p>
                <p className="text-sm leading-snug text-ink-muted line-clamp-2">{route.year3}</p>
              </div>

              <div
                className="mt-auto flex items-center gap-2 text-sm font-medium transition-colors"
                style={{ color: theme.accent }}
              >
                <span>走进这条人生</span>
                <CaretRight
                  size={16}
                  weight="bold"
                  className="transition-transform group-hover:translate-x-1"
                />
              </div>
            </motion.button>
          );
        })}
      </div>

      <p className="text-center text-sm text-ink-muted">
        选择一条不是为了决定终身，而是为了先试玩三天。
      </p>
    </div>
  );
}
