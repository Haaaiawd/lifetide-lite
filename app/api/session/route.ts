import { NextResponse } from "next/server";
import { getOrCreateGuestSession, attachGuestCookie, GUEST_TOKEN_COOKIE } from "@/lib/auth/session";
import { consentCatalog, hasConsent } from "@/lib/privacy/consent";
import { commitEvent } from "@/lib/db/commit";
import { makeEnvelope } from "@/lib/state/envelope";
import type { SessionStarted } from "@/lib/state/events";
import type { NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  const { session, isNew } = await getOrCreateGuestSession(request);

  const response = NextResponse.json({
    id: session.id,
    createdAt: session.createdAt,
    expiresAt: session.expiresAt,
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

  if (isNew) {
    const started: SessionStarted = {
      guest_token_hash: session.token,
      expires_at: session.expiresAt.toISOString(),
    };
    const envelope = makeEnvelope("SESSION_STARTED", {
      session_id: session.id,
      actor: "system",
      base_revision: 0,
      idempotency_key: `session-start-${session.id}`,
      payload: started,
    });
    const result = await commitEvent(session.id, envelope);
    if (!result.ok) {
      console.error("Failed to commit SESSION_STARTED:", result.message);
    }

    response.cookies.set(GUEST_TOKEN_COOKIE, session.token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 24 * 60 * 60,
    });
  }

  return response;
}

export async function POST(request: NextRequest) {
  return GET(request);
}
