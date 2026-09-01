"use client";

import { motion, useReducedMotion } from "motion/react";
import { PixelIcon } from "@/components/art/PixelIcon";
import type { InterviewQuestion } from "@/lib/working-memory/types";

export type ChatItem = {
  id: string;
  type: "bot" | "user" | "question";
  text?: string;
  question?: InterviewQuestion;
  answer?: string | string[];
  skipped?: boolean;
  delay?: number;
};

type ChatThreadProps = {
  items: ChatItem[];
};

function ChatBubble({
  children,
  from,
  delay = 0,
}: {
  children: React.ReactNode;
  from: "host" | "user";
  delay?: number;
}) {
  const reduce = useReducedMotion();
  const isHost = from === "host";
  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
      className={`flex w-full gap-3 ${isHost ? "justify-start" : "justify-end"}`}
    >
      {isHost && (
        <span className="mt-1 inline-flex h-7 w-7 shrink-0 items-center justify-center border-2 border-ink bg-paper-raised shadow-sm">
          <PixelIcon name="sparkle" size={12} className="text-cobalt" />
        </span>
      )}
      <div
        className={`max-w-[85%] rounded-sm border-2 px-4 py-3 text-base leading-snug shadow-sm ${
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

function answerText(question: InterviewQuestion, value?: string | string[] | number, skipped?: boolean): string {
  if (skipped) return "我跳过这一题";
  if (value === undefined || value === null) return "（未答）";
  if (typeof value === "number") return String(value);
  if (Array.isArray(value)) {
    return value
      .map((v) => {
        const opt = question.options?.find((o) => o.id === v);
        return opt ? opt.label : v;
      })
      .join("，") || "（未答）";
  }
  const opt = question.options?.find((o) => o.id === value);
  return opt ? opt.label : value;
}

export function ChatThread({ items }: ChatThreadProps) {
  const reduce = useReducedMotion();

  return (
    <div className="flex flex-col gap-3 p-4">
      {items.map((item) => {
        if (item.type === "bot") {
          return (
            <ChatBubble key={item.id} from="host" delay={item.delay ?? 0}>
              {item.text}
            </ChatBubble>
          );
        }

        if (item.type === "user") {
          return (
            <ChatBubble key={item.id} from="user" delay={item.delay ?? 0}>
              {item.text}
            </ChatBubble>
          );
        }

        if (item.type === "question" && item.question) {
          return (
            <div key={item.id} className="flex w-full flex-col gap-2">
              <ChatBubble from="host" delay={item.delay ?? 0}>
                {item.question.text}
              </ChatBubble>
              {item.answer !== undefined && (
                <ChatBubble from="user" delay={(item.delay ?? 0) + 0.1}>
                  {answerText(item.question, item.answer, item.skipped)}
                </ChatBubble>
              )}
            </div>
          );
        }

        return null;
      })}
    </div>
  );
}
