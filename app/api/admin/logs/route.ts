import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireAdmin } from "@/lib/auth/admin";

// GET /api/admin/logs — returns recent model call logs (errors first, then recent)
export async function GET(request: NextRequest) {
  const { response } = await requireAdmin(request);
  if (response) return response;

  const url = new URL(request.url);
  const status = url.searchParams.get("status"); // "error" | "success" | null
  const purpose = url.searchParams.get("purpose"); // filter by purpose
  const limit = Math.min(Number(url.searchParams.get("limit") ?? "50"), 200);

  const where: Record<string, unknown> = {};
  if (status) where.status = status;
  if (purpose) where.purpose = purpose;

  const logs = await prisma.modelCallLog.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: limit,
  });

  // Also grab recent console errors from the server log directory if available
  // (Next.js doesn't have a built-in log buffer, so we rely on ModelCallLog)

  const errorCount = await prisma.modelCallLog.count({ where: { status: "error" } });
  const successCount = await prisma.modelCallLog.count({ where: { status: "success" } });

  return NextResponse.json({
    summary: {
      total: errorCount + successCount,
      errors: errorCount,
      successes: successCount,
      errorRate: errorCount + successCount > 0
        ? `${((errorCount / (errorCount + successCount)) * 100).toFixed(1)}%`
        : "0%",
    },
    logs: logs.map((l) => ({
      id: l.id,
      sessionId: l.sessionId,
      waveId: l.wave_id,
      purpose: l.purpose,
      status: l.status,
      modelConfigId: l.model_config_id,
      promptVersion: l.prompt_version,
      inputTokens: l.input_tokens,
      outputTokens: l.output_tokens,
      latencyMs: l.latency_ms,
      createdAt: l.createdAt.toISOString(),
    })),
  });
}
