"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { motion, useReducedMotion } from "motion/react";
import { ArrowLeft, ArrowRight, BookOpen } from "@phosphor-icons/react";
import { DayProgressAnimation } from "@/components/routes/DayProgressAnimation";
import { ScenePlayer } from "@/components/routes/ScenePlayer";
import { LifeAnalysis } from "@/components/routes/LifeAnalysis";
import { BlueprintReport } from "@/components/routes/BlueprintReport";
import { PixelIcon } from "@/components/art/PixelIcon";
import type { Route } from "@/lib/fixtures";
import type { ParallelLife, FinalPlan } from "@/lib/working-memory/types";
import { toRouteView } from "@/lib/plans/route-view";

const ROUTE_THEMES = [
  { accent: "var(--cobalt)", label: "靛蓝" },
  { accent: "var(--amber)", label: "赭石" },
  { accent: "var(--teal)", label: "青绿" },
] as const;

export default function LifeDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const reduce = useReducedMotion();
  const [route, setRoute] = useState<Route | null>(null);
  const [allRoutes, setAllRoutes] = useState<{ id: string; number: string; title: string }[]>([]);
  const [plan, setPlan] = useState<FinalPlan | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sceneProgress, setSceneProgress] = useState(0);
  const [showReport, setShowReport] = useState(false);
  const [dayFinished, setDayFinished] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/final");
        if (!res.ok) {
          setError("无法加载路线数据");
          return;
        }
        const data = await res.json();
        const lives: ParallelLife[] = data.lives ?? [];
        const idx = lives.findIndex((l) => l.id === params.id);
        if (idx === -1) {
          setError("找不到这条路线");
          return;
        }
        setRoute(toRouteView(lives[idx], idx));
        setAllRoutes(
          lives.map((l, i) => ({
            id: l.id,
            number: i < 9 ? `0${i + 1}` : String(i + 1),
            title: l.title,
          }))
        );
        setPlan(data as FinalPlan);
      } catch {
        setError("加载失败");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [params.id]);

  // Reset state when navigating between routes
  useEffect(() => {
    setSceneProgress(0);
    setShowReport(false);
    setDayFinished(false);
  }, [params.id]);

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

  if (error || !route) {
    return (
      <div className="mx-auto flex max-w-2xl flex-col items-center gap-4 px-4 py-12">
        <p className="text-sm text-ink-muted">{error ?? "未知错误"}</p>
        <button
          type="button"
          onClick={() => router.push("/play")}
          className="border-2 border-ink bg-cobalt px-4 py-2 text-sm font-medium text-white shadow-md"
        >
          返回
        </button>
      </div>
    );
  }

  const themeIdx = parseInt(route.number, 10) - 1;
  const theme = ROUTE_THEMES[themeIdx % ROUTE_THEMES.length];
  const currentIdx = allRoutes.findIndex((r) => r.id === params.id);
  const nextRoute = currentIdx >= 0 && currentIdx < allRoutes.length - 1 ? allRoutes[currentIdx + 1] : null;
  const prevRoute = currentIdx > 0 ? allRoutes[currentIdx - 1] : null;

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-4 py-6 md:py-8">
      {/* Top nav */}
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => router.push("/play")}
          className="flex items-center gap-1 text-sm text-ink-muted transition-colors hover:text-ink"
        >
          <ArrowLeft size={16} />
          返回三条路线
        </button>
        <div className="flex items-center gap-2 text-xs text-ink-muted">
          {allRoutes.map((r, i) => (
            <button
              key={r.id}
              type="button"
              onClick={() => router.push(`/play/life/${r.id}`)}
              className={`flex h-6 w-6 items-center justify-center border-2 font-mono transition-colors ${
                i === currentIdx
                  ? "border-ink bg-ink text-paper"
                  : "border-ink/20 text-ink/40 hover:border-ink/60 hover:text-ink"
              }`}
              aria-label={`路线 ${r.number}`}
            >
              {r.number}
            </button>
          ))}
        </div>
      </div>

      {/* Header */}
      <motion.header
        initial={reduce ? false : { opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="flex flex-col gap-3"
      >
        <div className="flex items-baseline gap-4">
          <span
            className="inline-flex h-12 min-w-[3rem] items-center justify-center border-2 border-ink px-3 font-mono text-2xl font-bold shadow-sm"
            style={{ color: theme.accent }}
          >
            {route.number}
          </span>
          <h1 className="font-serif text-2xl md:text-3xl">{route.title}</h1>
        </div>
        <p
          className="font-serif text-base italic leading-relaxed text-ink md:text-lg"
          style={{ color: "var(--ink)" }}
        >
          {route.coreExperience}
        </p>
      </motion.header>

      {/* Ordinary day card — animation + scene player */}
      <motion.section
        initial={reduce ? false : { opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5, delay: 0.15 }}
        className="flex flex-col gap-4 border-2 border-ink bg-paper-raised p-4 shadow-md md:p-6"
      >
        <div className="flex items-center justify-between">
          <h2 className="font-serif text-base font-medium" style={{ color: theme.accent }}>
            普通的一天
          </h2>
          <span className="text-xs text-ink-muted">
            {route.ordinaryDay.slice(0, 30)}
            {route.ordinaryDay.length > 30 ? "…" : ""}
          </span>
        </div>

        <DayProgressAnimation progress={sceneProgress} accentColor={theme.accent} />

        <ScenePlayer
          scenes={route.dayNarrative.scenes}
          accentColor={theme.accent}
          onProgress={setSceneProgress}
          onComplete={() => setDayFinished(true)}
        />
      </motion.section>

      {/* Report button appears after the first full day loop */}
      {dayFinished && !showReport && (
        <div className="flex justify-center">
          <button
            type="button"
            onClick={() => setShowReport(true)}
            className="group flex items-center gap-2 border-2 border-ink bg-paper-raised px-4 py-2 text-sm font-medium text-ink shadow-sm transition-transform active:translate-x-[2px] active:translate-y-[2px] active:shadow-sm"
          >
            <BookOpen size={16} />
            <span>一天已播完，查看完整报告</span>
            <ArrowRight
              size={14}
              weight="bold"
              className="transition-transform group-hover:translate-x-1"
            />
          </button>
        </div>
      )}

      {/* Full report */}
      {showReport && (
        <motion.section
          initial={reduce ? false : { opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="flex flex-col gap-6"
        >
          <div className="border-2 border-ink bg-paper-raised p-4 shadow-md">
            <h2 className="mb-4 font-serif text-lg font-medium" style={{ color: theme.accent }}>
              这条路的全景
            </h2>
            {plan && <BlueprintReport plan={plan} />}
            <div className="mt-6 border-t-2 border-ink/20 pt-6">
              <LifeAnalysis route={route} accentColor={theme.accent} />
            </div>
          </div>

          {/* Navigation */}
          <div className="flex flex-col gap-3">
            {nextRoute ? (
              <button
                type="button"
                onClick={() => router.push(`/play/life/${nextRoute.id}`)}
                className="group flex items-center justify-between border-2 border-ink bg-paper-raised p-4 shadow-md transition-transform hover:shadow-lg active:translate-x-[2px] active:translate-y-[2px] active:shadow-sm"
              >
                <div className="flex flex-col items-start gap-1">
                  <span className="text-xs text-ink-muted">下一条路线</span>
                  <span className="font-serif text-base font-medium">
                    {nextRoute.number} · {nextRoute.title}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-sm font-medium" style={{ color: theme.accent }}>
                  <span>走进去</span>
                  <ArrowRight
                    size={20}
                    weight="bold"
                    className="transition-transform group-hover:translate-x-1"
                  />
                </div>
              </button>
            ) : (
              <div className="flex flex-col items-center gap-3 border-2 border-ink bg-paper-raised p-6 text-center shadow-sm">
                <p className="font-serif text-base text-ink">三条路线都看完了。</p>
                <p className="text-sm text-ink-muted">
                  你可以回到三条路线的列表，选择一条开始三天试玩。
                </p>
                <button
                  type="button"
                  onClick={() => router.push("/play")}
                  className="border-2 border-ink bg-cobalt px-4 py-2 text-sm font-medium text-white shadow-md transition-transform active:translate-x-[2px] active:translate-y-[2px] active:shadow-sm"
                >
                  返回三条路线
                </button>
              </div>
            )}

            {prevRoute && (
              <button
                type="button"
                onClick={() => router.push(`/play/life/${prevRoute.id}`)}
                className="flex items-center gap-1 self-start text-sm text-ink-muted transition-colors hover:text-ink"
              >
                <ArrowLeft size={16} />
                上一条：{prevRoute.number} · {prevRoute.title}
              </button>
            )}
          </div>
        </motion.section>
      )}
    </div>
  );
}
