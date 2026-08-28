import { NextResponse } from "next/server";
import { requireGuestSession } from "@/lib/auth/session";
import { canProcess, consentCatalog, isRequired, type ConsentType } from "@/lib/privacy/consent";
import { prisma } from "@/lib/db/prisma";
import type { NextRequest } from "next/server";

const ALLOWED = new Set<ConsentType>(["ai", "upload", "research"]);

export async function POST(request: NextRequest) {
  const session = await requireGuestSession(request);
  if (!session) {
    return NextResponse.json({ error: "No active guest session" }, { status: 401 });
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

  return NextResponse.json({
    consents: refreshed.consents.map((c) => ({
      type: c.type,
      required: c.required,
      given: c.given,
      givenAt: c.givenAt,
    })),
    canUseAI: canProcess(consentChecks, "ai").allowed,
    canUpload: canProcess(consentChecks, "upload").allowed,
    missingRequired: refreshed.consents
      .filter((c) => c.required && !c.given)
      .map((c) => c.type),
  });
}
