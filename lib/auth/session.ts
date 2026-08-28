import { randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { ConsentType, defaultConsentRecords } from "@/lib/privacy/consent";

export const GUEST_TOKEN_COOKIE = "guest-token";
export const GUEST_TTL_MS = 24 * 60 * 60 * 1000;

export type GuestSession = {
  id: string;
  token: string;
  expiresAt: Date;
};

function generateToken() {
  return randomBytes(32).toString("hex");
}

export async function getSessionByToken(token: string) {
  return prisma.session.findUnique({
    where: { token },
    include: { consents: true, answers: true, uploads: true, derived: true, workingMemory: true },
  });
}

export async function getOrCreateGuestSession(request: NextRequest) {
  const existing = request.cookies.get(GUEST_TOKEN_COOKIE)?.value;

  if (existing) {
    const session = await getSessionByToken(existing);
    if (session && session.expiresAt > new Date()) {
      return { session, isNew: false };
    }
  }

  const token = generateToken();
  const expiresAt = new Date(Date.now() + GUEST_TTL_MS);

  const session = await prisma.session.create({
    data: {
      token,
      expiresAt,
      consents: {
        create: defaultConsentRecords(),
      },
    },
    include: { consents: true, answers: true, uploads: true, derived: true },
  });

  return { session, isNew: true };
}

export function attachGuestCookie(response: NextResponse, token: string) {
  response.cookies.set(GUEST_TOKEN_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: GUEST_TTL_MS / 1000,
  });
  return response;
}

export async function requireGuestSession(request: NextRequest) {
  const token = request.cookies.get(GUEST_TOKEN_COOKIE)?.value;
  if (!token) return null;

  const session = await getSessionByToken(token);
  if (!session || session.expiresAt <= new Date()) return null;

  return session;
}

export function hasConsent(consents: { type: string; given: boolean }[], type: ConsentType) {
  return consents.some((c) => c.type === type && c.given);
}
