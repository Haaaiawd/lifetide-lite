"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { motion, useReducedMotion } from "motion/react";
import { LoadingProgress } from "@/components/LoadingProgress";
import { RouteCarousel } from "@/components/routes/RouteCarousel";
import { Conversation, type ConversationItem } from "@/components/play/Conversation";
import { WaitingBubble } from "@/components/play/WaitingBubble";
import { GenerationOverlay } from "@/components/play/GenerationOverlay";
import { PortraitCard } from "@/components/portrait/PortraitCard";
import { StarPrompt } from "@/components/StarPrompt";
import type { Route } from "@/lib/fixtures";
import { toInsightView } from "@/lib/plans/insight-view";
import { toRouteView } from "@/lib/plans/route-view";
import type { InterviewQuestion, ImmediateInsight, ParallelLife, FinalPlan } from "@/lib/working-memory/types";
import type { PersonaPortrait } from "@/lib/portrait/types";

const REQUIRED_CONSENTS = [{ type: "ai", given: true }];

type Step = "loading" | "auth" | "resume" | "consent" | "question" | "insight" | "material" | "stop" | "portrait" | "routes" | "waiting" | "portrait_overlay" | "final_overlay";

// Shared SSE reader: forwards `partial` events to onPartial, captures `done`
// data, and — crucially — does not swallow `error` events. An `error` event
// or a stream that ends without `done` throws, so callers can surface a
// visible error bar with a retry button instead of hanging.
async function readSseStream<TDone>(
  res: Response,
  onPartial: (data: Record<string, unknown>) => void
): Promise<TDone> {
  if (!res.body) throw new Error("No response body");
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let doneData: TDone | null = null;
  let streamError: string | null = null;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    // Parse SSE events from buffer
    const events = buffer.split("\n\n");
    buffer = events.pop() ?? "";

    for (const eventBlock of events) {
      const lines = eventBlock.split("\n");
      let eventType = "";
      let dataLine = "";
      for (const line of lines) {
        if (line.startsWith("event: ")) eventType = line.slice(7);
        else if (line.startsWith("data: ")) dataLine = line.slice(6);
      }
      if (!eventType || !dataLine) continue;

      try {
        const data = JSON.parse(dataLine);
        if (eventType === "partial") {
          onPartial(data);
        } else if (eventType === "done") {
          doneData = data as TDone;
        } else if (eventType === "error") {
          streamError = typeof data?.error === "string" ? data.error : "Stream error";
        }
      } catch {
        // Ignore malformed events
      }
    }
  }

  if (streamError) throw new Error(streamError);
  if (!doneData) throw new Error("Stream ended without done event");
  return doneData;
}

type ProgressInfo = {
  waveIndex: number;
  hasPortrait: boolean;
  hasFinalPlan: boolean;
  hasPendingInsight: boolean;
  hasStreamingInsight: boolean;
  hasPendingWave: boolean;
  pendingWaveId: string | null;
  pendingWaveIndex: number | null;
  pendingWaveQuestions: InterviewQuestion[] | null;
  lastStep: "fresh" | "question" | "stop" | "portrait" | "routes" | "insight";
  lastInsight: ImmediateInsight | null;
  streamingInsight: Partial<ImmediateInsight> | null;
};

