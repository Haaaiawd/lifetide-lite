"use client";

import { useEffect, useRef } from "react";
import { motion, AnimatePresence, useReducedMotion } from "motion/react";
import { PixelIcon } from "@/components/art/PixelIcon";
import { QuestionFrame } from "@/components/interview/QuestionFrame";
import { InsightSlip } from "@/components/insight/InsightSlip";
import { MaterialCard } from "@/components/play/MaterialCard";
import type { InterviewQuestion } from "@/lib/working-memory/types";
import type { InsightView } from "@/lib/working-memory/types";

export type ConversationItem =
  | { id: string; type: "bot"; text: string }
  | { id: string; type: "user"; text: string }
  | {
      id: string;
      type: "question";
      question: InterviewQuestion;
      total: number;
      answer?: { value?: string | string[] | number; skipped: boolean };
      isActive: boolean;
    }
  | {
      id: string;
      type: "insight";
      insight: InsightView;
      feedback?: { accuracy: string; note: string };
      isActive: boolean;
      readonly?: boolean;
    }
  | {
      id: string;
      type: "material";
      uploadIds?: string[];
      pastedText?: string;
      isActive: boolean;
    };

type ConversationProps = {
  items: ConversationItem[];
  onQuestionSubmit: (id: string, value: string | string[] | number) => void;
  onQuestionSkip: (id: string) => void;
  onQuestionBack: () => void;
  onInsightContinue: (
    id: string,
    feedback: { accuracy: "accurate" | "partial" | "inaccurate"; note: string; direction: string }
  ) => void;
  onMaterialSubmit: (id: string, material: { uploadIds: string[]; pastedText?: string }) => void;
  onMaterialSkip: (id: string) => void;
};

function chatId(item: ConversationItem): string {
  return item.id;
}

// Resolve an answer value into an array of option labels for display.
// Handles three forms:
//  1. string[] — the canonical form from QuestionFrame multi_choice submit
//  2. string with "；" separators — DB-stored joined form (after refresh/restore)
//  3. single string/number — single_choice or short_text
function answerLabels(question: InterviewQuestion, value?: string | string[] | number, skipped?: boolean): string[] {
  if (skipped) return ["跳过"];
  if (value === undefined || value === null) return ["未答"];
  if (typeof value === "number") return [String(value)];
  if (Array.isArray(value)) {
    const labels = value.map((v) => {
      const opt = question.options?.find((o) => o.id === v);
      return opt ? opt.label : v;
    });
    return labels.length > 0 ? labels : ["未答"];
  }
  // String value: check if it's a DB-joined multi-choice answer (contains "；"
  // and the parts match option IDs). If so, split and resolve each part.
  if (typeof value === "string" && value.includes("；")) {
    const parts = value.split("；").filter((p) => p !== "");
    if (parts.length > 1) {
      const labels = parts.map((v) => {
        const opt = question.options?.find((o) => o.id === v);
        return opt ? opt.label : v;
      });
      return labels;
    }
  }
  const opt = question.options?.find((o) => o.id === value);
  return [opt ? opt.label : value];
}

function answerText(question: InterviewQuestion, value?: string | string[] | number, skipped?: boolean): string {
  return answerLabels(question, value, skipped).join("，");
}

function MaterialSummary({
  uploadIds,
  pastedText,
}: {
  uploadIds?: string[];
  pastedText?: string;
}) {
  return (
    <div className="rounded-sm border-2 border-ink bg-paper-raised p-4 shadow-sm">
      <div className="mb-2 flex items-center gap-2 text-sm text-ink-muted">
        <PixelIcon name="upload" size={14} className="text-cobalt" />
        已补充材料
      </div>
      <ul className="space-y-1 text-sm">
        {uploadIds && uploadIds.length > 0 && uploadIds.map((_, i) => (
          <li key={i}>文件 {i + 1} 已上传</li>
        ))}
        {pastedText && <li>粘贴了 {pastedText.length} 字</li>}
        {!uploadIds?.length && !pastedText && <li>已跳过</li>}
      </ul>
    </div>
  );
}

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

