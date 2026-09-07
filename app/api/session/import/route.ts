import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { resolveSession } from "@/lib/auth/resolve";
import {
  mergeWorkingMemoryPayload,
  parseSessionImport,
} from "@/lib/session/import";

const MAX_IMPORT_BYTES = 10 * 1024 * 1024; // 10 MB

// POST /api/session/import
// Restore an exported session JSON into the caller's current session.
// Merges working_memory + waves + answers; never overwrites existing rows.
export async function POST(request: NextRequest) {
  const { session, isAuthed, user } = await resolveSession(request);
  if (!session) {
    return NextResponse.json({ error: "未登录或会话已过期" }, { status: 401 });
  }

  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > MAX_IMPORT_BYTES) {
    return NextResponse.json({ error: "导入文件过大" }, { status: 413 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "无效的 JSON 文件" }, { status: 400 });
  }

  const parsed = parseSessionImport(body);
  if (!parsed) {
    return NextResponse.json(
      { error: "文件格式不正确，请使用本应用导出的 session JSON" },
      { status: 400 },
    );
  }

  // Ownership check: the exported session must belong to the caller.
  // For logged-in users we compare userIds; for guests the source session
  // row (if it still exists) must be unbound or bound to them.
  if (parsed.sourceSessionId) {
    const source = await prisma.session.findUnique({
      where: { id: parsed.sourceSessionId },
      select: { userId: true },
    });
    if (source) {
      if (isAuthed && user) {
        if (source.userId !== user.id) {
          return NextResponse.json(
            { error: "只能导入属于你自己的 session" },
            { status: 403 },
          );
        }
      } else if (source.userId !== null) {
        // Guest importing data bound to a registered account is not allowed.
        return NextResponse.json(
          { error: "该导出数据属于已注册账号，请登录后导入" },
          { status: 403 },
        );
      }
    } else if (
      isAuthed &&
      user &&
      parsed.sourceUserId &&
      parsed.sourceUserId !== user.id
    ) {
      return NextResponse.json(
        { error: "只能导入属于你自己的 session" },
        { status: 403 },
      );
    }
  }

  const sessionId = session.id;

  const result = await prisma.$transaction(async (tx) => {
    // Waves: dedupe by wave_id, skip existing.
    const existingWaves = await tx.wave.findMany({
      where: { sessionId },
      select: { wave_id: true },
    });
    const existingWaveIds = new Set(existingWaves.map((w) => w.wave_id));
    const newWaves = parsed.waves.filter((w) => !existingWaveIds.has(w.wave_id));
    for (const w of newWaves) {
      await tx.wave.create({
        data: {
          sessionId,
          wave_id: w.wave_id,
          wave_index: w.wave_index,
          focus_uncertainty_id: w.focus_uncertainty_id,
          status: w.status,
          questions: w.questions,
        },
      });
    }

    // Answers: dedupe by question_id, skip existing.
    const existingAnswers = await tx.answer.findMany({
      where: { sessionId },
      select: { questionId: true },
    });
    const existingQuestionIds = new Set(
      existingAnswers.map((a) => a.questionId),
    );
    const newAnswers = parsed.answers.filter(
      (a) => !existingQuestionIds.has(a.question_id),
    );
    for (const a of newAnswers) {
      await tx.answer.create({
        data: {
          sessionId,
          questionId: a.question_id,
          value: a.value,
          skipped: a.skipped,
        },
      });
    }

    // Working memory: merge without overwriting existing keys.
    let workingMemoryMerged = false;
    if (parsed.workingMemoryPayload) {
      const existing = await tx.workingMemory.findUnique({
        where: { sessionId },
      });
      const existingPayload = existing
        ? (JSON.parse(existing.payload) as Record<string, unknown>)
        : null;
      const merged = mergeWorkingMemoryPayload(
        existingPayload,
        parsed.workingMemoryPayload,
      );
      await tx.workingMemory.upsert({
        where: { sessionId },
        create: {
          sessionId,
          revision: 1,
          payload: JSON.stringify(merged),
        },
        update: {
          revision: (existing?.revision ?? 0) + 1,
          payload: JSON.stringify(merged),
        },
      });
      workingMemoryMerged = true;
    }

    return {
      waves: { imported: newWaves.length, skipped: parsed.waves.length - newWaves.length },
      answers: {
        imported: newAnswers.length,
        skipped: parsed.answers.length - newAnswers.length,
      },
      working_memory: workingMemoryMerged,
    };
  });

  return NextResponse.json({ ok: true, imported: result });
}
