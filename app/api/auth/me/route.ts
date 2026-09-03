import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth/user";
import { prisma } from "@/lib/db/prisma";

export async function GET(request: NextRequest) {
  const user = await getAuthUser(request);
  if (!user) {
    return NextResponse.json({ user: null }, { status: 200 });
  }

  // Check ban status — if banned, treat as logged out so the user
  // is redirected to login where they'll see the ban message.
  const userRow = await prisma.user.findUnique({
    where: { id: user.id },
    select: { banned: true },
  });
  if (userRow?.banned) {
    return NextResponse.json({ user: null, banned: true }, { status: 200 });
  }

  return NextResponse.json({ user }, { status: 200 });
}
