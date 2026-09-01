"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion, useReducedMotion } from "motion/react";
import { PortraitCard } from "@/components/portrait/PortraitCard";
import { RouteCarousel } from "@/components/routes/RouteCarousel";
import { PixelIcon } from "@/components/art/PixelIcon";
import type { PersonaPortrait } from "@/lib/portrait/types";
import type { Route } from "@/lib/fixtures";
import { toRouteView } from "@/lib/plans/route-view";
import type { ParallelLife } from "@/lib/working-memory/types";

type AuthUser = { id: string; email: string };

export default function AccountPage() {
  const router = useRouter();
  const reduce = useReducedMotion();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [portrait, setPortrait] = useState<PersonaPortrait | null>(null);
  const [routes, setRoutes] = useState<Route[] | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        // Check auth
        const meRes = await fetch("/api/auth/me");
        const meData = await meRes.json();
        if (!meData.user) {
          router.push("/login");
          return;
        }
        if (cancelled) return;
        setUser(meData.user);

        // Load portrait and routes in parallel
        const [portraitRes, finalRes] = await Promise.all([
          fetch("/api/portrait"),
          fetch("/api/final"),
        ]);

        if (cancelled) return;

        if (portraitRes.ok) {
          const portraitData = await portraitRes.json();
          if (portraitData.portrait) {
            setPortrait(portraitData.portrait as PersonaPortrait);
          }
        }

        if (finalRes.ok) {
          const finalData = await finalRes.json();
          // GET /api/final returns the uiPlan directly (with .lives array)
          if (finalData.lives) {
            const lives = finalData.lives as ParallelLife[];
            setRoutes(lives.map((life, i) => toRouteView(life, i)));
          }
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [router]);

  if (loading) {
    return (
      <div className="flex min-h-[60dvh] items-center justify-center">
        <div className="flex items-center gap-2 text-ink-muted">
          <span className="inline-flex h-6 w-6 items-center justify-center border-2 border-ink bg-paper-raised shadow-sm">
            <PixelIcon name="sparkle" size={12} className="text-cobalt" />
          </span>
          <span className="text-sm">加载中...</span>
        </div>
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className="mx-auto max-w-2xl space-y-8 py-6">
      {/* Header */}
      <motion.div
        initial={reduce ? false : { opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
      >
        <div className="border-2 border-ink bg-paper-raised shadow-md">
          <div className="flex items-center justify-between border-b-2 border-ink bg-cobalt-soft px-4 py-2">
            <div className="flex items-center gap-2">
              <span className="inline-flex h-6 w-6 items-center justify-center border-2 border-ink bg-paper-raised shadow-sm">
                <PixelIcon name="sparkle" size={12} className="text-cobalt" />
              </span>
              <span className="font-serif text-sm font-medium tracking-wide">个人中心</span>
            </div>
            <span className="text-[10px] text-ink-muted">{user.email}</span>
          </div>
          <div className="p-4">
            <button
              type="button"
              onClick={() => router.push("/play")}
              className="border-2 border-ink bg-cobalt px-4 py-2 text-sm font-medium text-white shadow-md transition-transform active:translate-x-[2px] active:translate-y-[2px] active:shadow-sm"
            >
              开始新的试运行
            </button>
          </div>
        </div>
      </motion.div>

      {/* Portrait section */}
      <section>
        <h2 className="mb-3 font-serif text-lg font-medium">人格画像</h2>
        {portrait ? (
          <PortraitCard portrait={portrait} />
        ) : (
          <div className="border-2 border-dashed border-ink/30 bg-paper-raised p-8 text-center">
            <p className="text-sm text-ink-muted">
              还没有生成人格画像。
            </p>
            <button
              type="button"
              onClick={() => router.push("/play")}
              className="mt-3 border-2 border-ink bg-cobalt px-4 py-2 text-sm font-medium text-white shadow-md transition-transform active:translate-x-[2px] active:translate-y-[2px] active:shadow-sm"
            >
              去生成
            </button>
          </div>
        )}
      </section>

      {/* Routes section */}
      <section>
        <h2 className="mb-3 font-serif text-lg font-medium">奥德赛计划</h2>
        {routes && routes.length > 0 ? (
          <RouteCarousel routes={routes} />
        ) : (
          <div className="border-2 border-dashed border-ink/30 bg-paper-raised p-8 text-center">
            <p className="text-sm text-ink-muted">
              还没有生成三条路线。
            </p>
            <button
              type="button"
              onClick={() => router.push("/play")}
              className="mt-3 border-2 border-ink bg-cobalt px-4 py-2 text-sm font-medium text-white shadow-md transition-transform active:translate-x-[2px] active:translate-y-[2px] active:shadow-sm"
            >
              去生成
            </button>
          </div>
        )}
      </section>
    </div>
  );
}