export default function PlayPage() {
  const reduce = useReducedMotion();
  const router = useRouter();
  const [step, setStep] = useState<Step>("loading");
  const [items, setItems] = useState<ConversationItem[]>([]);
  const [questions, setQuestions] = useState<InterviewQuestion[]>([]);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, { value?: string | string[] | number; skipped: boolean }>>({});
  const [waveIndex, setWaveIndex] = useState(1);
  const [waveId, setWaveId] = useState<string>("w1");
  const [insight, setInsight] = useState<ImmediateInsight | null>(null);
  const [routes, setRoutes] = useState<Route[] | null>(null);
  const [framing, setFraming] = useState<string | null>(null);
  const [blueprint, setBlueprint] = useState<{ current_coordinate: string; key_tensions: string[]; recurring_elements: string[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Error bar shown inside the conversation view (waiting step) when an
  // SSE stream or wave fetch fails — carries its own retry action.
  const [streamError, setStreamError] = useState<{ message: string; retry: () => void } | null>(null);
  // Wave whose insight synthesis was interrupted mid-stream (resume path) —
  // when set, the insight step shows an exit bar with resubmit/continue.
  const [interruptedWaveId, setInterruptedWaveId] = useState<string | null>(null);
  const [badgeExpanded, setBadgeExpanded] = useState(false);
  const [waitingVariant, setWaitingVariant] = useState<"insight" | "final" | "wave" | "portrait">("insight");
  const [streamingInsight, setStreamingInsight] = useState<{ user_told_me?: string; current_reading?: string; important_unknown?: string } | null>(null);
  const [portrait, setPortrait] = useState<PersonaPortrait | null>(null);
  const [canGenerate, setCanGenerate] = useState<boolean>(true);
  const [streamingPortrait, setStreamingPortrait] = useState<{ essence?: string; trait_summary?: string } | null>(null);
  const [portraitError, setPortraitError] = useState<{ message: string; retry: () => void } | null>(null);
  const [progressInfo, setProgressInfo] = useState<ProgressInfo | null>(null);
  const hasLoadedRef = useRef(false);

  // Reset the floating badge when step/wave changes so it doesn't
  // reappear in an already-expanded state.
  useEffect(() => {
    setBadgeExpanded(false);
  }, [step, waveIndex, interruptedWaveId]);

  // Prefetch: after insight is done, we fire GET /api/wave in the background
  // so the next wave's questions are ready by the time the user clicks continue.
  // The promise is stored in a ref; the result is cached in prefetchedWave.
  const prefetchRef = useRef<Promise<{ questions: InterviewQuestion[]; wave_id: string; wave_index: number; stop?: boolean } | null> | null>(null);

  useEffect(() => {
    if (hasLoadedRef.current) return;
    hasLoadedRef.current = true;

    // 1. Check auth + progress
    fetch("/api/progress")
      .then((r) => {
        if (r.status === 401) {
          // Not authenticated — redirect to login
          window.location.href = "/login";
          return null;
        }
        return r.json();
      })
      .then((data) => {
        if (!data) return;

        // Not authenticated (guest fallback in API but we require auth for /play)
        if (!data.authenticated) {
          window.location.href = "/login";
          return;
        }

        const progress = data.progress as ProgressInfo;
        setProgressInfo(progress);

        // If user has progress, show resume prompt
        if (progress.lastStep !== "fresh") {
          setStep("resume");
        } else {
          // Fresh user — start consent flow
          loadWave(true);
        }
      })
      .catch(() => {
        setError("加载进度失败，请检查网络后重试");
        setStep("consent");
      });
  }, []);

  function newId(): string {
    if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
      return crypto.randomUUID();
    }
    return Math.random().toString(36).slice(2) + Date.now().toString(36);
  }

  const appendItem = (item: ConversationItem) => {
    setItems((prev) => [...prev, item]);
  };

  const replaceActiveQuestion = (answeredId: string, answerValue: string | string[] | number, skipped: boolean) => {
    setItems((prev) =>
      prev.map((it) =>
        it.id === answeredId && it.type === "question"
          ? { ...it, isActive: false, answer: { value: answerValue, skipped } }
          : it
      )
    );
  };

  // Helper: apply wave data to state and render first question
  const applyWaveData = (data: { questions: InterviewQuestion[]; wave_id: string; wave_index: number }) => {
    setQuestions(data.questions);
    setWaveIndex(data.wave_index);
    setWaveId(data.wave_id);
    setQuestionIndex(0);
    setAnswers({});
    setInsight(null);

    appendItem({
      id: newId(),
      type: "bot",
      text: data.wave_index === 3
        ? `第 3 波。聊到第 6 波你可以自主结束并生成画像，建议聊到第 8 波自动进入画像——现在还早，慢慢来。`
        : `第 ${data.wave_index} 波，来看看几个关键问题。`,
    });

    if (data.questions.length > 0) {
      appendItem({
        id: newId(),
        type: "question",
        question: data.questions[0],
        total: data.questions.length,
        isActive: true,
      });
    }

    setStep("question");
  };

  // Fire a prefetch GET /api/wave and store the promise.
  // Called right after insight is shown, so the next wave generates
  // while the user is still reading.
  const startPrefetch = () => {
    if (prefetchRef.current) return;
    prefetchRef.current = fetch("/api/wave?prefetch=1")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!data || data.stop) return null;
        return data as { questions: InterviewQuestion[]; wave_id: string; wave_index: number };
      })
      .catch(() => null);
  };

  const loadWave = async (isInitial = false) => {
    setStreamError(null);
    // Initial load uses full-screen loading (no conversation to show yet).
    // Subsequent loads use the waiting animation at the bottom of the conversation.
    if (isInitial) {
      setStep("loading");
    }

    // If a prefetch is in flight, wait for it with a waiting animation.
    if (prefetchRef.current) {
      setWaitingVariant("wave");
      setStep("waiting");
      try {
        const data = await prefetchRef.current;
        prefetchRef.current = null;
        if (data) {
          applyWaveData(data);
          return;
        }
        // Prefetch returned stop or null — fall through to normal fetch
      } catch {
        prefetchRef.current = null;
        // Fall through to normal fetch
      }
    }

    // No prefetch available — fetch with waiting animation.
    // Use prefetch=1 so that awaiting_calibration state (which occurs after
    // a wave's insight is committed) allows generating the next wave.
    // Without this, resuming a session or clicking "继续下一波" from the stop
    // page would get stuck returning stop:true forever.
    setWaitingVariant("wave");
    setStep("waiting");
    try {
      const res = await fetch("/api/wave?prefetch=1");
      if (res.status === 403) {
        setStep("consent");
        return;
      }
      if (!res.ok) throw new Error(`Failed to load wave: ${res.status}`);
      const data = await res.json();

      if (data.stop) {
        const wIdx = data.wave_index ?? waveIndex;
        setWaveIndex(wIdx);
        setCanGenerate(data.can_generate !== false);
        appendItem({
          id: newId(),
          type: "bot",
          text: data.can_generate
            ? wIdx >= 8
              ? `已经聊完 ${wIdx} 波，六维观察已经充分收集。现在可以生成个人画像了。`
              : `已经聊了 ${wIdx} 波，可以生成个人画像了，也可以继续聊到 8 波让理解更完整。`
            : "我们再补充一轮，可能会更清楚。",
        });
        setStep("stop");
        return;
      }

      applyWaveData(data);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      // Surface a visible, retryable error inside the conversation view
      // instead of silently bouncing to a wrong step (e.g. consent).
      setStep("waiting");
      setStreamError({ message, retry: () => { setStreamError(null); loadWave(); } });
    }
  };

  const currentQuestion = questions[questionIndex];

  // Shared success path after a wave's insight stream completes: show the
  // insight card and prefetch the next wave while the user reads.
  const finishInsight = (doneData: { wave_id: string; wave_index: number; revision: number; insight: ImmediateInsight }) => {
    const insightView = toInsightView(doneData.insight, doneData.wave_index);
    setInsight(doneData.insight);
    setWaveIndex(doneData.wave_index);
    setStreamingInsight(null);
    setInterruptedWaveId(null);

    // Remove any previous ACTIVE or READONLY insight items (e.g. a
    // readonly partial from a streaming resume) so the conversation
    // doesn't end up with two active insight cards after a resubmit.
    // Inactive historical insight cards are preserved.
    setItems((prev) => prev.filter((item) => !(item.type === "insight" && (item.isActive || item.readonly))));

    appendItem({
      id: newId(),
      type: "bot",
      text: "好，我已经整理好一条理解，你看看哪里需要调：",
    });
    appendItem({
      id: newId(),
      type: "insight",
      insight: insightView,
      isActive: true,
    });

    setStep("insight");

    // Start prefetching the next wave while the user reads the insight.
    // The server allows GET during awaiting_calibration state.
    startPrefetch();
  };

  const submitWave = async (answerState?: Record<string, { value?: string | string[] | number; skipped: boolean }>) => {
    if (!currentQuestion) return;
    setWaitingVariant("insight");
    setStreamingInsight(null);
    setStreamError(null);
    setStep("waiting");
    // Use the passed answerState if available — advance() calls submitWave
    // immediately after setAnswers, and the closure `answers` may not have
    // updated yet (React state updates are async). Without this, the last
    // question's answer can be silently dropped.
    const currentAnswers = answerState ?? answers;
    const payload = {
      wave_id: currentQuestion.wave_id,
      answers: questions.map((q) => ({
        question_id: q.id,
        value: currentAnswers[q.id]?.value,
        skipped: currentAnswers[q.id]?.skipped ?? false,
      })),
    };

    try {
      const res = await fetch("/api/wave", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? `Wave submission failed: ${res.status}`);
      }

      const doneData = await readSseStream<{
        wave_id: string;
        wave_index: number;
        revision: number;
        insight: ImmediateInsight;
      }>(res, (d) => setStreamingInsight(d as { user_told_me?: string; current_reading?: string; important_unknown?: string }));
      finishInsight(doneData);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      setStreamingInsight(null);
      // Stay on the waiting step and show a visible error bar with retry —
      // bouncing back to "question" left no actionable control and looked
      // like the UI had hung (the Wave 6 deadlock).
      setStreamError({ message, retry: () => { setStreamError(null); submitWave(); } });
    }
  };

  // Resubmit a wave whose synthesis was interrupted (e.g. the user refreshed
  // mid-stream). The server already has the answers — `resubmit` tells it to
  // reuse them and re-run synthesis instead of requiring fresh answers.
  const resubmitWave = async (wId: string) => {
    setWaitingVariant("insight");
    setStreamingInsight(null);
    setStreamError(null);
    setStep("waiting");
    try {
      const res = await fetch("/api/wave", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ wave_id: wId, answers: [], resubmit: true }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? `Wave resubmission failed: ${res.status}`);
      }

      const doneData = await readSseStream<{
        wave_id: string;
        wave_index: number;
        revision: number;
        insight: ImmediateInsight;
      }>(res, (d) => setStreamingInsight(d as { user_told_me?: string; current_reading?: string; important_unknown?: string }));
      finishInsight(doneData);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      setStreamingInsight(null);
      setStreamError({ message, retry: () => { setStreamError(null); resubmitWave(wId); } });
    }
  };

  const advance = (nextAnswers: Record<string, { value?: string | string[] | number; skipped: boolean }>) => {
    if (!currentQuestion) return;

    if (questionIndex < questions.length - 1) {
      const next = questions[questionIndex + 1];
      appendItem({
        id: newId(),
        type: "question",
        question: next,
        total: questions.length,
        isActive: true,
      });
      setQuestionIndex((i) => i + 1);
    } else {
      submitWave(nextAnswers);
    }
  };

  const handleQuestionSubmit = (id: string, value: string | string[] | number) => {
    if (!currentQuestion) return;
    replaceActiveQuestion(id, value, false);
    const nextAnswers = { ...answers, [currentQuestion.id]: { value, skipped: false } };
    setAnswers(nextAnswers);
    advance(nextAnswers);
  };

  const handleQuestionSkip = (id: string) => {
    if (!currentQuestion) return;
    replaceActiveQuestion(id, "", true);
    const nextAnswers = { ...answers, [currentQuestion.id]: { skipped: true } };
    setAnswers(nextAnswers);
    advance(nextAnswers);
  };

  const handleQuestionBack = () => {
    if (questionIndex === 0) return;
    // Remove the current active question item (it hasn't been answered yet)
    // and re-activate the previous question, keeping its old answer so the
    // user can edit it rather than re-answer from scratch.
    setItems((prev) => {
      const lastQuestionIdx = [...prev].reverse().findIndex((it) => it.type === "question");
      if (lastQuestionIdx === -1) return prev;
      const actualIdx = prev.length - 1 - lastQuestionIdx;
      let prevQuestionIdx = -1;
      for (let i = actualIdx - 1; i >= 0; i--) {
        if (prev[i].type === "question") {
          prevQuestionIdx = i;
          break;
        }
      }
      if (prevQuestionIdx === -1) return prev;
      return prev.map((it, i) => {
        if (i === actualIdx) return null; // remove current unanswered question
        if (i === prevQuestionIdx && it.type === "question") {
          // Re-activate but keep the old answer so QuestionFrame can pre-fill it
          return { ...it, isActive: true };
        }
        return it;
      }).filter(Boolean) as typeof prev;
    });
    setQuestionIndex((i) => i - 1);
  };

  const handleInsightContinue = async (
    id: string,
    feedback: { accuracy: "accurate" | "partial" | "inaccurate"; note: string; direction: string }
  ) => {
    if (!insight) return;

    setItems((prev) =>
      prev.map((it) =>
        it.id === id && it.type === "insight"
          ? { ...it, isActive: false, feedback: { accuracy: feedback.accuracy, note: feedback.note } }
          : it
      )
    );

    appendItem({
      id: newId(),
      type: "user",
      text: `我标记为：${feedback.accuracy}${feedback.note ? ` · ${feedback.note}` : ""}${feedback.direction ? ` · 想继续：${feedback.direction}` : ""}`,
    });

    setWaitingVariant("wave");
    setStep("waiting");
    try {
      await fetch("/api/feedback", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          wave_id: waveId,
          verdict: feedback.accuracy,
          correction: feedback.note,
          next_interest: feedback.direction,
        }),
      });

      if (waveIndex === 1) {
        appendItem({
          id: newId(),
          type: "bot",
          text: "如果愿意，可以上传文件或粘贴文字，帮助我进一步理解你。",
        });
        appendItem({
          id: newId(),
          type: "material",
          isActive: true,
        });
        setStep("material");
        return;
      }

      await loadWave();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      // Stay on the waiting step with a visible retry — going back to the
      // insight step would leave the insight card inactive with no exit.
      setStep("waiting");
      setStreamError({ message, retry: () => { setStreamError(null); handleInsightContinue(id, feedback); } });
    }
  };

  const handleMaterialSubmit = (id: string, material: { uploadIds: string[]; pastedText?: string }) => {
    setItems((prev) =>
      prev.map((it) =>
        it.id === id && it.type === "material" ? { ...it, isActive: false, uploadIds: material.uploadIds, pastedText: material.pastedText } : it
      )
    );
    loadWave();
  };

  const handleMaterialSkip = (id: string) => {
    setItems((prev) =>
      prev.map((it) =>
        it.id === id && it.type === "material" ? { ...it, isActive: false } : it
      )
    );
    loadWave();
  };

  // Generate persona portrait via SSE, then show portrait card.
  // User clicks "继续生成路线" on the portrait to proceed to final plan.
  // Uses a full-screen overlay with walking animation + streaming text.
  const portraitAbortRef = useRef<AbortController | null>(null);
  const isGeneratingRef = useRef(false);
  const [portraitComplete, setPortraitComplete] = useState(false);
  const portraitDoneDataRef = useRef<{ portrait: PersonaPortrait } | null>(null);
  const handlePortraitDone = useCallback(() => {
    const doneData = portraitDoneDataRef.current;
    if (!doneData) return;
    portraitDoneDataRef.current = null;
    setPortrait(doneData.portrait);
    setStreamingPortrait(null);
    setPortraitComplete(false);
    setStep("portrait");
  }, []);
  const handleGenerateFinal = async () => {
    if (isGeneratingRef.current) return;
    isGeneratingRef.current = true;
    // Abort any previous in-flight generation.
    portraitAbortRef.current?.abort();
    const ac = new AbortController();
    portraitAbortRef.current = ac;

    setBadgeExpanded(false);
    setStreamingPortrait(null);
    setPortraitError(null);
    setPortraitComplete(false);
    portraitDoneDataRef.current = null;
    setStep("portrait_overlay");
    try {
      const res = await fetch("/api/portrait", { method: "POST", signal: ac.signal });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? `Portrait generation failed: ${res.status}`);
      }

      const doneData = await readSseStream<{ portrait: PersonaPortrait }>(
        res,
        (d) => { if (!ac.signal.aborted) setStreamingPortrait(d as { essence?: string; trait_summary?: string }); }
      );
      if (ac.signal.aborted) return;

      portraitDoneDataRef.current = doneData;
      setPortraitComplete(true);
    } catch (err) {
      if (ac.signal.aborted) return;
      const message = err instanceof Error ? err.message : "Unknown error";
      setStreamingPortrait(null);
      setPortraitError({ message, retry: () => { setPortraitError(null); handleGenerateFinal(); } });
    } finally {
      isGeneratingRef.current = false;
    }
  };

  // After portrait is shown, user clicks "继续" to generate the final plan.
  // Uses full-screen overlay with walking animation, then shows results.
  const [finalOverlayError, setFinalOverlayError] = useState<string | null>(null);
  const [streamingFinal, setStreamingFinal] = useState<Array<{ label: string; text: string }> | null>(null);
  const [finalComplete, setFinalComplete] = useState(false);
  const finalDoneDataRef = useRef<FinalPlan | null>(null);
  const finalAbortRef = useRef<AbortController | null>(null);
  const handleFinalComplete = useCallback(() => {
    const doneData = finalDoneDataRef.current;
    if (!doneData) return;
    finalDoneDataRef.current = null;
    const lives: ParallelLife[] = doneData.lives ?? [];
    setRoutes(lives.map((life, i) => toRouteView(life, i)));
    setFraming(doneData.framing ?? null);
    setBlueprint(doneData.blueprint ?? null);
    setStreamingFinal(null);
    setFinalComplete(false);
    setStep("routes");
  }, []);
  const handlePortraitContinue = async () => {
    if (isGeneratingRef.current) return;
    isGeneratingRef.current = true;
    finalAbortRef.current?.abort();
    const ac = new AbortController();
    finalAbortRef.current = ac;

    setFinalOverlayError(null);
    setStreamingFinal(null);
    setFinalComplete(false);
    finalDoneDataRef.current = null;
    setStep("final_overlay");
    try {
      const res = await fetch("/api/final", { method: "POST", signal: ac.signal });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? `生成失败（${res.status}）`);
      }

      const doneData = await readSseStream<FinalPlan>(
        res,
        (d) => {
          if (ac.signal.aborted) return;
          const partial = d as { sections?: Array<{ label: string; text: string }> };
          if (partial.sections) setStreamingFinal(partial.sections);
        }
      );
      if (ac.signal.aborted) return;

      finalDoneDataRef.current = doneData;
      setFinalComplete(true);
    } catch (err) {
      if (ac.signal.aborted) return;
      const msg = err instanceof Error ? err.message : "Unknown error";
      setStreamingFinal(null);
      setFinalOverlayError(msg);
    } finally {
      isGeneratingRef.current = false;
    }
  };

  const handleReset = async () => {
    try {
      await fetch("/api/session/reset", { method: "POST" });
    } catch {
      // ignore
    }
    window.location.reload();
  };

  if (step === "loading") {
    return <LoadingProgress />;
  }

  if (step === "resume" && progressInfo) {
    const stepLabel: Record<string, string> = {
      question: "正在回答问题",
      insight: "正在查看即时理解",
      stop: "可以生成画像了",
      portrait: "已生成人格画像",
      routes: "已生成三条路线",
      fresh: "刚开始",
    };

    const handleContinue = async () => {
      setStep("loading");
      // Restore state based on progress — order matters:
      // routes > portrait > insight > stop > fresh
      if (progressInfo.hasFinalPlan) {
        // Load final plan and show routes
        try {
          const res = await fetch("/api/final");
          if (res.ok) {
            const data = await res.json();
            if (data.lives) {
              const lives = data.lives as ParallelLife[];
              setRoutes(lives.map((life, i) => toRouteView(life, i)));
              setFraming(data.framing ?? null);
              setBlueprint(data.blueprint ?? null);
              setStep("routes");
              return;
            }
          }
        } catch { /* fall through to next resume branch */ }
      }
      if (progressInfo.hasPortrait) {
        // Load portrait and show portrait step
        try {
          const res = await fetch("/api/portrait");
          if (res.ok) {
            const data = await res.json();
            if (data.portrait) {
              setPortrait(data.portrait as PersonaPortrait);
              setStep("portrait");
              return;
            }
          }
        } catch { /* fall through to next resume branch */ }
      }
      // Restore insight page — user was viewing the immediate insight
      // when they refreshed. Restore the insight content and let them
      // calibrate (accurate/partly/inaccurate) or continue.
      // This takes priority over streaming_insight — a completed insight
      // should not be shadowed by a stale partial from a prior interruption.
      if (progressInfo.hasPendingInsight && progressInfo.lastInsight) {
        const insightView = toInsightView(progressInfo.lastInsight, progressInfo.waveIndex);
        setInsight(progressInfo.lastInsight);
        setWaveIndex(progressInfo.waveIndex);
        setWaveId(`w${progressInfo.waveIndex}`);
        const resumeItems: ConversationItem[] = [
          { id: newId(), type: "bot", text: "好，我已经整理好一条理解，你看看哪里需要调：" },
        ];
        if (progressInfo.pendingWaveQuestions) {
          const total = progressInfo.pendingWaveQuestions.length;
          resumeItems.push(
            ...progressInfo.pendingWaveQuestions.map((q) => ({
              id: newId(),
              type: "question" as const,
              question: q,
              total,
              isActive: false,
              answer: { value: "已回答", skipped: false },
            }))
          );
        }
        resumeItems.push({ id: newId(), type: "insight", insight: insightView, isActive: true });
        setItems(resumeItems);
        setStep("insight");
        return;
      }

      // Restore a partial insight that was being streamed when the user left.
      // The synthesis is incomplete, so we show the card but no calibration.
      if (progressInfo.hasStreamingInsight && progressInfo.streamingInsight) {
        // The interrupted wave is the pending one (last_wave_index + 1),
        // not the last completed wave.
        const interruptedIdx = progressInfo.pendingWaveIndex ?? progressInfo.waveIndex + 1;
        const interruptedId = progressInfo.pendingWaveId ?? `w${interruptedIdx}`;
        const insightView = toInsightView(progressInfo.streamingInsight, interruptedIdx);
        setInsight(progressInfo.streamingInsight as ImmediateInsight);
        setWaveIndex(interruptedIdx);
        setWaveId(interruptedId);
        const resumeItems: ConversationItem[] = [
          { id: newId(), type: "bot", text: "上次生成中断了，这条理解还没完成。" },
        ];
        if (progressInfo.pendingWaveQuestions) {
          const total = progressInfo.pendingWaveQuestions.length;
          resumeItems.push(
            ...progressInfo.pendingWaveQuestions.map((q) => ({
              id: newId(),
              type: "question" as const,
              question: q,
              total,
              isActive: false,
              answer: { value: "已回答", skipped: false },
            }))
          );
        }
        resumeItems.push({ id: newId(), type: "insight", insight: insightView, isActive: true, readonly: true });
        setItems(resumeItems);
        setInterruptedWaveId(interruptedId);
        setStep("insight");
        return;
      }
      // Restore mid-wave question view — a wave was generated but not
      // yet submitted. Send the user back to answering questions instead
      // of jumping to the stop page.
      if (progressInfo.hasPendingWave && progressInfo.pendingWaveQuestions && progressInfo.pendingWaveId) {
        const pwIndex = progressInfo.pendingWaveIndex ?? 0;
        setQuestions(progressInfo.pendingWaveQuestions);
        setWaveIndex(pwIndex);
        setWaveId(progressInfo.pendingWaveId);
        setQuestionIndex(0);
        setAnswers({});
        setInsight(null);
        setItems([
          { id: newId(), type: "bot", text: pwIndex === 3
            ? `第 3 波。聊到第 6 波你可以自主结束并生成画像，建议聊到第 8 波自动进入画像——现在还早，慢慢来。`
            : `第 ${pwIndex} 波，继续回答几个关键问题。` },
        ]);
        if (progressInfo.pendingWaveQuestions.length > 0) {
          setItems((prev) => [
            ...prev,
            { id: newId(), type: "question", question: progressInfo.pendingWaveQuestions![0], total: progressInfo.pendingWaveQuestions!.length, isActive: true },
          ]);
        }
        setStep("question");
        return;
      }
      // Otherwise go to stop (can generate portrait)
      if (progressInfo.waveIndex > 0) {
        setWaveIndex(progressInfo.waveIndex);
        appendItem({
          id: newId(),
          type: "bot",
          text: `已经聊了 ${progressInfo.waveIndex} 波，可以生成个人画像了，也可以继续补充。`,
        });
        setStep("stop");
        return;
      }
      // Fallback: fresh start
      loadWave(true);
    };

    const handleRestart = async () => {
      setStep("loading");
      try {
        await fetch("/api/progress/reset", { method: "POST" });
        setProgressInfo(null);
        setPortrait(null);
        setRoutes(null);
        setItems([]);
        setInsight(null);
        setInterruptedWaveId(null);
        loadWave(true);
      } catch {
        setError("重置失败，请重试");
        setStep("resume");
      }
    };

    return (
      <motion.div
        initial={reduce ? false : { opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
        className="mx-auto flex w-full max-w-2xl min-h-[100dvh] flex-col items-center justify-center gap-6 p-6"
      >
        <div className="border-2 border-ink bg-paper-raised p-6 shadow-md w-full">
          <h1 className="font-serif text-xl mb-2">欢迎回来</h1>
          <p className="text-sm text-ink-muted mb-4">
            你上次做到了 <span className="font-medium text-ink">第 {progressInfo.waveIndex} 波</span>
            {progressInfo.hasPortrait && " · 已生成画像"}
            {progressInfo.hasFinalPlan && " · 已生成路线"}
            ，状态：{stepLabel[progressInfo.lastStep] ?? "进行中"}。
          </p>
          <div className="flex flex-col gap-3">
            <button
              type="button"
              onClick={handleContinue}
              className="w-full border-2 border-ink bg-cobalt px-5 py-3 text-base font-medium text-white shadow-md transition-transform active:translate-x-[2px] active:translate-y-[2px] active:shadow-sm"
            >
              继续上次
            </button>
            <button
              type="button"
              onClick={handleRestart}
              className="w-full border-2 border-ink bg-white px-5 py-3 text-base font-medium text-ink shadow-md transition-transform active:translate-x-[2px] active:translate-y-[2px] active:shadow-sm"
            >
              从头开始新一轮
            </button>
          </div>
        </div>
      </motion.div>
    );
  }

  if (step === "consent") {
    const handleConsent = async () => {
      setStep("loading");
      try {
        const res = await fetch("/api/session/consent", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ consents: REQUIRED_CONSENTS }),
        });
        if (!res.ok) throw new Error(`Consent failed: ${res.status}`);
        window.location.reload();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unknown error");
        setStep("consent");
      }
    };

    return (
      <div className="mx-auto flex w-full max-w-2xl min-h-[100dvh] flex-col items-center justify-center gap-4 p-6">
        <h1 className="font-serif text-2xl">开始之前</h1>
        <p className="text-center text-ink-muted">
          人生试运行需要你的同意才能处理回答并生成暂定理解。上传材料完全可选。
        </p>
        <button
          type="button"
          onClick={handleConsent}
          className="border-2 border-ink bg-cobalt px-6 py-4 text-lg font-medium text-white shadow-md transition-transform active:translate-x-[2px] active:translate-y-[2px] active:shadow-sm hover:shadow-md"
        >
          同意 AI 处理我的回答，继续（上传材料稍后可选）
        </button>
        <button
          type="button"
          onClick={handleReset}
          className="text-sm text-ink-muted underline underline-offset-2 hover:text-cobalt"
        >
          卡住或想重新测试？清除当前会话
        </button>
        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>
    );
  }

  if (step === "portrait" && portrait) {
    return (
      <div className="mx-auto w-full max-w-2xl px-4 py-6">
        <PortraitCard portrait={portrait} />
        <div className="mt-6 flex flex-col gap-3">
          {error && (
            <div className="border-2 border-red-600 bg-red-50 p-4">
              <p className="text-sm text-red-700">{error}</p>
              <button
                type="button"
                onClick={() => { setError(null); handlePortraitContinue(); }}
                className="mt-3 border-2 border-red-600 bg-white px-4 py-2 text-sm font-medium text-red-700 shadow-sm transition-transform active:translate-x-[1px] active:translate-y-[1px] active:shadow-sm"
              >
                重新生成
              </button>
            </div>
          )}
          {!error && (
            <button
              type="button"
              onClick={handlePortraitContinue}
              className="w-full border-2 border-ink bg-cobalt px-5 py-3.5 text-center text-base font-medium text-white shadow-md transition-transform active:translate-x-[2px] active:translate-y-[2px] active:shadow-sm hover:shadow-md"
            >
              看完了，继续生成三条路线
            </button>
          )}
          <StarPrompt className="mt-1" />
          <button
            type="button"
            onClick={handleReset}
            className="text-sm text-ink-muted underline underline-offset-2 hover:text-cobalt"
          >
            从头开始新一轮
          </button>
        </div>
      </div>
    );
  }

  if (step === "routes" && routes) {
    return (
      <div>
        <RouteCarousel
          routes={routes}
          framing={framing ?? undefined}
          blueprint={blueprint ?? undefined}
          onNavigate={(routeId) => router.push(`/play/life/${routeId}`)}
        />
        <div className="mx-auto max-w-5xl px-4 pb-12">
          <StarPrompt />
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto flex h-[100dvh] w-full max-w-2xl flex-col overflow-hidden">
      <Conversation
        items={items}
        onQuestionSubmit={handleQuestionSubmit}
        onQuestionSkip={handleQuestionSkip}
        onQuestionBack={handleQuestionBack}
        onInsightContinue={handleInsightContinue}
        onMaterialSubmit={handleMaterialSubmit}
        onMaterialSkip={handleMaterialSkip}
        className={`flex-1 min-h-0 ${
          waveIndex >= 6 && (step === "insight" || step === "question") && !interruptedWaveId
            ? "pr-8"
            : ""
        }`}
      />

      {/* Portrait generation overlay — full screen */}
      {step === "portrait_overlay" && (
        <GenerationOverlay
          variant="portrait"
          title="生成人格画像"
          subtitle="把你说的所有话综合起来看……"
          streamingSections={
            streamingPortrait
              ? [
                  { label: "一句话", text: streamingPortrait.essence ?? "" },
                  { label: "特质概要", text: streamingPortrait.trait_summary ?? "" },
                ]
              : null
          }
          isComplete={portraitComplete}
          onComplete={handlePortraitDone}
          error={portraitError?.message ?? null}
          onRetry={portraitError?.retry}
          onCancel={() => { portraitAbortRef.current?.abort(); setPortraitError(null); setStep("stop"); }}
        />
      )}

      {/* Final plan generation overlay — full screen */}
      {step === "final_overlay" && (
        <GenerationOverlay
          variant="final"
          title="设计三条平行人生"
          subtitle="每条都得是一个真的能过的日子……"
          streamingSections={streamingFinal}
          isComplete={finalComplete}
          onComplete={handleFinalComplete}
          error={finalOverlayError}
          onRetry={() => { setFinalOverlayError(null); handlePortraitContinue(); }}
          onCancel={() => { finalAbortRef.current?.abort(); setFinalOverlayError(null); setStep("portrait"); }}
        />
      )}

      {step === "waiting" && (
        <div className="shrink-0 border-t-2 border-ink/10 bg-paper/50 p-4">
          {streamError ? (
            <div className="border-2 border-red-600 bg-red-50 p-4">
              <p className="text-sm text-red-700">{streamError.message}</p>
              <div className="mt-3 flex items-center gap-4">
                <button
                  type="button"
                  onClick={streamError.retry}
                  className="border-2 border-red-600 bg-white px-4 py-2 text-sm font-medium text-red-700 shadow-sm transition-transform active:translate-x-[1px] active:translate-y-[1px] active:shadow-sm"
                >
                  重试
                </button>
                <button
                  type="button"
                  onClick={handleReset}
                  className="text-sm text-ink-muted underline underline-offset-2 hover:text-cobalt"
                >
                  清除会话重新开始
                </button>
              </div>
            </div>
          ) : (
            <WaitingBubble variant={waitingVariant} streamingInsight={streamingInsight} streamingPortrait={streamingPortrait} />
          )}
        </div>
      )}

      {step === "insight" && interruptedWaveId && (
        <div className="shrink-0 border-t-2 border-ink bg-paper p-4">
          <p className="mb-3 text-center text-sm text-ink-muted">
            上次生成被中断了。你的回答还在，可以重新生成这条理解。
          </p>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => {
                const w = interruptedWaveId;
                setInterruptedWaveId(null);
                setItems((prev) => prev.filter((item) => item.type !== "insight"));
                resubmitWave(w);
              }}
              className="flex-1 border-2 border-ink bg-cobalt px-4 py-3 text-base font-medium text-white shadow-md transition-transform active:translate-x-[2px] active:translate-y-[2px] active:shadow-sm hover:shadow-md"
            >
              重新生成理解
            </button>
            <button
              type="button"
              onClick={async () => {
                setInterruptedWaveId(null);
                setStep("loading");
                try {
                  await fetch("/api/progress/reset", { method: "POST" });
                  setProgressInfo(null);
                  setPortrait(null);
                  setRoutes(null);
                  setItems([]);
                  setInsight(null);
                  loadWave(true);
                } catch {
                  setError("重置失败，请重试");
                  setStep("insight");
                }
              }}
              className="flex-1 border-2 border-ink bg-white px-4 py-3 text-base font-medium text-ink shadow-md transition-transform active:translate-x-[2px] active:translate-y-[2px] active:shadow-sm hover:shadow-md"
            >
              重新开始访谈
            </button>
          </div>
        </div>
      )}

      {step === "stop" && (
        <motion.div
          initial={reduce ? false : { y: 80, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
          className="shrink-0 border-t-2 border-ink bg-paper p-4"
        >
          <div className="flex flex-col gap-4 p-2">
            {waveIndex >= 8 ? (
              canGenerate ? (
                <p className="text-center text-ink-muted">
                  已经聊完 {waveIndex} 波，六维观察已经充分收集。现在可以生成个人画像了。
                </p>
              ) : (
                <p className="text-center text-ink-muted">
                  已经聊完 {waveIndex} 波。虽然观察还不够充分，但仍可尝试生成画像——结果可能不完整。
                </p>
              )
            ) : waveIndex >= 6 ? (
              <p className="text-center text-ink-muted">
                已经聊了 {waveIndex} 波，六维观察已经比较充分。你可以现在生成个人画像，也可以继续聊到 8 波让理解更完整。
              </p>
            ) : (
              <p className="text-center text-ink-muted">
                已经聊了 {waveIndex} 波。建议聊到 6 波后可以自主结束，8 波会自动进入画像生成。现在也可以提前生成，但理解可能不够完整。
              </p>
            )}
            <div className="flex gap-3">
              <button
                type="button"
                onClick={handleGenerateFinal}
                className="flex-1 border-2 border-ink bg-cobalt px-4 py-3 text-base font-medium text-white shadow-md transition-transform active:translate-x-[2px] active:translate-y-[2px] active:shadow-sm hover:shadow-md"
              >
                生成个人画像
              </button>
              {waveIndex < 8 && (
                <button
                  type="button"
                  onClick={() => loadWave()}
                  className="flex-1 border-2 border-ink bg-white px-4 py-3 text-base font-medium text-ink shadow-md transition-transform active:translate-x-[2px] active:translate-y-[2px] active:shadow-sm hover:shadow-md"
                >
                  继续下一波（{waveIndex}/8）
                </button>
              )}
            </div>
            <a
              href="/play/upload"
              className="text-center text-sm text-ink-muted underline underline-offset-2 hover:text-cobalt"
            >
              上传文件或粘贴文字（可选，帮助我更了解你）
            </a>
            <button
              type="button"
              onClick={handleReset}
              className="text-sm text-ink-muted underline underline-offset-2 hover:text-cobalt"
            >
              从头开始新一轮
            </button>
            {error && <p className="text-sm text-red-600">{error}</p>}
          </div>
        </motion.div>
      )}

      {/* Floating "生成画像" badge — visible from Wave 6 onwards
          during insight/question steps, so the user can choose to
          stop and generate a portrait without first clicking
          "继续下一波" to reach the stop page.
          Collapsed by default (only a sliver shows); expands on hover
          (desktop mouse only) or first tap (mobile). A second tap
          triggers the action. Uses pointer events with pointerType
          check so touch devices don't synthesize mouseenter and
          fire both expand + trigger in a single tap. */}
      {waveIndex >= 6 && (step === "insight" || step === "question") && !interruptedWaveId && (
        <button
          type="button"
          onPointerEnter={(e) => { if (e.pointerType === "mouse") setBadgeExpanded(true); }}
          onPointerLeave={(e) => { if (e.pointerType === "mouse") setBadgeExpanded(false); }}
          onClick={() => {
            if (!badgeExpanded) {
              setBadgeExpanded(true);
              return;
            }
            setBadgeExpanded(false);
            handleGenerateFinal();
          }}
          className={`fixed right-0 top-1/2 z-40 flex -translate-y-1/2 items-center overflow-hidden rounded-l-full border-2 border-r-0 py-3 pl-3 text-sm font-medium shadow-lg transition-all duration-300 ease-out ${
            badgeExpanded ? "pr-5" : "pr-3"
          } ${
            waveIndex >= 8
              ? "animate-pulse border-ink bg-cobalt text-white"
              : "border-ink bg-paper text-ink hover:bg-cobalt hover:text-white"
          }`}
          style={{ maxWidth: badgeExpanded ? "200px" : "1.75rem" }}
          title={
            waveIndex >= 8
              ? "已聊完 8 波，可以生成画像了"
              : `已聊 ${waveIndex} 波，可以生成画像，也可继续到 8 波`
          }
        >
          <span
            className="whitespace-nowrap transition-opacity duration-300"
            style={{ opacity: badgeExpanded ? 1 : 0 }}
          >
            生成画像
          </span>
        </button>
      )}
    </div>
  );
}
