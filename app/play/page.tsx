"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { motion, useReducedMotion } from "motion/react";
import { LoadingProgress } from "@/components/LoadingProgress";
import { RouteCarousel } from "@/components/routes/RouteCarousel";
import { Conversation, type ConversationItem } from "@/components/play/Conversation";
import { WaitingBubble } from "@/components/play/WaitingBubble";
import { PortraitCard } from "@/components/portrait/PortraitCard";
import { StarPrompt } from "@/components/StarPrompt";
import type { Route } from "@/lib/fixtures";
import { toInsightView } from "@/lib/plans/insight-view";
import { toRouteView } from "@/lib/plans/route-view";
import type { InterviewQuestion, ImmediateInsight, ParallelLife } from "@/lib/working-memory/types";
import type { PersonaPortrait } from "@/lib/portrait/types";

const REQUIRED_CONSENTS = [{ type: "ai", given: true }];

type Step = "loading" | "auth" | "resume" | "consent" | "question" | "insight" | "material" | "stop" | "portrait" | "routes" | "waiting";

type ProgressInfo = {
  waveIndex: number;
  hasPortrait: boolean;
  hasFinalPlan: boolean;
  hasPendingInsight: boolean;
  hasPendingWave: boolean;
  pendingWaveId: string | null;
  pendingWaveIndex: number | null;
  pendingWaveQuestions: InterviewQuestion[] | null;
  lastStep: "fresh" | "question" | "stop" | "portrait" | "routes" | "insight";
  lastInsight: ImmediateInsight | null;
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
  const [waitingVariant, setWaitingVariant] = useState<"insight" | "final" | "wave" | "portrait">("insight");
  const [streamingInsight, setStreamingInsight] = useState<{ user_told_me?: string; current_reading?: string; important_unknown?: string } | null>(null);
  const [portrait, setPortrait] = useState<PersonaPortrait | null>(null);
  const [streamingPortrait, setStreamingPortrait] = useState<{ essence?: string; trait_summary?: string } | null>(null);
  const [progressInfo, setProgressInfo] = useState<ProgressInfo | null>(null);
  const hasLoadedRef = useRef(false);

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
      text: `第 ${data.wave_index} 波，来看看几个关键问题。`,
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
        appendItem({
          id: newId(),
          type: "bot",
          text: data.can_generate
            ? `已经聊了 ${waveIndex} 波，可以生成个人画像了，也可以继续补充。`
            : "我们再补充一轮，可能会更清楚。",
        });
        setStep("stop");
        return;
      }

      applyWaveData(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
      setStep("consent");
    }
  };

  const currentQuestion = questions[questionIndex];

  const submitWave = async (answerState?: Record<string, { value?: string | string[] | number; skipped: boolean }>) => {
    if (!currentQuestion) return;
    setWaitingVariant("insight");
    setStreamingInsight(null);
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
      if (!res.ok) throw new Error(`Wave submission failed: ${res.status}`);
      if (!res.body) throw new Error("No response body");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let doneData: { wave_id: string; wave_index: number; revision: number; insight: ImmediateInsight } | null = null;

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
              setStreamingInsight(data);
            } else if (eventType === "done") {
              doneData = data;
            } else if (eventType === "error") {
              throw new Error(data.error ?? "Stream error");
            }
          } catch (parseErr) {
            // Ignore malformed events
          }
        }
      }

      if (!doneData) throw new Error("Stream ended without done event");
      const insightView = toInsightView(doneData.insight, doneData.wave_index);
      setInsight(doneData.insight);
      setWaveIndex(doneData.wave_index);
      setStreamingInsight(null);

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
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
      setStreamingInsight(null);
      setStep("question");
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
      setError(err instanceof Error ? err.message : "Unknown error");
      setStep("insight");
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
  const handleGenerateFinal = async () => {
    setWaitingVariant("portrait");
    setStreamingPortrait(null);
    setStep("waiting");
    try {
      const res = await fetch("/api/portrait", { method: "POST" });
      if (!res.ok) throw new Error(`Portrait generation failed: ${res.status}`);
      if (!res.body) throw new Error("No response body");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let doneData: { portrait: PersonaPortrait } | null = null;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

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
              setStreamingPortrait(data);
            } else if (eventType === "done") {
              doneData = data;
            } else if (eventType === "error") {
              throw new Error(data.error ?? "Stream error");
            }
          } catch {
            // Ignore malformed events
          }
        }
      }

      if (!doneData) throw new Error("Stream ended without done event");
      setPortrait(doneData.portrait);
      setStreamingPortrait(null);
      setStep("portrait");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
      setStep("stop");
    }
  };

  // After portrait is shown, user clicks "继续" to generate the final plan.
  const handlePortraitContinue = async () => {
    setWaitingVariant("final");
    setStep("waiting");
    try {
      const res = await fetch("/api/final", { method: "POST" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? `生成失败（${res.status}）`);
      }
      const data = await res.json();
      const lives: ParallelLife[] = data.lives ?? [];
      setRoutes(lives.map((life, i) => toRouteView(life, i)));
      setFraming(data.framing ?? null);
      setBlueprint(data.blueprint ?? null);
      setStep("routes");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
      setStep("portrait");
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
        } catch {}
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
        } catch {}
      }
      // Restore insight page — user was viewing the immediate insight
      // when they refreshed. Restore the insight content and let them
      // calibrate (accurate/partly/inaccurate) or continue.
      if (progressInfo.hasPendingInsight && progressInfo.lastInsight) {
        const insightView = toInsightView(progressInfo.lastInsight, progressInfo.waveIndex);
        setInsight(progressInfo.lastInsight);
        setWaveIndex(progressInfo.waveIndex);
        setWaveId(`w${progressInfo.waveIndex}`);
        setItems([
          { id: newId(), type: "bot", text: "好，我已经整理好一条理解，你看看哪里需要调：" },
          { id: newId(), type: "insight", insight: insightView, isActive: true },
        ]);
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
          { id: newId(), type: "bot", text: `第 ${pwIndex} 波，继续回答几个关键问题。` },
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
        className="flex-1 min-h-0"
      />

      {step === "waiting" && (
        <div className="shrink-0 border-t-2 border-ink/10 bg-paper/50 p-4">
          <WaitingBubble variant={waitingVariant} streamingInsight={streamingInsight} streamingPortrait={streamingPortrait} />
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
              <p className="text-center text-ink-muted">
                已经聊完 {waveIndex} 波，六维观察已经充分收集。可以生成个人画像了。
              </p>
            ) : (
              <p className="text-center text-ink-muted">
                已经聊了 {waveIndex} 波。建议聊到 8 波再生成画像，理解会更完整；但如果你觉得够了，现在也可以生成。
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
    </div>
  );
}
