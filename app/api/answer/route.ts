import { NextResponse } from "next/server";
import { resolveSession } from "@/lib/auth/resolve";
import { hasConsent } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import type { NextRequest } from "next/server";

export async function POST(request: NextRequest) {
  const { session } = await resolveSession(request);
  if (!session) {
    return NextResponse.json({ error: "No active session" }, { status: 401 });
  }

  if (!hasConsent(session.consents, "ai")) {
    return NextResponse.json(
      { error: "AI consent required", missing: ["ai"] },
      { status: 403 }
    );
  }

  let body: { questionId: string; value?: string | string[] | number; skipped?: boolean };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { questionId, value, skipped } = body;
  if (!questionId) {
    return NextResponse.json({ error: "questionId required" }, { status: 400 });
  }

  const storedValue = value === undefined
    ? null
    : Array.isArray(value)
      ? value.join("；")
      : String(value);

  const answer = await prisma.answer.create({
    data: {
      sessionId: session.id,
      questionId,
      value: storedValue,
      skipped: skipped ?? false,
    },
  });

  return NextResponse.json({ answer }, { status: 201 });
}
