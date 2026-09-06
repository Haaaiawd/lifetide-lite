"use client";

import { useEffect, useState, useRef } from "react";
import { motion, useReducedMotion, AnimatePresence } from "motion/react";
import { WalkProgress } from "@/components/play/WalkProgress";

type Phase = "walking" | "streaming" | "complete" | "error";

type StreamingSection = {
  label: string;
  text: string;
};

export type GenerationOverlayProps = {
  /** What kind of generation this overlay is for. */
  variant: "portrait" | "final";
  /** Title shown above the walking animation. */
  title: string;
  /** Subtitle shown during walking phase. */
  subtitle: string;
  /** Streaming data — drives both early transition from walking and content display. */
  streamingSections?: StreamingSection[] | null;
  /** When true, all content has arrived; overlay waits briefly then calls onComplete. */
  isComplete?: boolean;
  /** Called after the streaming content has been shown for a moment. */
  onComplete?: () => void;
  /** Error message — if set, overlay shows error + retry. */
  error?: string | null;
  /** Retry callback. */
  onRetry?: () => void;
  /** Cancel / close callback. */
  onCancel?: () => void;
};

const MAX_WALK_DURATION = 8000; // ms — fallback cap so it cannot hang forever
const STREAMING_SETTLE_MS = 2500; // ms — how long to show streamed content before transition

/**
 * Full-screen overlay for portrait and final-plan generation.
 *
 * Stream-driven experience:
 * 1. Walking phase: pixel-art traveler walks along a progress line. The walking
 *    phase ends as soon as real streaming content arrives — it does NOT wait
 *    for a fixed duration.
 * 2. Streaming phase: text content fades in section by section as it arrives.
 *    The model's live reasoning is shown first, then the generated content.
 * 3. Complete phase: when isComplete becomes true, the overlay waits a short
 *    moment so the user can see the final content, then calls onComplete.
 *
 * A max walking duration exists only as a safety cap (e.g., if the provider
 * streams no partials at all).
 */
