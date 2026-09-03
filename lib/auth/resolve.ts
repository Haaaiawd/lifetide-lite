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

    // Find the best session for this user.
    // Score by real progress: consents given, answers, successful uploads,
    // derived content, and working memory. This avoids picking an empty
    // duplicate created by a race condition, and avoids counting failed
    // uploads as progress.
    const sessions = await prisma.session.findMany({
      where: { userId: authUser.id },
      include: { consents: true, answers: true, uploads: true, derived: true, workingMemory: true },
      orderBy: { createdAt: "desc" },
    });
    const session = sessions.length > 0
      ? sessions.reduce((best, cur) => {
          const score = (s: typeof best) =>
            s.consents.filter(c => c.given).length +
            s.answers.length +
            s.uploads.filter(u => u.status === "ready" || u.status === "preview_ready").length +
            s.derived.length +
            (s.workingMemory ? 1 : 0);
          return score(cur) > score(best) ? cur : best;
        })
      : null;
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
