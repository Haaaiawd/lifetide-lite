"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { InsightSlip } from "@/components/insight/InsightSlip";
import { RouteCarousel } from "@/components/routes/RouteCarousel";
import type { Route } from "@/lib/fixtures";
import { toInsightView } from "@/lib/plans/insight-view";
import { toRouteView } from "@/lib/plans/route-view";
import type { InterviewQuestion, ImmediateInsight, ParallelLife } from "@/lib/working-memory/types";

const QuestionFrame = dynamic(() => import("@/components/interview/QuestionFrame").then((m) => m.QuestionFrame), {
  ssr: false,
});

const REQUIRED_CONSENTS = [{ type: "ai", given: true }];

type Step = "loading" | "consent" | "question" | "insight" | "stop" | "routes";

export default function PlayPage() {
  const [step, setStep] = useState<Step>("loading");
  const [questions, setQuestions] = useState<InterviewQuestion[]>([]);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, { value?: string | string[] | number; skipped: boolean }>>({});
  const [insight, setInsight] = useState<ImmediateInsight | null>(null);
  const [waveIndex, setWaveIndex] = useState(1);
  const [waveId, setWaveId] = useState<string>("w1");
  const [stop, setStop] = useState<{ can_generate: boolean; provisional: boolean; reason: string } | null>(null);
  const [routes, setRoutes] = useState<Route[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadWave();
  }, []);

  const loadWave = async () => {
    setStep("loading");
    try {
      const res = await fetch("/api/wave");
      if (res.status === 403) {
        setStep("consent");
        return;
      }
      if (!res.ok) throw new Error(`Failed to load wave: ${res.status}`);
      const data = await res.json();

      if (data.stop) {
        setStop(data);
        setStep("stop");
        return;
      }

      setQuestions(data.questions);
      setWaveIndex(data.wave_index);
      setWaveId(data.wave_id);
      setQuestionIndex(0);
      setAnswers({});
      setInsight(null);
      setStep("question");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
      setStep("consent");
    }
  };

  const currentQuestion = questions[questionIndex];

  const submitWave = async (answersToSubmit: Record<string, { value?: string | string[] | number; skipped: boolean }>) => {
    if (!currentQuestion) return;
    setStep("loading");
    const payload = {
      wave_id: currentQuestion.wave_id,
      answers: questions.map((q) => ({
        question_id: q.id,
        value: answersToSubmit[q.id]?.value,
        skipped: answersToSubmit[q.id]?.skipped ?? false,
      })),
    };

    try {
      const res = await fetch("/api/wave", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(`Wave submission failed: ${res.status}`);
      const data = await res.json();
      setInsight(data.insight);
      setWaveIndex(data.wave_index);
      setStep("insight");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
      setStep("question");
    }
  };

  const advance = (nextAnswers: Record<string, { value?: string | string[] | number; skipped: boolean }>) => {
    setAnswers(nextAnswers);
    if (questionIndex < questions.length - 1) {
      setQuestionIndex((i) => i + 1);
    } else {
      submitWave(nextAnswers);
    }
  };

  const handleAnswer = (value: string | string[] | number) => {
    if (!currentQuestion) return;
    const nextAnswers = { ...answers, [currentQuestion.id]: { value, skipped: false } };
    advance(nextAnswers);
  };

  const handleSkip = () => {
    if (!currentQuestion) return;
    const nextAnswers = { ...answers, [currentQuestion.id]: { skipped: true } };
    advance(nextAnswers);
  };

  const handleContinue = async (feedback: { accuracy: "accurate" | "partial" | "inaccurate"; note: string; direction: string }) => {
    if (!insight) return;

    const verdictMap: Record<string, string> = {
      accurate: "accurate",
      partial: "partly_accurate",
      inaccurate: "inaccurate",
    };

    try {
      await fetch("/api/feedback", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          wave_id: waveId,
          verdict: verdictMap[feedback.accuracy] ?? feedback.accuracy,
          correction: feedback.note,
          next_interest: feedback.direction,
        }),
      });

      if (waveIndex === 1) {
        // Provisional final generation after Wave 1.
        await handleGenerateFinal();
        return;
      }

      const res = await fetch("/api/wave");
      if (!res.ok) throw new Error(`Failed to load next step: ${res.status}`);
      const data = await res.json();

      if (data.stop) {
        setStop(data);
        setStep("stop");
      } else {
        setQuestions(data.questions);
        setWaveIndex(data.wave_index);
        setWaveId(data.wave_id);
        setQuestionIndex(0);
        setAnswers({});
        setInsight(null);
        setStep("question");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    }
  };

  const handleGenerateFinal = async () => {
    setStep("loading");
    try {
      const res = await fetch("/api/final", { method: "POST" });
      if (!res.ok) throw new Error(`Final generation failed: ${res.status}`);
      const data = await res.json();
      const lives: ParallelLife[] = data.lives ?? [];
      setRoutes(lives.map((life, i) => toRouteView(life, i)));
      setStep("routes");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
      setStep("stop");
    }
  };

  if (step === "loading") {
    return (
      <div className="mx-auto flex w-full max-w-2xl min-h-[100dvh] items-center justify-center">
        <p className="font-mono text-sm text-cobalt">整理中</p>
      </div>
    );
  }

  if (step === "consent") {
    const handleConsent = async () => {
      setStep("loading");
      try {
        await fetch("/api/session", { method: "POST" });
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
        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>
    );
  }

  if (step === "question" && currentQuestion) {
    return (
      <div className="mx-auto w-full max-w-2xl pb-6 pt-2">
        <QuestionFrame
          key={currentQuestion.id}
          question={currentQuestion}
          index={questionIndex + 1}
          total={questions.length}
          onSubmit={handleAnswer}
          onSkip={handleSkip}
        />
      </div>
    );
  }

  if (step === "insight" && insight) {
    return (
      <div className="mx-auto w-full max-w-2xl p-4 pt-6">
        <InsightSlip insight={toInsightView(insight, waveIndex)} onContinue={handleContinue} />
      </div>
    );
  }

  if (step === "stop" && stop) {
    return (
      <div className="mx-auto flex w-full max-w-2xl min-h-[100dvh] flex-col items-center justify-center gap-4 p-6">
        <h1 className="font-serif text-xl">已经聊了 {waveIndex} 波</h1>
        <p className="text-center text-ink-muted">
          {stop.provisional
            ? "现在生成的三条路线会是暂定的，你仍可继续补充。"
            : "我们已经收集了足够的信息来生成三条平行的三年路线。"}
        </p>
        <div className="flex gap-3">
          {stop.can_generate && (
            <button
              type="button"
              onClick={handleGenerateFinal}
              className="border-2 border-ink bg-cobalt px-6 py-4 text-lg font-medium text-white shadow-md transition-transform active:translate-x-[2px] active:translate-y-[2px] active:shadow-sm hover:shadow-md"
            >
              生成三条路线
            </button>
          )}
          <button
            type="button"
            onClick={loadWave}
            className="border-2 border-ink bg-white px-6 py-4 text-lg font-medium text-ink shadow-md transition-transform active:translate-x-[2px] active:translate-y-[2px] active:shadow-sm hover:shadow-md"
          >
            继续下一波
          </button>
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>
    );
  }

  if (step === "routes" && routes) {
    return (
      <div className="mx-auto w-full max-w-2xl px-4 py-6 md:max-w-7xl">
        <RouteCarousel routes={routes} />
      </div>
    );
  }

  return null;
}