export function GenerationOverlay({
  variant,
  title,
  subtitle,
  streamingSections,
  isComplete,
  onComplete,
  error,
  onRetry,
  onCancel,
}: GenerationOverlayProps) {
  const reduce = useReducedMotion();
  const [phase, setPhase] = useState<Phase>("walking");
  const [walkProgress, setWalkProgress] = useState(0);
  const walkStartRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);

  const hasStreamContent = streamingSections && streamingSections.some((s) => s.text);

  // Walking phase: advances until either (a) stream content arrives,
  // (b) the generation is already complete, or (c) the safety cap is reached.
  // Not fixed to a set duration. If content/complete arrives early, end
  // immediately without resetting the progress bar (avoids flicker).
  useEffect(() => {
    if (error) {
      setPhase("error");
      return;
    }
    if (reduce) {
      setWalkProgress(1);
      setPhase(isComplete ? "complete" : hasStreamContent ? "streaming" : "walking");
      return;
    }
    if (phase !== "walking") return;

    // Stream content or done already arrived — hand over to streaming.
    if (hasStreamContent || isComplete) {
      setWalkProgress(1);
      setPhase("streaming");
      return;
    }

    // Start fresh walking animation only on the first mount/entry into walking.
    setWalkProgress(0);
    walkStartRef.current = null;

    const tick = (now: number) => {
      if (walkStartRef.current === null) walkStartRef.current = now;
      const elapsed = now - walkStartRef.current;
      const p = Math.min(elapsed / MAX_WALK_DURATION, 1);
      setWalkProgress(p);

      if (hasStreamContent || isComplete) {
        setWalkProgress(1);
        setPhase("streaming");
        rafRef.current = null;
        return;
      }

      // Safety cap: if nothing arrives for a long time, still show streaming UI.
      if (p >= 1) {
        setPhase("streaming");
        rafRef.current = null;
        return;
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [error, reduce, hasStreamContent, isComplete, phase]);

  // Move from streaming to complete as soon as the generation is done.
  useEffect(() => {
    if (phase === "streaming" && isComplete) {
      setPhase("complete");
    }
  }, [phase, isComplete]);

  // Once complete, let the user see the final streamed content for a moment
  // before invoking onComplete. This effect is intentionally independent of
  // the phase-transition effect above so that setPhase("complete") does not
  // cancel the settle timer.
  useEffect(() => {
    if (phase !== "complete" || !onComplete) return;
    const timer = setTimeout(() => {
      if (!isComplete) return;
      onComplete();
    }, STREAMING_SETTLE_MS);
    return () => clearTimeout(timer);
  }, [phase, isComplete, onComplete]);

  // Separate the thinking section from the rest so it can be styled differently.
  const thinkingSection = streamingSections?.find((s) => s.label === "思考中");
  const contentSections = streamingSections?.filter((s) => s.label !== "思考中") ?? [];

  return (
    <motion.div
      initial={reduce ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
      className="fixed inset-0 bottom-0 top-14 z-[60] flex flex-col items-center justify-center graph-paper"
    >
      {/* Walking phase */}
      {phase === "walking" && (
        <motion.div
          initial={reduce ? false : { opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
          className="flex w-full max-w-2xl flex-col items-center px-6"
        >
          <h2 className="mb-2 font-serif text-2xl font-medium text-ink">
            {title}
          </h2>
          <p className="mb-6 text-sm text-ink-muted">
            {subtitle}
          </p>
          <div className="w-full">
            <WalkProgress
              progress={walkProgress}
              accentColor={variant === "portrait" ? "var(--cobalt)" : "var(--purple)"}
            />
          </div>
          <p className="mt-4 text-xs text-ink-muted">
            {variant === "portrait" ? "正在综合你说的所有话，找你的模式……" : "正在为你设计三条不同的路线……"}
          </p>
        </motion.div>
      )}

      {/* Streaming / content phase */}
      {(phase === "streaming" || phase === "complete") && !error && (
        <motion.div
          initial={reduce ? false : { opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
          className="flex h-[calc(100dvh-3.5rem)] w-full max-w-3xl flex-col px-4 py-6 md:px-6 md:py-8"
        >
          <div className="mb-4 text-center">
            <h2 className="font-serif text-xl font-medium text-ink md:text-2xl">
              {variant === "portrait" ? "你的人格画像" : "三条平行人生"}
            </h2>
            <p className="text-xs text-ink-muted md:text-sm">
              {variant === "portrait" ? "正在整理你的模式……" : "正在从你的生活里长出三条路……"}
            </p>
          </div>

          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
            <AnimatePresence>
              {thinkingSection?.text ? (
                <ThinkingCard
                  key="thinking"
                  text={thinkingSection.text}
                  reduce={reduce}
                />
              ) : phase === "streaming" ? (
                <FakeThinkingCard key="fake-thinking" variant={variant} reduce={reduce} />
              ) : null}
            </AnimatePresence>

            {contentSections.length > 0 ? (
              <div className="space-y-3">
                {contentSections.map((s, i) => (
                  <StreamingSectionCard
                    key={s.label}
                    section={s}
                    index={i}
                    reduce={reduce}
                    isComplete={phase === "complete"}
                  />
                ))}
              </div>
            ) : !thinkingSection?.text && phase !== "streaming" ? (
              <div className="flex items-center gap-2 text-ink-muted">
                <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-cobalt" />
                <span className="text-sm">正在生成……</span>
              </div>
            ) : null}
          </div>
        </motion.div>
      )}

      {/* Cancel controls — anchored to the overlay's bottom-right corner */}
      {phase === "walking" && onCancel && (
        <button
          type="button"
          onClick={onCancel}
          className="absolute bottom-6 right-6 text-sm text-ink-muted underline underline-offset-2 hover:text-cobalt"
        >
          返回
        </button>
      )}
      {(phase === "streaming" || phase === "complete") && onCancel && (
        <button
          type="button"
          onClick={onCancel}
          className="absolute bottom-6 right-6 border-2 border-ink bg-paper-raised px-4 py-2 text-sm font-medium text-ink shadow-sm transition-transform active:translate-x-[1px] active:translate-y-[1px] active:shadow-sm"
        >
          取消
        </button>
      )}

      {/* Error phase */}
      {phase === "error" && error && (
        <motion.div
          initial={reduce ? false : { opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="flex w-full max-w-md flex-col items-center px-6 text-center"
        >
          <div className="mb-4 border-2 border-danger bg-danger-soft/30 p-4">
            <p className="text-sm text-danger">{error}</p>
          </div>
          <div className="flex gap-3">
            {onRetry && (
              <button
                type="button"
                onClick={onRetry}
                className="border-2 border-ink bg-cobalt px-4 py-2 text-sm font-medium text-white shadow-md transition-transform active:translate-x-[1px] active:translate-y-[1px] active:shadow-sm"
              >
                重试
              </button>
            )}
            {onCancel && (
              <button
                type="button"
                onClick={onCancel}
                className="border-2 border-ink bg-paper-raised px-4 py-2 text-sm font-medium text-ink shadow-sm transition-transform active:translate-x-[1px] active:translate-y-[1px] active:shadow-sm"
              >
                返回
              </button>
            )}
          </div>
        </motion.div>
      )}
    </motion.div>
  );
}

function ThinkingCard({ text, reduce }: { text: string; reduce: boolean | null }) {
  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, height: 0 }}
      transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
      className="border-2 border-dashed border-ink/30 bg-paper-raised p-4 shadow-sm md:p-5"
    >
      <div className="mb-2 flex items-center gap-2 text-ink-muted">
        <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-cobalt" />
        <span className="text-xs font-medium uppercase tracking-wide">思考中</span>
      </div>
      <p
        aria-hidden="true"
        className="select-none font-serif text-sm leading-relaxed tracking-[0.15em] text-ink/40 md:text-base"
      >
        {obscureText(text)}<span className="animate-pulse text-cobalt/50">▎</span>
      </p>
      <span className="sr-only">正在整理思路</span>
    </motion.div>
  );
}

/**
 * Scripted pseudo-thinking text for the two overlay variants.  The lines are
 * stitched into one continuous stream so the typing never blanks out between
 * “sentences”.
 */
const PORTRAIT_FAKE_THINKING_LINES = [
  "先把你说过的线索摊开来……",
  "看看哪些词反复出现，而不是只出现一次……",
  "工作和学习那边，你真正在回避的也许不是任务本身……",
  "关系维度上，你的倾向是少而深，不是广而浅……",
  "娱乐和自我照护之间有一条隐形的取舍线……",
  "把这些模式串起来的时候，出现了一个反复出现的主题……",
  "不是贴标签，是找一个能解释你多个行为的假设……",
  "再检查一下：这个画像是不是只反映了你的其中一面……",
  "如果把这个假设反过来，还能解释同样的事吗？",
  "最后把它收敛成一句话，和一组可观察的特质……",
];

const FINAL_FAKE_THINKING_LINES = [
  "已经聊了好几波，画像和路线种子都在手上了……",
  "现在不是给建议，是先把这些种子展开成三条真的能过的日子……",
  "第一条从现在的节奏出发：改变最小，成本在哪？",
  "第二条做一个邻近转向：把你已有的能力和想试的方向接起来……",
  "第三条再放开一点想：如果资源约束暂时放宽，会是什么生活？",
  "每条路都要有一个具体的普通一天，否则只是口号……",
  "检查一下这三条路是不是足够不一样，不是同一个答案的三种包装……",
  "再回头看你的约束：时间、金钱、健康、关系……",
  "有些选项听起来诱人，但和你的现实约束对不上……",
  "最后加上每个方向的关键不确定和下一步可以试的最小行动……",
];

const MAX_FAKE_VISIBLE_CHARS = 280;

/**
 * Redact pseudo-thinking text: keep the typing cadence and stream rhythm but
 * replace every glyph so the scripted content can never be read. Deterministic
 * per-index mapping keeps already-rendered characters stable between frames.
 */
const HIDDEN_GLYPHS = "▓▒░";
function obscureText(text: string): string {
  let out = "";
  for (let i = 0; i < text.length; i++) {
    out += /\S/.test(text[i]) ? HIDDEN_GLYPHS[(i * 7 + 3) % HIDDEN_GLYPHS.length] : text[i];
  }
  return out;
}

function buildFakeStream(lines: string[]): string {
  // Join lines with a single space so the output reads as one continuous
  // thought stream. A trailing space keeps the loop from slamming the first
  // character of the first line against the last character of the last line.
  return lines.map((l) => l.trim()).filter(Boolean).join(" ") + " ";
}

function FakeThinkingCard({ variant, reduce }: { variant: "portrait" | "final"; reduce: boolean | null }) {
  const text = useFakeThinking(variant, reduce);
  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, height: 0 }}
      transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
      className="border-2 border-dashed border-ink/30 bg-paper-raised p-4 shadow-sm md:p-5"
    >
      <div className="mb-2 flex items-center gap-2 text-ink-muted">
        <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-cobalt" />
        <span className="text-xs font-medium uppercase tracking-wide">思考中</span>
      </div>
      <p
        aria-hidden="true"
        className="select-none font-serif text-sm leading-relaxed break-words tracking-[0.15em] text-ink/40 md:text-base"
      >
        {obscureText(text)}
        {text && <span className="animate-pulse text-cobalt/50">▎</span>}
      </p>
      <span className="sr-only">正在整理思路</span>
    </motion.div>
  );
}

/**
 * Continuous fake-streaming hook for the pseudo thinking card.
 *
 * The stream is a rolling tail of characters: it types at 15-40ms per
 * character with a 5% chance of a 300-800ms "卡顿", and it moves straight
 * from one scripted phrase to the next without clearing the text.  This gives
 * the impression of an LLM thinking out loud instead of a line-by-line
 * typewriter resetting after every sentence.
 */
function useFakeThinking(variant: "portrait" | "final", reduce: boolean | null): string {
  const lines = variant === "portrait" ? PORTRAIT_FAKE_THINKING_LINES : FINAL_FAKE_THINKING_LINES;
  const [text, setText] = useState("");
  const streamRef = useRef(buildFakeStream(lines));
  const bufferRef = useRef("");
  const posRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let cancelled = false;
    streamRef.current = buildFakeStream(lines);
    bufferRef.current = "";
    posRef.current = 0;
    setText("");

    const schedule = (fn: () => void, delay: number) => {
      timerRef.current = setTimeout(() => {
        if (!cancelled) fn();
      }, delay);
    };

    if (reduce) {
      // No typing animation — just rotate the full lines slowly.
      setText(lines[0]);
      let line = 0;
      const cycle = () => {
        line = (line + 1) % lines.length;
        setText(lines[line]);
        schedule(cycle, 2600);
      };
      schedule(cycle, 2600);
      return () => {
        cancelled = true;
        if (timerRef.current) clearTimeout(timerRef.current);
      };
    }

    const step = () => {
      const stream = streamRef.current;
      const ch = stream[posRef.current % stream.length];
      posRef.current += 1;
      bufferRef.current += ch;
      if (bufferRef.current.length > MAX_FAKE_VISIBLE_CHARS) {
        bufferRef.current = bufferRef.current.slice(-MAX_FAKE_VISIBLE_CHARS);
      }
      setText(bufferRef.current);

      const r = Math.random();
      let delay = 15 + Math.random() * 25; // 15-40ms for natural typing
      if (r < 0.05) {
        // Occasional hesitation — “卡顿”.
        delay = 300 + Math.random() * 500;
      }
      schedule(step, delay);
    };
    step();

    return () => {
      cancelled = true;
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [variant, reduce, lines]);

  return text;
}

function StreamingSectionCard({
  section,
  index,
  reduce,
  isComplete,
}: {
  section: StreamingSection;
  index: number;
  reduce: boolean | null;
  isComplete?: boolean;
}) {
  const isThinking = section.label === "思考中";
  const accentColor = isThinking ? "var(--cobalt)" : "var(--purple)";

  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, x: -16, y: 8 }}
      animate={{ opacity: 1, x: 0, y: 0 }}
      transition={{
        duration: 0.45,
        delay: index * 0.12,
        ease: [0.16, 1, 0.3, 1],
      }}
      className="border-l-4 bg-paper-raised px-4 py-3 shadow-sm md:px-5 md:py-4"
      style={{ borderLeftColor: accentColor }}
    >
      <div className="mb-1 text-xs font-medium uppercase tracking-wide text-ink-muted/70">
        {section.label}
      </div>
      <p className="font-serif text-base leading-snug text-ink">
        <TypewriterText text={section.text} hideCursor={isComplete} />
      </p>
    </motion.div>
  );
}

