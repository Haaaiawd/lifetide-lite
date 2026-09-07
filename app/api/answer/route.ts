import { NextResponse } from "next/server";
import { resolveSession } from "@/lib/auth/resolve";
import { hasConsent } from "@/lib/auth/session";
import { saveAnswer } from "@/lib/db/save-answer";
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

  let body: { questionId: string; waveId?: string; value?: string | string[] | number; skipped?: boolean };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { questionId, value, skipped } = body;
  if (!questionId) {
    return NextResponse.json({ error: "questionId required" }, { status: 400 });
  }

  const answer = await saveAnswer(session.id, questionId, value, skipped ?? false);

  return NextResponse.json({ answer }, { status: 201 });
}
