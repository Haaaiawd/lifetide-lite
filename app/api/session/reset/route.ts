import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { resolveSession } from "@/lib/auth/resolve";
import { GUEST_TOKEN_COOKIE } from "@/lib/auth/session";
import type { NextRequest } from "next/server";

export async function POST(request: NextRequest) {
  const { session } = await resolveSession(request);
  if (!session) {
    return NextResponse.json({ ok: true });
  }

  await prisma.session.delete({ where: { id: session.id } });

  const response = NextResponse.json({ ok: true });
  // Clear the guest session cookie (the actual cookie name, not "lt_session")
  response.cookies.set(GUEST_TOKEN_COOKIE, "", {
    httpOnly: true,
    path: "/",
    maxAge: 0,
    sameSite: "lax",
  });
  return response;
}
