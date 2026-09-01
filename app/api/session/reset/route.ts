import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireGuestSession } from "@/lib/auth/session";
import type { NextRequest } from "next/server";

export async function POST(request: NextRequest) {
  const session = await requireGuestSession(request);
  if (!session) {
    return NextResponse.json({ ok: true });
  }

  await prisma.session.delete({ where: { id: session.id } });

  const response = NextResponse.json({ ok: true });
  response.cookies.set("lt_session", "", {
    httpOnly: true,
    path: "/",
    maxAge: 0,
    sameSite: "lax",
  });
  return response;
}
