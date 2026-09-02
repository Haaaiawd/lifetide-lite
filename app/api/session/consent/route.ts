import { NextResponse } from "next/server";
import { resolveSession } from "@/lib/auth/resolve";
import { canProcess, consentCatalog, isRequired, type ConsentType } from "@/lib/privacy/consent";
import { prisma } from "@/lib/db/prisma";
import { commitEvent } from "@/lib/db/commit";
import { makeEnvelope } from "@/lib/state/envelope";
import { loadPublicSnapshot } from "@/lib/db/commit";
import type { ConsentRecorded } from "@/lib/state/events";
import type { NextRequest } from "next/server";

const ALLOWED = new Set<ConsentType>(["ai", "upload", "research"]);

// GET /api/session/consent — returns current consent state for the resolved session
export async function GET(request: NextRequest) {
  const { session } = await resolveSession(request);
  if (!session) {
    return NextResponse.json({ error: "No active session" }, { status: 401 });
  }

  return NextResponse.json({
    consents: session.consents.map((c) => ({
      type: c.type,
      required: c.required,
      given: c.given,
      givenAt: c.givenAt,
    })),
    catalog: consentCatalog(),
    missingRequired: session.consents
      .filter((c) => c.required && !c.given)
      .map((c) => c.type),
  });
}

export async function POST(request: NextRequest) {
  const { session } = await resolveSession(request);
  if (!session) {
    return NextResponse.json({ error: "No active session" }, { status: 401 });
  }

  let body: { consents?: { type: string; given: boolean }[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const updates = (body.consents ?? []).filter((c): c is { type: ConsentType; given: boolean } =>
    ALLOWED.has(c.type as ConsentType)
  );

  if (updates.length === 0) {
    return NextResponse.json({ error: "No valid consent updates" }, { status: 400 });
  }

  for (const { type, given } of updates) {
    await prisma.consent.upsert({
      where: {
        sessionId_type: {
          sessionId: session.id,
          type,
        },
      },
      create: {
        sessionId: session.id,
        type,
        required: isRequired(type),
        given,
        givenAt: given ? new Date() : null,
      },
      update: {
        given,
        givenAt: given ? new Date() : null,
      },
    });
  }

  const refreshed = await prisma.session.findUnique({
    where: { id: session.id },
    include: { consents: true },
  });

  if (!refreshed) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  const consentChecks = refreshed.consents.map((c) => ({
    type: c.type as ConsentType,
    given: c.given,
  }));

  const canUseAI = canProcess(consentChecks, "ai").allowed;
  const canUpload = canProcess(consentChecks, "upload").allowed;

  if (canUseAI) {
    const snapshot = await loadPublicSnapshot(session.id);
    const consentRecorded: ConsentRecorded = {
      consent_version: "v1",
      ai: true,
      upload: canUpload,
    };
    const envelope = makeEnvelope("CONSENT_RECORDED", {
      session_id: session.id,
      actor: "user",
      base_revision: snapshot?.revision ?? 0,
      idempotency_key: `consent-${session.id}`,
      payload: consentRecorded,
    });
    const result = await commitEvent(session.id, envelope);
    if (!result.ok) {
      console.error("Failed to commit CONSENT_RECORDED:", result.message);
    }
  }

  return NextResponse.json({
    consents: refreshed.consents.map((c) => ({
      type: c.type,
      required: c.required,
      given: c.given,
      givenAt: c.givenAt,
    })),
    canUseAI,
    canUpload,
    missingRequired: refreshed.consents
      .filter((c) => c.required && !c.given)
      .map((c) => c.type),
  });
}
