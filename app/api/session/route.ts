import { NextResponse } from "next/server";
import { getOrCreateGuestSession, attachGuestCookie, GUEST_TOKEN_COOKIE } from "@/lib/auth/session";
import { consentCatalog, hasConsent } from "@/lib/privacy/consent";
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
