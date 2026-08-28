"use client";

import { Circle, Dot, Square, Check } from "@phosphor-icons/react";

export type ChoiceCardProps = {
  id: string;
  label: string;
  selected: boolean;
  mode?: "single" | "multi";
  onSelect: () => void;
  autoFocus?: boolean;
};

export function ChoiceCard({ id, label, selected, mode = "single", onSelect, autoFocus }: ChoiceCardProps) {
  const isMulti = mode === "multi";

  return (
    <button
      type="button"
      role={isMulti ? "checkbox" : "radio"}
      aria-checked={selected}
      autoFocus={autoFocus}
      onClick={onSelect}
      className={`
        group flex w-full items-start gap-3 border-2 border-ink p-3 text-left shadow-sm
        transition-transform focus:outline-none focus-visible:ring-2 focus-visible:ring-ink focus-visible:ring-offset-2 focus-visible:ring-offset-paper
        hover:shadow-md active:translate-x-[2px] active:translate-y-[2px] active:shadow-sm
        ${selected ? "bg-cobalt-soft" : "bg-paper-raised"}
      `}
    >
      <span
        className={`
          mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center border-2 border-ink
          ${isMulti ? "" : "rounded-full"}
          ${selected ? "bg-cobalt text-white" : "bg-paper-raised text-ink"}
        `}
        aria-hidden="true"
      >
        {selected && (isMulti ? <Check size={14} weight="bold" /> : <Dot size={14} weight="fill" />)}
        {!selected && (isMulti ? <Square size={14} /> : <Circle size={14} />)}
      </span>
      <span className="text-sm leading-snug">{label}</span>
    </button>
  );
}
