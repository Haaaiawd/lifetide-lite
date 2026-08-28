import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import type { NextRequest } from "next/server";

export async function POST(request: NextRequest) {
  const secret = request.headers.get("authorization")?.replace("Bearer ", "");
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const now = new Date();
  const expired = await prisma.session.findMany({
    where: { expiresAt: { lt: now } },
    select: { id: true, token: true, createdAt: true },
  });

  const { count } = await prisma.session.deleteMany({
    where: { expiresAt: { lt: now } },
  });

  return NextResponse.json({
    deleted: count,
    expiredSessions: expired.map((s) => ({
      id: s.id,
      token: s.token.slice(0, 8) + "...",
      createdAt: s.createdAt,
    })),
  });
}
