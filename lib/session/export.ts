import { prisma } from "@/lib/db/prisma";

// Shared session export builder. Produces the same JSON shape as
// /api/admin/debug/export so user-facing exports stay compatible.
export type SessionExportData = {
  meta: {
    exported_at: string;
    session_id: string;
    user_id: string | null;
    user_email: string | null;
    session_created_at: string;
    session_expires_at: string;
  };
  working_memory: {
    revision: number;
    updated_at: string;
    payload: unknown;
  } | null;
  waves: {
    id: string;
    wave_id: string;
    wave_index: number;
    focus_uncertainty_id: string | null;
    status: string;
    created_at: string;
    updated_at: string;
    questions: unknown;
  }[];
  answers: {
    id: string;
    question_id: string;
    value: string | null;
    skipped: boolean;
    created_at: string;
  }[];
  uploads: {
    id: string;
    file_name: string;
    mime_type: string;
    size: number;
    status: string;
    error: string | null;
    created_at: string;
    chunks: { id: string; index: number; source: string; text: string }[];
  }[];
  derived_contents: {
    id: string;
    kind: string;
    support_status: string;
    upload_id: string | null;
    created_at: string;
    payload: unknown;
  }[];
  model_call_logs: {
    id: string;
    purpose: string;
    wave_id: string | null;
    status: string;
    model_config_id: string | null;
    prompt_version: string | null;
    input_tokens: number | null;
    output_tokens: number | null;
    latency_ms: number | null;
    created_at: string;
  }[];
  wave_missions: {
    id: string;
    wave_id: string;
    decision_to_improve: string;
    target_dimensions: unknown;
    known_source_refs: unknown;
    important_unknown: string;
    why_now: string;
    exit_condition: string;
    sensitivity_ceiling: string;
    created_at: string;
  }[];
  errors: {
    purpose: string;
    wave_id: string | null;
    status: string;
    created_at: string;
  }[];
};

function safeParseJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

// Returns null when the session does not exist.
export async function buildSessionExport(
  sessionId: string,
): Promise<SessionExportData | null> {
  // Read all session data from one consistent database snapshot.
  // A Prisma interactive transaction gives SQLite-level read consistency:
  // no concurrent writes can interleave between these queries.
  const {
    session,
    waves,
    answers,
    workingMemory,
    uploads,
    derivedContents,
    modelCallLogs,
    waveMissions,
  } = await prisma.$transaction(async (tx) => {
    const session = await tx.session.findUnique({
      where: { id: sessionId },
      include: { user: true },
    });
    if (!session) {
      return {
        session: null,
        waves: [],
        answers: [],
        workingMemory: null,
        uploads: [],
        derivedContents: [],
        modelCallLogs: [],
        waveMissions: [],
      };
    }
    const [
      waves,
      answers,
      workingMemory,
      uploads,
      derivedContents,
      modelCallLogs,
      waveMissions,
    ] = await Promise.all([
      tx.wave.findMany({
        where: { sessionId },
        orderBy: { wave_index: "asc" },
      }),
      tx.answer.findMany({
        where: { sessionId },
        orderBy: { createdAt: "asc" },
      }),
      tx.workingMemory.findUnique({ where: { sessionId } }),
      tx.upload.findMany({
        where: { sessionId },
        include: { chunks: { orderBy: { index: "asc" } } },
        orderBy: { createdAt: "asc" },
      }),
      tx.derivedContent.findMany({
        where: { sessionId },
        orderBy: { createdAt: "asc" },
      }),
      tx.modelCallLog.findMany({
        where: { sessionId },
        orderBy: { createdAt: "asc" },
      }),
      tx.waveMission.findMany({
        where: { sessionId },
        orderBy: { createdAt: "asc" },
      }),
    ]);
    return {
      session,
      waves,
      answers,
      workingMemory,
      uploads,
      derivedContents,
      modelCallLogs,
      waveMissions,
    };
  });

  if (!session) {
    return null;
  }

  return {
    meta: {
      exported_at: new Date().toISOString(),
      session_id: sessionId,
      user_id: session.userId ?? null,
      user_email: session.user?.email ?? null,
      session_created_at: session.createdAt.toISOString(),
      session_expires_at: session.expiresAt.toISOString(),
    },
    working_memory: workingMemory
      ? {
          revision: workingMemory.revision,
          updated_at: workingMemory.updatedAt.toISOString(),
          payload: JSON.parse(workingMemory.payload),
        }
      : null,
    waves: waves.map((w) => ({
      id: w.id,
      wave_id: w.wave_id,
      wave_index: w.wave_index,
      focus_uncertainty_id: w.focus_uncertainty_id,
      status: w.status,
      created_at: w.createdAt.toISOString(),
      updated_at: w.updatedAt.toISOString(),
      questions: JSON.parse(w.questions),
    })),
    answers: answers.map((a) => ({
      id: a.id,
      question_id: a.questionId,
      value: a.value,
      skipped: a.skipped,
      created_at: a.createdAt.toISOString(),
    })),
    uploads: uploads.map((u) => ({
      id: u.id,
      file_name: u.fileName,
      mime_type: u.mimeType,
      size: u.size,
      status: u.status,
      error: u.error,
      created_at: u.createdAt.toISOString(),
      chunks: u.chunks.map((c) => ({
        id: c.id,
        index: c.index,
        source: c.source,
        text: c.text,
      })),
    })),
    derived_contents: derivedContents.map((d) => ({
      id: d.id,
      kind: d.kind,
      support_status: d.supportStatus,
      upload_id: d.uploadId,
      created_at: d.createdAt.toISOString(),
      payload: JSON.parse(d.payload),
    })),
    model_call_logs: modelCallLogs.map((l) => ({
      id: l.id,
      purpose: l.purpose,
      wave_id: l.wave_id,
      status: l.status,
      model_config_id: l.model_config_id,
      prompt_version: l.prompt_version,
      input_tokens: l.input_tokens,
      output_tokens: l.output_tokens,
      latency_ms: l.latency_ms,
      created_at: l.createdAt.toISOString(),
    })),
    wave_missions: waveMissions.map((wm) => ({
      id: wm.id,
      wave_id: wm.waveId,
      decision_to_improve: wm.decisionToImprove,
      target_dimensions: safeParseJson(wm.targetDimensions),
      known_source_refs: safeParseJson(wm.knownSourceRefs),
      important_unknown: wm.importantUnknown,
      why_now: wm.whyNow,
      exit_condition: wm.exitCondition,
      sensitivity_ceiling: wm.sensitivityCeiling,
      created_at: wm.createdAt.toISOString(),
    })),
    errors: modelCallLogs
      .filter((l) => l.status === "error" || l.status === "fallback")
      .map((l) => ({
        purpose: l.purpose,
        wave_id: l.wave_id,
        status: l.status,
        created_at: l.createdAt.toISOString(),
      })),
  };
}
