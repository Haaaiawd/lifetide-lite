"use client";

import { useEffect, useState } from "react";
import { motion } from "motion/react";

const STAGES = [
  { threshold: 0, label: "整理你说过的话…" },
  { threshold: 20, label: "标出关键约束…" },
  { threshold: 45, label: "推演三条不同方向…" },
  { threshold: 70, label: "写入可试行的三天原型…" },
  { threshold: 90, label: "再过几秒就好…" },
];

export function LoadingProgress() {
  const [progress, setProgress] = useState(0);
  const stage = [...STAGES].reverse().find((s) => progress >= s.threshold) ?? STAGES[0];

  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];
    const schedule = (target: number, delay: number) => {
      timers.push(setTimeout(() => setProgress(target), delay));
    };

    schedule(10, 300);
    schedule(25, 3000);
    schedule(45, 8000);
    schedule(70, 20000);
    schedule(88, 35000);

    return () => timers.forEach(clearTimeout);
  }, []);

  return (
    <div className="mx-auto flex w-full max-w-md min-h-[100dvh] flex-col items-center justify-center gap-4 p-6">
      <p className="font-mono text-sm text-ink-muted">{stage.label}</p>
      <div className="w-full border-2 border-ink bg-paper p-1 shadow-inner">
        <motion.div
          className="h-3 bg-cobalt"
          initial={{ width: 0 }}
          animate={{ width: `${progress}%` }}
          transition={{ duration: 0.6, ease: "easeOut" }}
        />
      </div>
      <p className="font-mono text-xs text-ink-muted">{progress}%</p>
    </div>
  );
}
