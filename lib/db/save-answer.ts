import { prisma } from "./prisma";
import type { InterviewQuestion } from "@/lib/working-memory/types";

export function normalizeAnswerValue(value: string | string[] | number | undefined | null): string | null {
  if (value === undefined || value === null || value === "") return null;
  if (Array.isArray(value)) {
    const filtered = value.filter((v) => v !== null && v !== undefined && v !== "") as string[];
    return filtered.length > 0 ? filtered.join("；") : null;
  }
  return String(value);
}

export function parseAnswerValue(raw: string | null, question: InterviewQuestion): string | string[] | number | undefined {
  if (raw === null || raw === undefined || raw === "") return undefined;
  if (question.response_kind === "multi_choice") {
    return raw.split("；").filter((v) => v !== "");
  }
  if (question.response_kind === "scale") {
    const n = Number(raw);
    return Number.isNaN(n) ? raw : n;
  }
  return raw;
}

export async function saveAnswer(
  sessionId: string,
  questionId: string,
  value: string | string[] | number | undefined | null,
  skipped = false
) {
  const storedValue = normalizeAnswerValue(value);
  const existing = await prisma.answer.findFirst({
    where: { sessionId, questionId },
    orderBy: { createdAt: "desc" },
  });

  if (existing) {
    return prisma.answer.update({
      where: { id: existing.id },
      data: { value: storedValue, skipped },
    });
  }

  return prisma.answer.create({
    data: { sessionId, questionId, value: storedValue, skipped },
  });
}

export async function loadWaveAnswers(sessionId: string, questions: InterviewQuestion[]) {
  const questionIds = questions.map((q) => q.id);
  if (questionIds.length === 0) return {} as Record<string, { value?: string | string[] | number; skipped: boolean }>;

  const rows = await prisma.answer.findMany({
    where: { sessionId, questionId: { in: questionIds } },
    orderBy: { createdAt: "asc" },
  });

  const latestByQuestion = new Map<string, { value: string | null; skipped: boolean; createdAt: Date }>();
  for (const row of rows) {
    const current = latestByQuestion.get(row.questionId);
    if (!current || row.createdAt > current.createdAt) {
      latestByQuestion.set(row.questionId, { value: row.value, skipped: row.skipped, createdAt: row.createdAt });
    }
  }

  const answers: Record<string, { value?: string | string[] | number; skipped: boolean }> = {};
  for (const question of questions) {
    const row = latestByQuestion.get(question.id);
    if (row) {
      answers[question.id] = {
        value: parseAnswerValue(row.value, question),
        skipped: row.skipped,
      };
    }
  }

  return answers;
}
