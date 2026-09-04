import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireAdmin } from "@/lib/auth/admin";

export async function GET(request: NextRequest) {
  const { response } = await requireAdmin(request);
  if (response) return response;

  const users = await prisma.user.findMany({
    orderBy: { createdAt: "desc" },
    take: 100,
    include: { sessions: { take: 1, orderBy: { createdAt: "desc" } } },
  });

  return NextResponse.json({
    users: users.map((u) => ({
      id: u.id,
      email: u.email,
      createdAt: u.createdAt.toISOString(),
      banned: u.banned,
      bannedAt: u.bannedAt?.toISOString() ?? null,
      lastSessionAt: u.sessions[0]?.createdAt.toISOString() ?? null,
    })),
  });
}
