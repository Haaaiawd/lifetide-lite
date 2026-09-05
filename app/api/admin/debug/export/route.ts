import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireAdmin } from "@/lib/auth/admin";

// GET /api/admin/debug/export?session_id=xxx&format=txt|json
// Admin-only: export full session interaction chain for debugging.
export async function GET(request: NextRequest) {
  const { response } = await requireAdmin(request);
  if (response) return response;

  const sessionId = request.nextUrl.searchParams.get("session_id");
  const format = request.nextUrl.searchParams.get("format") ?? "json";

  if (!sessionId) {
    return NextResponse.json(
      { error: "session_id is required" },
      { status: 400 },
    );
  }

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
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  // Build structured data
  const exportData = {
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

  if (format === "txt") {
    const txt = buildTxtExport(exportData);
    const filename = `debug_${sessionId}_${Date.now()}.txt`;
    return new NextResponse(txt, {
      headers: {
        "content-type": "text/plain; charset=utf-8",
        "content-disposition": `attachment; filename="${filename}"`,
      },
    });
  }

  // Default: JSON
  const json = JSON.stringify(exportData, null, 2);
  const filename = `debug_${sessionId}_${Date.now()}.json`;
  return new NextResponse(json, {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="${filename}"`,
    },
  });
}

function safeParseJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

function buildTxtExport(data: any): string {
  const lines: string[] = [];
  const m = data.meta;
  lines.push("=== Session Debug Export ===");
  lines.push(`Session: ${m.session_id}`);
  lines.push(`User: ${m.user_email ?? "guest"} (${m.user_id ?? "—"})`);
  lines.push(`Created: ${m.session_created_at}`);
  lines.push(`Expires: ${m.session_expires_at}`);
  lines.push(`Exported: ${m.exported_at}`);
  lines.push("");

  // Waves + answers
  lines.push("=== Wave Chain ===");
  for (const w of data.waves) {
    lines.push(`\n[Wave ${w.wave_index}] ${w.wave_id} — status: ${w.status}`);
    lines.push(`  Created: ${w.created_at}`);
    if (w.focus_uncertainty_id) lines.push(`  Focus: ${w.focus_uncertainty_id}`);
    const qs = w.questions;
    for (let i = 0; i < qs.length; i++) {
      const q = qs[i];
      lines.push(`  Q${i + 1}: ${q.text}`);
      // Find answer
      const ans = data.answers.find((a: any) => a.question_id === q.id);
      if (ans) {
        lines.push(`    A: ${ans.skipped ? "(skipped)" : (ans.value ?? "(empty)")}`);
      } else {
        lines.push(`    A: (not answered)`);
      }
    }
  }
  lines.push("");

  // Model calls
  lines.push("=== Model Call Log ===");
  for (const l of data.model_call_logs) {
    lines.push(`[${l.created_at}] ${l.purpose} — ${l.status}`);
    if (l.wave_id) lines.push(`  wave: ${l.wave_id}`);
    if (l.input_tokens) lines.push(`  tokens: ${l.input_tokens} in / ${l.output_tokens} out`);
    if (l.latency_ms) lines.push(`  latency: ${l.latency_ms}ms`);
  }
  lines.push("");

  // Errors
  if (data.errors.length > 0) {
    lines.push("=== Errors & Fallbacks ===");
    for (const e of data.errors) {
      lines.push(`[${e.created_at}] ${e.purpose} — ${e.status} (wave ${e.wave_id ?? "—"})`);
    }
    lines.push("");
  }

  // Uploads
  if (data.uploads.length > 0) {
    lines.push("=== Uploads ===");
    for (const u of data.uploads) {
      lines.push(`[${u.created_at}] ${u.file_name} — ${u.status} (${u.size} bytes, ${u.chunks.length} chunks)`);
      if (u.error) lines.push(`  error: ${u.error}`);
    }
    lines.push("");
  }

  // Derived content
  if (data.derived_contents.length > 0) {
    lines.push("=== Derived Content ===");
    for (const d of data.derived_contents) {
      lines.push(`[${d.created_at}] ${d.kind} — ${d.support_status}`);
    }
    lines.push("");
  }

  // Wave missions
  if (data.wave_missions.length > 0) {
    lines.push("=== Wave Missions ===");
    for (const wm of data.wave_missions) {
      lines.push(`[${wm.created_at}] wave ${wm.wave_id}`);
      lines.push(`  decision: ${wm.decision_to_improve}`);
      lines.push(`  unknown: ${wm.important_unknown}`);
      lines.push(`  why now: ${wm.why_now}`);
    }
    lines.push("");
  }

  // Working memory summary
  if (data.working_memory) {
    const wm = data.working_memory.payload;
    lines.push("=== Working Memory Summary ===");
    lines.push(`Revision: ${data.working_memory.revision}`);
    lines.push(`Last wave index: ${wm.last_wave_index ?? 0}`);
    lines.push(`Uncertainties: ${wm.uncertainties?.length ?? 0}`);
    lines.push(`Constraints: ${wm.constraints?.length ?? 0}`);
    lines.push(`Source versions: ${wm.source_versions?.length ?? 0}`);
    lines.push(`Route intents: ${wm.route_intents?.length ?? 0}`);
    lines.push(`Recent feedback: ${wm.recent_feedback?.length ?? 0}`);
    if (wm.persona_portrait) lines.push(`Portrait: yes`);
    if (wm.finalPlan) lines.push(`Final plan: yes`);

    // Six-dimensional radar
    if (wm.radar) {
      lines.push("");
      lines.push("--- Six-Dimensional Radar ---");
      for (const [dim, cell] of Object.entries(wm.radar)) {
        const c = cell as any;
        lines.push(`  ${dim}: ${c.state} (${c.evidence?.length ?? 0} evidence)`);
        lines.push(`    reason: ${c.reason}`);
      }
    }

    // Last insight
    if (wm.last_insight) {
      const ins = wm.last_insight;
      lines.push("");
      lines.push("--- Last Insight ---");
      lines.push(`  wave: ${ins.wave_id}`);
      lines.push(`  user_told_me: ${ins.user_told_me}`);
      lines.push(`  current_reading: ${ins.current_reading}`);
      lines.push(`  important_unknown: ${ins.important_unknown}`);
      lines.push(`  route_impact: ${ins.route_impact}`);
      lines.push(`  language_strength: ${ins.language_strength}`);
      if (ins.radar_deltas?.length > 0) {
        lines.push(`  radar_deltas:`);
        for (const d of ins.radar_deltas) {
          lines.push(`    ${d.dimension}: ${d.from} -> ${d.to}`);
        }
      }
    }

    // Route intents
    if (wm.route_intents?.length > 0) {
      lines.push("");
      lines.push("--- Route Intents ---");
      for (const r of wm.route_intents) {
        lines.push(`  [${r.status}] ${r.title_hint ?? r.id} (${r.evidence?.length ?? 0} evidence)`);
      }
    }

    // Portrait details
    if (wm.persona_portrait) {
      lines.push("");
      lines.push("--- Portrait ---");
      lines.push(`  essence: ${wm.persona_portrait.essence}`);
      lines.push(`  trait_summary: ${wm.persona_portrait.trait_summary}`);
    }

    // Final plan lives
    if (wm.finalPlan?.lives?.length > 0) {
      lines.push("");
      lines.push("--- Parallel Lives ---");
      for (let i = 0; i < wm.finalPlan.lives.length; i++) {
        const life = wm.finalPlan.lives[i];
        lines.push(`  Life ${i + 1}: ${life.title ?? life.id}`);
        if (life.ordinary_day) {
          lines.push(`    ordinary_day: ${life.ordinary_day}`);
        }
      }
    }
  }

  lines.push("");
  lines.push("=== End of Export ===");
  return lines.join("\n");
}
