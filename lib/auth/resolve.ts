import { NextRequest } from "next/server";
import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/db/prisma";
import { requireGuestSession, getSessionByToken, hasConsent, GUEST_TOKEN_COOKIE } from "./session";
import { getAuthUser } from "./user";
import { defaultConsentRecords } from "@/lib/privacy/consent";

// Unified session resolution: auth user first, guest fallback.
// Returns the session row with consents included, or null if neither exists.
export async function resolveSession(request: NextRequest) {
  // 1. Check auth token (logged-in user)
  const authUser = await getAuthUser(request);
  if (authUser) {
    // Check if user is banned — reject even if they have a valid token
    const userRow = await prisma.user.findUnique({
      where: { id: authUser.id },
      select: { banned: true },
    });
    if (userRow?.banned) {
      return { session: null, isAuthed: false, user: null, banned: true };
    }

    // Find the most recent session bound to this user
    const session = await prisma.session.findFirst({
      where: { userId: authUser.id },
      orderBy: { createdAt: "desc" },
      include: { consents: true, answers: true, uploads: true, derived: true, workingMemory: true },
    });
    if (session) {
      return { session, isAuthed: true, user: authUser };
    }
    // User exists but no session bound yet — create a fresh one with default consents
    const token = randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const newSession = await prisma.session.create({
      data: {
        token,
        userId: authUser.id,
        expiresAt,
        consents: {
          create: defaultConsentRecords(),
        },
      },
      include: { consents: true, answers: true, uploads: true, derived: true, workingMemory: true },
    });
    return { session: newSession, isAuthed: true, user: authUser };
  }

  // 2. Fallback to guest session
  const guestSession = await requireGuestSession(request);
  if (guestSession) {
    return { session: guestSession, isAuthed: false, user: null };
  }

  return { session: null, isAuthed: false, user: null };
}

export { hasConsent, GUEST_TOKEN_COOKIE };