function TypewriterText({ text, cps = 45, hideCursor }: { text: string; cps?: number; hideCursor?: boolean }) {
  const revealed = useTypewriter(text, cps);
  return (
    <>
      {revealed}
      {!hideCursor && revealed.length < text.length && (
        <span className="animate-pulse text-cobalt/50">▎</span>
      )}
    </>
  );
}

/**
 * Typewriter hook for fake-streaming non-SSE content (final plan).
 * Reveals text character by character at a fixed rate.
 */
export function useTypewriter(text: string, cps: number = 40): string {
  const [revealed, setRevealed] = useState("");
  // Tracks the text already shown so that when `text` grows (streaming
  // partial updates), the typewriter continues from the revealed prefix
  // instead of restarting from scratch.
  const revealedRef = useRef("");
  const rafRef = useRef<number | null>(null);
  const startRef = useRef<number | null>(null);
  const reduce = useReducedMotion();

  useEffect(() => {
    if (!text) {
      revealedRef.current = "";
      setRevealed("");
      return;
    }
    if (reduce) {
      revealedRef.current = text;
      setRevealed(text);
      return;
    }
    // Continue from the already-revealed prefix when the new text extends
    // it; otherwise (text changed entirely) restart from zero.
    const base = text.startsWith(revealedRef.current) ? revealedRef.current : "";
    revealedRef.current = base;
    setRevealed(base);
    startRef.current = null;
    const interval = Math.max(1000 / cps, 14);

    const tick = (now: number) => {
      if (startRef.current === null) startRef.current = now;
      const elapsed = now - startRef.current;
      const chars = base.length + Math.floor(elapsed / interval);
      if (chars >= text.length) {
        revealedRef.current = text;
        setRevealed(text);
        rafRef.current = null;
        return;
      }
      revealedRef.current = text.slice(0, chars);
      setRevealed(revealedRef.current);
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [text, cps, reduce]);

  return revealed;
}
