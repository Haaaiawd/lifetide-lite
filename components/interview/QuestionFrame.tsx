"use client";

import { useState } from "react";
import { PixelIcon } from "@/components/art/PixelIcon";
import { ChoiceCard } from "./ChoiceCard";
import type { InterviewQuestion } from "@/lib/working-memory/types";

const URL_RE = /https?:\/\/[^\s]+/g;

function LinkifiedText({ text, className }: { text: string; className?: string }) {
  const segments: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = URL_RE.exec(text)) !== null) {
    if (match.index > lastIndex) {
      segments.push(<span key={lastIndex}>{text.slice(lastIndex, match.index)}</span>);
    }
    const url = match[0];
    segments.push(
      <a
        key={match.index}
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="text-cobalt underline"
        onClick={(e) => e.stopPropagation()}
      >
        {url}
      </a>
    );
    lastIndex = match.index + url.length;
  }
  if (lastIndex < text.length) {
    segments.push(<span key={lastIndex}>{text.slice(lastIndex)}</span>);
  }
  return <p className={className}>{segments}</p>;
}

export type QuestionFrameProps = {
  question: InterviewQuestion;
  index: number;
  total: number;
  onSubmit: (value: string | string[] | number) => void;
  onSkip: () => void;
  variant?: "page" | "card";
};

const CUSTOM_ID = "custom";
const CUSTOM_LABEL = "其他（可输入）";

export function QuestionFrame({ question, index, total, onSubmit, onSkip, variant = "page" }: QuestionFrameProps) {
  const isCard = variant === "card";
  const [selected, setSelected] = useState<string[]>([]);
  const [customText, setCustomText] = useState("");
  const [text, setText] = useState("");

  const isCustomSelected = selected.includes(CUSTOM_ID);

  const allOptions = question.allows_custom
    ? [...(question.options ?? []), { id: CUSTOM_ID, label: CUSTOM_LABEL }]
    : (question.options ?? []);

  const canSubmit = () => {
    if (question.response_kind === "short_text") return text.trim().length > 0;
    if (question.response_kind === "single_choice") {
      if (selected.length !== 1) return false;
      if (selected[0] === CUSTOM_ID) return customText.trim().length > 0;
      return true;
    }
    if (question.response_kind === "multi_choice") {
      if (selected.length === 0) return false;
      if (isCustomSelected) return customText.trim().length > 0;
      return true;
    }
    if (question.response_kind === "scale") {
      return selected.length === 1 && selected[0] !== CUSTOM_ID;
    }
    return false;
  };

  const handleSelect = (id: string) => {
    if (question.response_kind === "single_choice" || question.response_kind === "scale") {
      setSelected((prev) => (prev.includes(id) ? [] : [id]));
      return;
    }

    if (question.response_kind === "multi_choice") {
      setSelected((prev) =>
        prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
      );
    }
  };

  const handleSubmit = () => {
    if (!canSubmit()) return;

    if (question.response_kind === "short_text") {
      onSubmit(text.trim());
      return;
    }

    if (question.response_kind === "single_choice") {
      onSubmit(selected[0] === CUSTOM_ID ? customText.trim() : selected[0]);
      return;
    }

    if (question.response_kind === "multi_choice") {
      const value = selected.map((id) => (id === CUSTOM_ID ? customText.trim() : id));
      onSubmit(value);
      return;
    }

    if (question.response_kind === "scale") {
      onSubmit(Number(selected[0]));
    }
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        handleSubmit();
      }}
      className={`mx-auto flex w-full max-w-2xl flex-col justify-between ${isCard ? "max-h-none py-2" : "min-h-[100dvh]"}`}
    >
      <header className="flex items-center justify-between pt-2">
        <span className="inline-flex items-center gap-1.5 font-mono text-sm text-cobalt">
          <PixelIcon name="circleQuestion" size={14} className="text-cobalt" />
          WAVE {question.wave_id.replace("w", "")}
        </span>
        <span className="text-sm text-ink-muted">
          第 {index}/{total} 题
        </span>
      </header>

      <section className={`flex flex-1 flex-col gap-6 ${isCard ? "pt-4" : "pt-10"}`}>
        <div>
          <h2 className="font-serif text-xl leading-snug md:text-2xl">
            {question.text}
          </h2>
          {question.why_this_matters && (
            <LinkifiedText text={question.why_this_matters} className="mt-2 text-sm text-ink-muted" />
          )}
        </div>

        {question.response_kind === "short_text" ? (
          <div className="flex flex-col gap-3">
            <label htmlFor={`q-${question.id}`} className="sr-only">
              {question.text}
            </label>
            <textarea
              id={`q-${question.id}`}
              value={text}
              onChange={(e) => setText(e.target.value)}
              className="min-h-[160px] w-full border-2 border-ink bg-paper p-4 text-base shadow-inner focus:outline-none focus-visible:ring-2 focus-visible:ring-ink focus-visible:ring-offset-2 focus-visible:ring-offset-paper"
              placeholder="可以写一句话或几行，没有标准答案。"
            />
          </div>
        ) : (
          <div
            className="flex flex-col gap-3"
            role={
              question.response_kind === "multi_choice"
                ? "group"
                : question.response_kind === "single_choice" || question.response_kind === "scale"
                  ? "radiogroup"
                  : undefined
            }
            aria-label={question.text}
          >
            {allOptions.map((option, i) => (
              <ChoiceCard
                key={option.id}
                id={option.id}
                label={option.label}
                mode={question.response_kind === "multi_choice" ? "multi" : "single"}
                selected={selected.includes(option.id)}
                onSelect={() => handleSelect(option.id)}
                autoFocus={i === 0}
              />
            ))}
            {isCustomSelected && (
              <div className="mt-1 pl-8">
                <label htmlFor={`q-${question.id}-custom`} className="sr-only">
                  自定义答案
                </label>
                <textarea
                  id={`q-${question.id}-custom`}
                  value={customText}
                  onChange={(e) => setCustomText(e.target.value)}
                  rows={2}
                  className="w-full border-2 border-ink bg-paper p-3 text-sm shadow-inner focus:outline-none focus-visible:ring-2 focus-visible:ring-ink focus-visible:ring-offset-2 focus-visible:ring-offset-paper"
                  placeholder="请输入你自己的答案"
                />
              </div>
            )}
          </div>
        )}
      </section>

      <footer className={`z-10 border-t-2 border-ink bg-paper py-4 pb-6 ${isCard ? "relative mt-6" : "sticky bottom-0"}`}>
        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={!canSubmit()}
            className={`
              flex-1 border-2 border-ink px-5 py-3.5 text-center text-base font-medium shadow-md
              transition-transform active:translate-x-[2px] active:translate-y-[2px] active:shadow-sm
              ${
                canSubmit()
                  ? "bg-cobalt text-white hover:shadow-md"
                  : "bg-paper-raised text-ink-muted cursor-not-allowed"
              }
            `}
          >
            提交
          </button>
          <button
            type="button"
            onClick={onSkip}
            className="border-2 border-ink bg-paper-raised px-4 py-3.5 text-base shadow-sm transition-transform active:translate-x-[2px] active:translate-y-[2px] active:shadow-sm"
          >
            跳过
          </button>
        </div>
      </footer>
    </form>
  );
}