function QuestionSummary({
  question,
  answer,
}: {
  question: InterviewQuestion;
  answer?: { value?: string | string[] | number; skipped: boolean };
}) {
  const labels = answer ? answerLabels(question, answer.value, answer.skipped) : [];
  const isMulti = question.response_kind === "multi_choice" && labels.length > 1;
  return (
    <div className="rounded-sm border-2 border-ink bg-paper-raised p-4 shadow-sm">
      <p className="text-sm text-ink-muted">第 {question.order} 题</p>
      <p className="mt-1 font-serif text-base leading-snug">{question.text}</p>
      {labels.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {isMulti
            ? labels.map((label, i) => (
                <span
                  key={i}
                  className="inline-block border-2 border-cobalt bg-cobalt/5 px-2 py-1 text-sm text-ink"
                >
                  {label}
                </span>
              ))
            : (
              <span className="inline-block border-2 border-cobalt bg-cobalt/5 px-2 py-1 text-sm text-ink">
                {labels[0]}
              </span>
            )}
        </div>
      )}
    </div>
  );
}

function InsightSummary({
  insight,
  feedback,
}: {
  insight: InsightView;
  feedback?: { accuracy: string; note: string };
}) {
  const labels: Record<string, string> = { accurate: "准确", partial: "部分准确", inaccurate: "不准确" };
  return (
    <div className="rounded-sm border-2 border-ink bg-paper-raised p-4 shadow-sm">
      <div className="mb-2 flex items-center gap-2 text-sm text-ink-muted">
        <PixelIcon name="comment" size={14} className="text-cobalt" />
        WAVE {insight.wave} 即时理解
      </div>
      <p className="font-serif text-base leading-snug">{insight.interpretation}</p>
      {feedback && (
        <div className="mt-2 text-sm text-ink-muted">
          你标记：{labels[feedback.accuracy] ?? feedback.accuracy}
          {feedback.note ? ` · ${feedback.note}` : ""}
        </div>
      )}
    </div>
  );
}

