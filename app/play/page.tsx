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

type Step = "loading" | "auth" | "resume" | "consent" | "question" | "insight" | "material" | "stop" | "review" | "portrait" | "routes" | "waiting" | "portrait_overlay" | "final_overlay";

// Shared SSE reader: forwards `partial` events to onPartial, captures `done`
// data, and — crucially — does not swallow `error` events. An `error` event
// or a stream that ends without `done` throws, so callers can surface a
// visible error bar with a retry button instead of hanging.
async function readSseStream<TDone>(
  res: Response,
  onPartial: (data: Record<string, unknown>) => void,
  onRetryProgress?: (data: { message: string; attempt: number; status: "retry" | "success" }) => void
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
        console.log("[readSseStream] event", {
          type: eventType,
          bytes: dataLine.length,
        });
        if (eventType === "partial") {
          onPartial(data);
        } else if (eventType === "done") {
          doneData = data as TDone;
        } else if (eventType === "error") {
          streamError = typeof data?.error === "string" ? data.error : "Stream error";
        } else if (eventType === "retry_progress" && onRetryProgress) {
          onRetryProgress(data as { message: string; attempt: number; status: "retry" | "success" });
        }
      } catch (err) {
        console.error("[readSseStream] failed to parse event", { eventType, err });
      }
    }
  }

  if (streamError) {
    console.error("[readSseStream] stream error event", streamError);
    throw new Error(streamError);
  }
  if (!doneData) {
    console.error("[readSseStream] stream ended without done event");
    throw new Error("Stream ended without done event");
  }
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
  const [confirmPortrait, setConfirmPortrait] = useState(false);
  const [waitingVariant, setWaitingVariant] = useState<"insight" | "final" | "wave" | "portrait">("insight");
  const [streamingInsight, setStreamingInsight] = useState<{ user_told_me?: string; current_reading?: string; important_unknown?: string } | null>(null);
  const [portrait, setPortrait] = useState<PersonaPortrait | null>(null);
  const [canGenerate, setCanGenerate] = useState<boolean>(true);
  const [streamingPortrait, setStreamingPortrait] = useState<{ thinking?: string; essence?: string; trait_summary?: string } | null>(null);
  const [portraitError, setPortraitError] = useState<{ message: string; retry: () => void } | null>(null);
  const [progressInfo, setProgressInfo] = useState<ProgressInfo | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [draftPrompt, setDraftPrompt] = useState<{ waveId: string; answers: Record<string, { value?: string | string[] | number; skipped: boolean }> } | null>(null);
  const hasLoadedRef = useRef(false);
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoSaveAbortRef = useRef<AbortController | null>(null);
  const draftRestoredRef = useRef(false);
  const draftAnswersRef = useRef<Record<string, { value?: string | string[] | number; skipped: boolean }>>({});

  // Prefetch: after insight is done, we fire GET /api/wave in the background
  // so the next wave's questions are ready by the time the user clicks continue.
  // The promise is stored in a ref; the result is cached in prefetchedWave.
  const prefetchRef = useRef<Promise<{ questions: InterviewQuestion[]; wave_id: string; wave_index: number; answers?: Record<string, { value?: string | string[] | number; skipped: boolean }>; stop?: boolean } | null> | null>(null);

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
        setSessionId(data.sessionId ?? null);

        // Surface a local draft restore prompt when one exists for the pending wave.
        const draft = data.sessionId ? loadDraft(data.sessionId) : null;
        if (draft && progress.hasPendingWave && progress.pendingWaveId) {
          setDraftPrompt({ waveId: progress.pendingWaveId, answers: draft.answers });
        }

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

  function draftKey(sid: string) {
    return `lifetide:draft:${sid}`;
  }

  type Draft = {
    waveId: string;
    answers: Record<string, { value?: string | string[] | number; skipped: boolean }>;
    updatedAt: string;
  };

  function loadDraft(sid: string): Draft | null {
    if (typeof window === "undefined") return null;
    try {
      const raw = localStorage.getItem(draftKey(sid));
      if (!raw) return null;
      return JSON.parse(raw) as Draft;
    } catch {
      return null;
    }
  }

  function saveDraft(sid: string, wave: string, questionId: string, value: string | string[] | number | undefined, skipped = false) {
    if (typeof window === "undefined" || !sid) return;
    const existing = loadDraft(sid);
    const next: Draft = {
      waveId: wave,
      answers: {
        ...(existing?.waveId === wave ? existing.answers : {}),
        [questionId]: { value, skipped },
      },
      updatedAt: new Date().toISOString(),
    };
    localStorage.setItem(draftKey(sid), JSON.stringify(next));
  }

  function clearDraft(sid: string) {
    if (typeof window === "undefined" || !sid) return;
    localStorage.removeItem(draftKey(sid));
  }

  async function saveAnswerToServer(questionId: string, value: string | string[] | number | undefined, skipped = false, signal?: AbortSignal) {
    try {
      const res = await fetch("/api/answer", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ questionId, waveId, value, skipped }),
        signal,
      });
      if (!res.ok) {
        console.error("[saveAnswer] server returned", res.status, await res.text().catch(() => ""));
      }
    } catch (err) {
      if ((err as Error).name === "AbortError") return;
      console.error("[saveAnswer] network error", err);
    }
  }

  function flushAutoSave() {
    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current);
      autoSaveTimerRef.current = null;
    }
    if (autoSaveAbortRef.current) {
      autoSaveAbortRef.current.abort();
      autoSaveAbortRef.current = null;
    }
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

  // Helper: apply wave data to state and render the first unanswered question,
  // prefilling any answers already persisted on the server or restored from draft.
  const applyWaveData = (data: { questions: InterviewQuestion[]; wave_id: string; wave_index: number; answers?: Record<string, { value?: string | string[] | number; skipped: boolean }> }) => {
    const serverAnswers = data.answers ?? {};
    const restoredAnswers = draftRestoredRef.current ? draftAnswersRef.current : {};
    const mergedAnswers: Record<string, { value?: string | string[] | number; skipped: boolean }> = { ...serverAnswers, ...restoredAnswers };

    // Sync any restored draft values back to the server immediately.
    if (draftRestoredRef.current && sessionId) {
      for (const [questionId, answer] of Object.entries(restoredAnswers)) {
        void saveAnswerToServer(questionId, answer.value, answer.skipped);
      }
      draftRestoredRef.current = false;
      draftAnswersRef.current = {};
    }

    const answeredIds = new Set(
      Object.entries(mergedAnswers)
        .filter(([, a]) => a.value !== undefined || a.skipped)
        .map(([qid]) => qid)
    );
    const firstUnansweredIndex = data.questions.findIndex((q) => !answeredIds.has(q.id));
    const activeIndex = firstUnansweredIndex === -1 ? Math.max(0, data.questions.length - 1) : firstUnansweredIndex;

    setQuestions(data.questions);
    setWaveIndex(data.wave_index);
    setWaveId(data.wave_id);
    setQuestionIndex(activeIndex);
    setAnswers(mergedAnswers);
    setInsight(null);

    appendItem({
      id: newId(),
      type: "bot",
      text: data.wave_index === 3
        ? `第 3 波。聊到第 6 波你可以自主结束并生成画像，建议聊到第 8 波自动进入画像——现在还早，慢慢来。`
        : `第 ${data.wave_index} 波，来看看几个关键问题。`,
    });

    for (let i = 0; i <= activeIndex; i++) {
      const q = data.questions[i];
      const answer = mergedAnswers[q.id];
      const isActive = i === activeIndex;
      appendItem({
        id: newId(),
        type: "question",
        question: q,
        total: data.questions.length,
        isActive,
        answer,
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
        return data as { questions: InterviewQuestion[]; wave_id: string; wave_index: number; answers?: Record<string, { value?: string | string[] | number; skipped: boolean }> };
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
      if (!res.ok) {
        const problem = await res.json().catch(() => ({}));
        throw new Error(problem.error ?? `Failed to load wave: ${res.status}`);
      }
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
              ? `第 ${wIdx} 波已经结束，访谈到这里停止。现在可以生成个人画像。`
              : `已经聊了 ${wIdx} 波，可以生成个人画像，也可以继续聊到第 8 波。`
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
    if (sessionId) clearDraft(sessionId);

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

  async function recoverWaveResult(wId: string) {
    setStreamError(null);
    setWaitingVariant("insight");
    setStep("waiting");
    try {
      const progressRes = await fetch("/api/progress", { cache: "no-store" });
      if (progressRes.ok) {
        const progressData = await progressRes.json();
        const progress = progressData.progress as ProgressInfo;
        const stored = progress.lastInsight;
        if (stored?.wave_id === wId) {
          finishInsight({
            wave_id: wId,
            wave_index: progress.waveIndex,
            revision: 0,
            insight: stored,
          });
          return;
        }
      }
      await resubmitWave(wId);
    } catch (err) {
      const message = err instanceof Error ? err.message : "暂时无法同步结果";
      setStreamError({ message, retry: () => { void recoverWaveResult(wId); } });
    }
  }

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
      setStreamError({ message: `连接中断，先同步已经生成的内容。${message ? `（${message}）` : ""}`, retry: () => { void recoverWaveResult(currentQuestion.wave_id); } });
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
      setStreamError({ message, retry: () => { void recoverWaveResult(wId); } });
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
    flushAutoSave();
    if (sessionId) {
      saveDraft(sessionId, waveId, currentQuestion.id, value, false);
      void saveAnswerToServer(currentQuestion.id, value, false);
    }
    replaceActiveQuestion(id, value, false);
    const nextAnswers = { ...answers, [currentQuestion.id]: { value, skipped: false } };
    setAnswers(nextAnswers);
    advance(nextAnswers);
  };

  const handleQuestionSkip = (id: string) => {
    if (!currentQuestion) return;
    flushAutoSave();
    if (sessionId) {
      saveDraft(sessionId, waveId, currentQuestion.id, undefined, true);
      void saveAnswerToServer(currentQuestion.id, undefined, true);
    }
    replaceActiveQuestion(id, "", true);
    const nextAnswers = { ...answers, [currentQuestion.id]: { skipped: true } };
    setAnswers(nextAnswers);
    advance(nextAnswers);
  };

  const handleQuestionAutoSave = useCallback((question: InterviewQuestion, value: string | string[] | number) => {
    if (!sessionId) return;
    saveDraft(sessionId, waveId, question.id, value, false);

    flushAutoSave();
    autoSaveTimerRef.current = setTimeout(() => {
      const controller = new AbortController();
      autoSaveAbortRef.current = controller;
      void saveAnswerToServer(question.id, value, false, controller.signal);
    }, 800);
  }, [sessionId, waveId]);

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

      if (waveIndex === 6) {
        appendItem({
          id: newId(),
          type: "bot",
          text: "第 6 波到这里结束。现在可以生成画像，也可以继续聊到第 8 波。",
        });
        setCanGenerate(true);
        setStep("stop");
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
  async function loadStoredPortrait(): Promise<PersonaPortrait | null> {
    const res = await fetch("/api/portrait", { cache: "no-store" });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`画像同步失败（${res.status}）`);
    const data = await res.json();
    return (data.portrait as PersonaPortrait | undefined) ?? null;
  }

  async function loadStoredFinal(): Promise<FinalPlan | null> {
    const res = await fetch("/api/final", { cache: "no-store" });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`人生方案同步失败（${res.status}）`);
    return await res.json() as FinalPlan;
  }

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
        (d) => {
          if (ac.signal.aborted) return;
          // Incremental merge — partial events may carry only a subset of
          // fields, so keep previously streamed fields instead of replacing.
          setStreamingPortrait((prev) =>
            prev ? { ...prev, ...(d as { thinking?: string; essence?: string; trait_summary?: string }) } : (d as { thinking?: string; essence?: string; trait_summary?: string })
          );
        }
      );
      if (ac.signal.aborted) return;

      portraitDoneDataRef.current = doneData;
      setPortraitComplete(true);
    } catch (err) {
      if (ac.signal.aborted) return;
      const message = err instanceof Error ? err.message : "Unknown error";
      setStreamingPortrait(null);
      try {
        const stored = await loadStoredPortrait();
        if (stored) {
          setPortrait(stored);
          setStep("portrait");
          return;
        }
      } catch {
        // ignore
      }
      setPortraitError({ message, retry: () => { void recoverPortraitResult(); } });
    } finally {
      isGeneratingRef.current = false;
    }
  };

  async function recoverPortraitResult() {
    setPortraitError(null);
    try {
      const stored = await loadStoredPortrait();
      if (stored) {
        setPortrait(stored);
        setStep("portrait");
        return;
      }
      await handleGenerateFinal();
    } catch (err) {
      const message = err instanceof Error ? err.message : "暂时无法同步画像";
      setPortraitError({ message, retry: () => { void recoverPortraitResult(); } });
    }
  }

  // After portrait is shown, user clicks "继续" to generate the final plan.
  // Uses full-screen overlay with walking animation, then shows results.
  const [finalOverlayError, setFinalOverlayError] = useState<string | null>(null);
  const [streamingFinal, setStreamingFinal] = useState<Array<{ key?: string; label: string; text: string }> | null>(null);
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
          const partial = d as { sections?: Array<{ key?: string; label: string; text: string }> };
          if (partial.sections) {
            setStreamingFinal((prev) => {
              const next = prev ? [...prev] : [];
              for (const s of partial.sections!) {
                const identity = s.key ?? s.label;
                const idx = next.findIndex((item) => (item.key ?? item.label) === identity);
                if (idx >= 0) next[idx] = s;
                else next.push(s);
              }
              return next;
            });
          }
        },
        (progress) => {
          if (ac.signal.aborted) return;
          setStreamingFinal((prev) => {
            const next = prev ? [...prev] : [];
            if (progress.status === "retry") {
              next.push({
                key: `retry-${progress.attempt}`,
                label: "正在调整",
                text: progress.message,
              });
            } else if (progress.status === "success") {
              next.push({
                key: `retry-success-${progress.attempt}`,
                label: "已通过校验",
                text: progress.message,
              });
            }
            return next;
          });
        }
      );
      if (ac.signal.aborted) return;

      finalDoneDataRef.current = doneData;
      setFinalComplete(true);
    } catch (err) {
      if (ac.signal.aborted) return;
      const msg = err instanceof Error ? err.message : "Unknown error";
      setStreamingFinal(null);
      try {
        const stored = await loadStoredFinal();
        if (stored) {
          finalDoneDataRef.current = stored;
          handleFinalComplete();
          return;
        }
      } catch {
        // ignore
      }
      setFinalOverlayError(msg);
    } finally {
      isGeneratingRef.current = false;
    }
  };

  async function recoverFinalResult() {
    setFinalOverlayError(null);
    try {
      const stored = await loadStoredFinal();
      if (stored) {
        const lives: ParallelLife[] = stored.lives ?? [];
        setRoutes(lives.map((life, i) => toRouteView(life, i)));
        setFraming(stored.framing ?? null);
        setBlueprint(stored.blueprint ?? null);
        setStep("routes");
        return;
      }
      await handlePortraitContinue();
    } catch (err) {
      setFinalOverlayError(err instanceof Error ? err.message : "暂时无法同步人生方案");
    }
  }

  const handleReset = async () => {
    try {
      await fetch("/api/session/reset", { method: "POST" });
    } catch {
      // ignore
    }
    if (sessionId) clearDraft(sessionId);
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
      // yet submitted. Fetch the wave (which includes any saved answers) and
      // render the first unanswered question, merging a local draft if present.
      if (progressInfo.hasPendingWave && progressInfo.pendingWaveQuestions && progressInfo.pendingWaveId) {
        await loadWave();
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
        if (sessionId) clearDraft(sessionId);
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
        className="relative mx-auto flex w-full max-w-2xl min-h-[100dvh] flex-col items-center justify-center gap-6 p-6"
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

        {draftPrompt && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/60 p-6">
            <div className="w-full max-w-md border-2 border-ink bg-paper-raised p-6 shadow-md">
              <h2 className="font-serif text-lg mb-2">检测到有未提交的草稿</h2>
              <p className="text-sm text-ink-muted mb-4">
                你上次在第 {draftPrompt.waveId.replace(/^w/, "")} 波的回答已经自动保存到本地，是否要恢复？
              </p>
              <div className="flex flex-col gap-3">
                <button
                  type="button"
                  onClick={() => {
                    draftRestoredRef.current = true;
                    draftAnswersRef.current = draftPrompt.answers;
                    setDraftPrompt(null);
                  }}
                  className="w-full border-2 border-ink bg-cobalt px-5 py-3 text-base font-medium text-white shadow-md transition-transform active:translate-x-[2px] active:translate-y-[2px] active:shadow-sm"
                >
                  恢复草稿
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (sessionId) clearDraft(sessionId);
                    setDraftPrompt(null);
                  }}
                  className="w-full border-2 border-ink bg-white px-5 py-3 text-base font-medium text-ink shadow-md transition-transform active:translate-x-[2px] active:translate-y-[2px] active:shadow-sm"
                >
                  放弃，继续之前的进度
                </button>
              </div>
            </div>
          </div>
        )}
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
        onQuestionAutoSave={handleQuestionAutoSave}
        onQuestionSkip={handleQuestionSkip}
        onQuestionBack={handleQuestionBack}
        onInsightContinue={handleInsightContinue}
        onMaterialSubmit={handleMaterialSubmit}
        onMaterialSkip={handleMaterialSkip}
        className="flex-1 min-h-0"
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
                ].filter((s) => s.text)
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
          onRetry={() => { void recoverFinalResult(); }}
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
                  重新同步结果
                </button>
                <span className="text-sm text-ink-muted">
                  你的回答已经保存，不需要清除会话。
                </span>
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
                  第 {waveIndex} 波已经结束，访谈到这里停止。你可以生成个人画像，或返回查看刚才的理解。
                </p>
              ) : (
                <p className="text-center text-ink-muted">
                  第 {waveIndex} 波已经结束。现有信息仍有空缺，生成的画像会保留这些不确定之处。
                </p>
              )
            ) : waveIndex >= 6 ? (
              <p className="text-center text-ink-muted">
                第 {waveIndex} 波已经结束。现在可以生成个人画像，也可以继续聊到第 8 波。
              </p>
            ) : (
              <p className="text-center text-ink-muted">
                已经聊了 {waveIndex} 波。继续聊会留下更多生活证据，也可以先用现有内容生成一版画像。
              </p>
            )}
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setConfirmPortrait(true)}
                className="flex-1 border-2 border-ink bg-cobalt px-4 py-3 text-base font-medium text-white shadow-md transition-transform active:translate-x-[2px] active:translate-y-[2px] active:shadow-sm hover:shadow-md"
              >
                生成个人画像
              </button>
              {waveIndex < 8 ? (
                <button
                  type="button"
                  onClick={() => loadWave()}
                  className="flex-1 border-2 border-ink bg-white px-4 py-3 text-base font-medium text-ink shadow-md transition-transform active:translate-x-[2px] active:translate-y-[2px] active:shadow-sm hover:shadow-md"
                >
                  继续第 {waveIndex + 1} 波
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setStep("review")}
                  className="flex-1 border-2 border-ink bg-white px-4 py-3 text-base font-medium text-ink shadow-md transition-transform active:translate-x-[2px] active:translate-y-[2px] active:shadow-sm hover:shadow-md"
                >
                  返回查看
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

      {step === "review" && (
        <div className="shrink-0 border-t-2 border-ink bg-paper p-4">
          <div className="mx-auto flex max-w-md items-center justify-between gap-4">
            <p className="text-sm text-ink-muted">访谈已结束，可以继续查看刚才的内容。</p>
            <button
              type="button"
              onClick={() => setConfirmPortrait(true)}
              className="shrink-0 border-2 border-ink bg-cobalt px-4 py-2 text-sm font-medium text-white shadow-sm transition-transform active:translate-x-[1px] active:translate-y-[1px]"
            >
              生成画像
            </button>
          </div>
        </div>
      )}

      {confirmPortrait && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-ink/35 px-5" role="presentation" onClick={() => setConfirmPortrait(false)}>
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="confirm-portrait-title"
            className="w-full max-w-sm border-2 border-ink bg-paper-raised p-5 shadow-lg"
            onClick={(event) => event.stopPropagation()}
          >
            <h2 id="confirm-portrait-title" className="font-serif text-xl text-ink">现在生成个人画像？</h2>
            <p className="mt-2 text-sm leading-relaxed text-ink-muted">
              画像会综合你到目前为止的回答。生成后仍能回来查看这些内容。
            </p>
            <div className="mt-5 flex gap-3">
              <button
                type="button"
                onClick={() => {
                  setConfirmPortrait(false);
                  void handleGenerateFinal();
                }}
                className="flex-1 border-2 border-ink bg-cobalt px-4 py-2.5 text-sm font-medium text-white shadow-sm transition-transform active:translate-x-[1px] active:translate-y-[1px]"
              >
                确认生成
              </button>
              <button
                type="button"
                onClick={() => setConfirmPortrait(false)}
                className="flex-1 border-2 border-ink bg-paper px-4 py-2.5 text-sm font-medium text-ink shadow-sm transition-transform active:translate-x-[1px] active:translate-y-[1px]"
              >
                再看看
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
