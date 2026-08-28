"use client";

import { motion, useReducedMotion } from "motion/react";
import Link from "next/link";
import { PixelIcon } from "@/components/art/PixelIcon";
import { LandingMascot } from "./LandingMascot";

export function LandingPage() {
  const reduce = useReducedMotion();

  return (
    <div className="flex min-h-[100dvh] flex-col justify-between gap-8">
      <header className="pt-2">
        <span className="inline-flex items-center gap-1.5 border-2 border-ink bg-paper-raised px-3 py-1 text-sm font-medium shadow-sm">
          <PixelIcon name="sparkle" size={14} className="text-cobalt" />
          人生试运行
        </span>
      </header>

      <section className="flex flex-1 flex-col items-start justify-center gap-8">
        <LandingMascot />

        <h1 className="max-w-[18ch] font-serif text-[30px] leading-[1.12] tracking-tight md:text-[42px] lg:text-[54px]">
          回答几个短问题，看见三种可试玩的人生
        </h1>

        <motion.div
          initial={reduce ? false : { opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.45, duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
          className="w-full max-w-md border-2 border-ink bg-paper-raised p-5 shadow-md"
        >
          <div className="mb-3 flex items-center gap-2 text-xs text-ink-muted">
            <span className="font-mono text-cobalt">WAVE 1</span>
            <PixelIcon name="comment" size={14} className="text-ink-muted" />
            <span>即时理解样张</span>
          </div>
          <div className="space-y-3 font-serif text-base leading-snug">
            <p>
              <span className="text-ink-muted">你告诉我的：</span>
              你刚换城市不久，对“稳定”和“还能尝试什么”都感到不确定。
            </p>
            <p>
              <span className="text-ink-muted">我目前的理解：</span>
              你正在找一个既能用上已有能力、又保留探索空间的方向，而不是一份单纯的“更好工作”。
            </p>
            <p>
              <span className="text-ink-muted">还不确定：</span>
              你更在意的是收入下限、身份认同，还是日常生活的可控感。
            </p>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <span className="border border-ink px-2 py-1 text-xs">准确</span>
            <span className="border border-ink px-2 py-1 text-xs">部分准确</span>
            <span className="border border-ink px-2 py-1 text-xs">不准确</span>
          </div>
        </motion.div>
      </section>

      <footer className="pb-6">
        <Link
          href="/play"
          className="inline-flex w-full max-w-md items-center justify-center border-2 border-ink bg-cobalt px-5 py-3.5 text-center text-base font-medium text-white shadow-md transition-transform active:translate-x-[2px] active:translate-y-[2px] active:shadow-sm md:w-auto"
        >
          开始试运行
        </Link>
        <p className="mt-4 flex max-w-md items-start gap-2 text-sm text-ink-muted">
          <PixelIcon name="user" size={18} className="mt-0.5 shrink-0 text-ink-muted" />
          <span>无需注册。回答 3-5 题后会得到一条可纠正的理解；足够后再生成三条平行的三年人生。</span>
        </p>
      </footer>
    </div>
  );
}
