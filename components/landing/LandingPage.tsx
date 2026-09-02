"use client";

import { useState } from "react";
import { motion, useReducedMotion, AnimatePresence } from "motion/react";
import Link from "next/link";
import { PixelIcon } from "@/components/art/PixelIcon";

const choices = [
  {
    id: "choose",
    label: "我正面临一个具体选择，想先看清它",
    response: "好，那咱们先把这个选择拆开看看——你真正在意的到底是什么。",
  },
  {
    id: "drift",
    label: "我对现在的方向感到不确定，想重新理解",
    response: "嗯，这种感觉我懂。咱们先把你现在的状态和卡住的地方理一理，再看有哪些方向值得试试。",
  },
  {
    id: "browse",
    label: "我只是先随便看看",
    response: "完全没问题，先逛逛。随时可以开始，也随时可以退出。",
  },
] as const;

type ChoiceId = (typeof choices)[number]["id"];

function ChatMessage({
  children,
  delay,
  from = "host",
}: {
  children: React.ReactNode;
  delay: number;
  from?: "host" | "user";
}) {
  const reduce = useReducedMotion();
  const isHost = from === "host";
  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
      className={`flex max-w-md gap-3 ${isHost ? "justify-start" : "justify-end"}`}
    >
      {isHost && (
        <span className="mt-1 inline-flex h-7 w-7 shrink-0 items-center justify-center border-2 border-ink bg-paper-raised shadow-sm">
          <PixelIcon name="sparkle" size={12} className="text-cobalt" />
        </span>
      )}
      <div
        className={`rounded-sm border-2 px-4 py-3 text-base leading-snug shadow-sm ${
          isHost
            ? "border-ink bg-paper-raised text-ink"
            : "border-ink bg-cobalt text-white"
        }`}
      >
        {children}
      </div>
    </motion.div>
  );
}

export function LandingPage() {
  const reduce = useReducedMotion();
  const [selected, setSelected] = useState<ChoiceId | null>(null);

  const selectedChoice = choices.find((c) => c.id === selected);

  return (
    <div className="mx-auto flex min-h-[100dvh] w-full max-w-2xl flex-col gap-6 px-4 pb-6 pt-4">
      <header>
        <span className="inline-flex items-center gap-1.5 border-2 border-ink bg-paper-raised px-3 py-1 text-sm font-medium shadow-sm">
          <PixelIcon name="sparkle" size={14} className="text-cobalt" />
          人生试运行
        </span>
      </header>

      <section className="flex flex-1 flex-col gap-4 pt-4">
        <ChatMessage delay={0.1}>
          嗨，来了呀。
        </ChatMessage>

        <ChatMessage delay={0.25}>
          我不替你做决定，就是陪你把眼前这摊事儿捋清楚一点。
        </ChatMessage>

        <ChatMessage delay={0.4}>
          先问一句——你现在大概是哪种情况？
        </ChatMessage>

        <motion.div
          initial={reduce ? false : { opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.55, duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
          className="mt-2 max-w-md"
        >
          <div className="border-2 border-ink bg-paper-raised p-1 shadow-md">
            {choices.map((choice) => (
              <button
                key={choice.id}
                type="button"
                onClick={() => setSelected(choice.id)}
                className={`w-full border-b-2 border-ink/10 px-4 py-3.5 text-left text-base transition-colors last:border-0 ${
                  selected === choice.id
                    ? "bg-cobalt text-white hover:bg-cobalt"
                    : "text-ink hover:bg-cobalt/5"
                }`}
              >
                {choice.label}
              </button>
            ))}
          </div>
        </motion.div>

        <AnimatePresence>
          {selectedChoice && (
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
              className="mt-2 flex max-w-md flex-col gap-4"
            >
              <ChatMessage from="host" delay={0}>
                {selectedChoice.response}
              </ChatMessage>

              <ChatMessage from="host" delay={0.15}>
                那咱们先聊几个小问题，3-5 个就够，不用紧张。
              </ChatMessage>

              <motion.div
                initial={reduce ? false : { opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3, duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
              >
                <Link
                  href="/play"
                  className="inline-flex w-full items-center justify-center border-2 border-ink bg-cobalt px-5 py-3.5 text-center text-base font-medium text-white shadow-md transition-transform active:translate-x-[2px] active:translate-y-[2px] active:shadow-sm"
                >
                  开始试运行
                </Link>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </section>

      <footer className="pt-2">
        <p className="flex max-w-md items-start gap-2 text-sm text-ink-muted">
          <PixelIcon name="user" size={18} className="mt-0.5 shrink-0 text-ink-muted" />
          <span>需要邀请码注册。回答 3-5 题后会得到一条可纠正的理解；足够后再生成三条平行的三年人生。</span>
        </p>
      </footer>
    </div>
  );
}