function ConversationCard({
  item,
  onQuestionSubmit,
  onQuestionSkip,
  onQuestionBack,
  onInsightContinue,
  onMaterialSubmit,
  onMaterialSkip,
}: {
  item: ConversationItem;
  onQuestionSubmit: ConversationProps["onQuestionSubmit"];
  onQuestionSkip: ConversationProps["onQuestionSkip"];
  onQuestionBack: ConversationProps["onQuestionBack"];
  onInsightContinue: ConversationProps["onInsightContinue"];
  onMaterialSubmit: ConversationProps["onMaterialSubmit"];
  onMaterialSkip: ConversationProps["onMaterialSkip"];
}) {
  const reduce = useReducedMotion();

  if (item.type === "bot") {
    return (
      <ChatBubble from="host" delay={0}>
        {item.text}
      </ChatBubble>
    );
  }

  if (item.type === "user") {
    return (
      <ChatBubble from="user" delay={0}>
        {item.text}
      </ChatBubble>
    );
  }

  if (item.type === "question") {
    return (
      <motion.div
        layout
        initial={reduce ? false : { opacity: 0, y: 60 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
        className={`w-full rounded-sm border-2 border-ink bg-paper-raised shadow-md ${
          item.isActive ? "min-h-[75dvh] p-4 md:p-6" : "p-4"
        }`}
      >
        <AnimatePresence initial={false}>
          {item.isActive ? (
            <motion.div
              key="active"
              initial={reduce ? false : { opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={reduce ? undefined : { opacity: 0 }}
              transition={{ duration: 0.2 }}
            >
              <QuestionFrame
                question={item.question}
                index={item.question.order}
                total={item.total}
                initialValue={item.answer?.value}
                onSubmit={(value) => onQuestionSubmit(item.id, value)}
                onSkip={() => onQuestionSkip(item.id)}
                onBack={item.question.order > 1 ? onQuestionBack : undefined}
                variant="card"
              />
            </motion.div>
          ) : (
            <motion.div
              key="summary"
              initial={reduce ? false : { opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={reduce ? undefined : { opacity: 0 }}
              transition={{ duration: 0.2 }}
            >
              <QuestionSummary question={item.question} answer={item.answer} />
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    );
  }

  if (item.type === "insight") {
    return (
      <motion.div
        layout
        initial={reduce ? false : { opacity: 0, y: 60 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
        className={`w-full rounded-sm border-2 border-ink bg-paper-raised shadow-md ${
          item.isActive ? "min-h-[75dvh] p-0" : "p-4"
        }`}
      >
        <AnimatePresence initial={false}>
          {item.isActive ? (
            <motion.div
              key="active"
              initial={reduce ? false : { opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={reduce ? undefined : { opacity: 0 }}
              transition={{ duration: 0.2 }}
            >
              <InsightSlip
                insight={item.insight}
                onContinue={
                  item.readonly
                    ? undefined
                    : (feedback) =>
                        onInsightContinue(item.id, {
                          accuracy: feedback.accuracy,
                          note: feedback.note,
                          direction: feedback.direction,
                        })
                }
              />
            </motion.div>
          ) : (
            <motion.div
              key="summary"
              initial={reduce ? false : { opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={reduce ? undefined : { opacity: 0 }}
              transition={{ duration: 0.2 }}
            >
              <InsightSummary insight={item.insight} feedback={item.feedback} />
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    );
  }

  if (item.type === "material") {
    return (
      <motion.div
        layout
        initial={reduce ? false : { opacity: 0, y: 60 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
        className={`w-full rounded-sm border-2 border-ink bg-paper-raised shadow-md ${
          item.isActive ? "min-h-[75dvh] p-4 md:p-6" : "p-4"
        }`}
      >
        <AnimatePresence mode="wait" initial={false}>
          {item.isActive ? (
            <motion.div
              key="active"
              initial={reduce ? false : { opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={reduce ? undefined : { opacity: 0 }}
              transition={{ duration: 0.2 }}
            >
              <MaterialCard
                onSubmit={(material) => onMaterialSubmit(item.id, material)}
                onSkip={() => onMaterialSkip(item.id)}
              />
            </motion.div>
          ) : (
            <motion.div
              key="summary"
              initial={reduce ? false : { opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={reduce ? undefined : { opacity: 0 }}
              transition={{ duration: 0.2 }}
            >
              <MaterialSummary uploadIds={item.uploadIds} pastedText={item.pastedText} />
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    );
  }

  return null;
}

export function Conversation({
  items,
  onQuestionSubmit,
  onQuestionSkip,
  onQuestionBack,
  onInsightContinue,
  onMaterialSubmit,
  onMaterialSkip,
  className,
}: ConversationProps & { className?: string }) {
  const reduce = useReducedMotion();
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const container = containerRef.current;
    // Defer scroll to next frame so new cards (especially insight cards
    // with entrance animations) have a chance to render before we scroll
    // to them. Without this, scrollIntoView fires while the card is still
    // at opacity:0, making it appear to "vanish."
    const raf = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const active = container.querySelector('[data-active="true"]') as HTMLElement | null;
        if (active) {
          active.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
        } else {
          container.scrollTo({ top: container.scrollHeight, behavior: reduce ? "auto" : "smooth" });
        }
      });
    });
    return () => cancelAnimationFrame(raf);
  }, [items, reduce]);

  return (
    <div
      ref={containerRef}
      className={`flex w-full flex-col gap-4 overflow-y-auto p-4 scroll-smooth ${className ?? ""}`}
      style={{ scrollSnapType: "y proximity", overscrollBehavior: "contain" }}
    >
      {items.map((item) => (
        <div key={chatId(item)} data-active={(item.type === "question" || item.type === "insight" || item.type === "material") ? item.isActive : undefined}>
          <ConversationCard
            item={item}
            onQuestionSubmit={onQuestionSubmit}
            onQuestionSkip={onQuestionSkip}
            onQuestionBack={onQuestionBack}
            onInsightContinue={onInsightContinue}
            onMaterialSubmit={onMaterialSubmit}
            onMaterialSkip={onMaterialSkip}
          />
        </div>
      ))}
      <div className="h-4 shrink-0" />
    </div>
  );
}
