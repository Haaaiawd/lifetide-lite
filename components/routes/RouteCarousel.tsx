"use client";

import { useRef, useState, useEffect } from "react";
import { motion, useReducedMotion } from "motion/react";
import { CaretLeft, CaretRight } from "@phosphor-icons/react";
import type { Route } from "@/lib/fixtures";
import type { TrialStatus } from "@/lib/working-memory/types";
import { RouteCover } from "./RouteCover";

export type RouteCarouselProps = {
  routes: Route[];
};

export function RouteCarousel({ routes }: RouteCarouselProps) {
  const reduce = useReducedMotion();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [trialStatuses, setTrialStatuses] = useState<Record<string, TrialStatus>>(() =>
    Object.fromEntries(routes.map((r) => [r.id, r.trialStatus ?? "not_started"]))
  );

  useEffect(() => {
    setTrialStatuses((prev) => {
      const next: Record<string, TrialStatus> = {};
      for (const r of routes) {
        next[r.id] = prev[r.id] ?? r.trialStatus ?? "not_started";
      }
      return next;
    });
  }, [routes]);

  const scrollTo = (index: number) => {
    const el = scrollRef.current;
    if (!el) return;
    const child = el.children[index] as HTMLElement | undefined;
    if (!child) return;
    el.scrollTo({
      left: child.offsetLeft - el.offsetLeft,
      behavior: reduce ? "auto" : "smooth",
    });
  };

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    const onScroll = () => {
      const center = el.scrollLeft + el.clientWidth / 2;
      let nearest = 0;
      let min = Infinity;
      Array.from(el.children).forEach((child, i) => {
        const c = child as HTMLElement;
        const childCenter = c.offsetLeft + c.offsetWidth / 2;
        const d = Math.abs(childCenter - center);
        if (d < min) {
          min = d;
          nearest = i;
        }
      });
      setActive(nearest);
    };

    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  const prev = () => scrollTo(Math.max(active - 1, 0));
  const next = () => scrollTo(Math.min(active + 1, routes.length - 1));

  const handleToggle = (route: Route) => {
    setExpandedId((current) => (current === route.id ? null : route.id));
  };

  const handleTrialStatusChange = (routeId: string, status: TrialStatus) => {
    setTrialStatuses((prev) => ({ ...prev, [routeId]: status }));
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="font-serif text-xl md:text-2xl">三条平行人生</h2>
        <div className="flex items-center gap-2" aria-live="polite">
          <span className="font-mono text-cobalt">{active + 1}</span>
          <span className="text-ink-muted">/</span>
          <span className="text-ink-muted">{routes.length}</span>
        </div>
      </div>

      <p className="text-sm text-ink-muted">
        它们地位平等，没有高低或先后之分。选择一条不是为了决定终身，而是为了先试玩三天。
      </p>

      <motion.div
        ref={scrollRef}
        initial={reduce ? false : { opacity: 1, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="-mx-4 flex snap-x snap-mandatory gap-4 overflow-x-auto scroll-smooth px-4 pb-4 md:mx-0 md:grid md:grid-cols-3 md:overflow-visible md:px-0"
      >
        {routes.map((route, i) => (
          <RouteCover
            key={route.id}
            route={route}
            active={i === active}
            expanded={expandedId === route.id}
            trialStatus={trialStatuses[route.id] ?? "not_started"}
            onToggle={() => handleToggle(route)}
            onTrialStatusChange={(status) => handleTrialStatusChange(route.id, status)}
          />
        ))}
      </motion.div>

      <div className="flex items-center justify-between md:hidden">
        <button
          type="button"
          onClick={prev}
          disabled={active === 0}
          className="flex h-12 w-12 items-center justify-center border-2 border-ink bg-paper-raised shadow-sm active:translate-x-[2px] active:translate-y-[2px] active:shadow-sm disabled:opacity-50"
          aria-label="上一条路线"
        >
          <CaretLeft size={24} />
        </button>
        <div className="flex gap-2">
          {routes.map((_, i) => (
            <span
              key={i}
              className={`h-2 w-2 border-2 border-ink ${
                i === active ? "bg-cobalt" : "bg-paper-raised"
              }`}
            />
          ))}
        </div>
        <button
          type="button"
          onClick={next}
          disabled={active === routes.length - 1}
          className="flex h-12 w-12 items-center justify-center border-2 border-ink bg-paper-raised shadow-sm active:translate-x-[2px] active:translate-y-[2px] active:shadow-sm disabled:opacity-50"
          aria-label="下一条路线"
        >
          <CaretRight size={24} />
        </button>
      </div>
    </div>
  );
}
