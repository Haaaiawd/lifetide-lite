import { NextRequest, NextResponse } from "next/server";
import { resolveSession } from "@/lib/auth/resolve";
import { prisma } from "@/lib/db/prisma";

// POST /api/progress/reset — clears the user's working memory and related data
// so they can start a fresh session from wave 1.
export async function POST(request: NextRequest) {
  const { session } = await resolveSession(request);
  if (!session) {
    return NextResponse.json({ error: "No active session" }, { status: 401 });
  }

  // Delete working memory
  await prisma.workingMemory.deleteMany({ where: { sessionId: session.id } });

  // Delete waves
  await prisma.wave.deleteMany({ where: { sessionId: session.id } });

  // Delete answers
  await prisma.answer.deleteMany({ where: { sessionId: session.id } });

  // Delete derived content (insights, routes)
  await prisma.derivedContent.deleteMany({ where: { sessionId: session.id } });

  // Delete calibrations
  await prisma.calibration.deleteMany({ where: { sessionId: session.id } });

  // Delete route intents
  await prisma.routeIntent.deleteMany({ where: { sessionId: session.id } });

  // Delete immediate insights
  await prisma.immediateInsight.deleteMany({ where: { sessionId: session.id } });

  return NextResponse.json({ ok: true });
}
