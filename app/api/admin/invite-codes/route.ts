import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireAdmin } from "@/lib/auth/admin";
import { createInviteCode } from "@/lib/auth/invite";

// GET — list all invite codes
export async function GET(request: NextRequest) {
  const { response } = await requireAdmin(request);
  if (response) return response;

  const codes = await prisma.inviteCode.findMany({
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({
    codes: codes.map((c) => ({
      id: c.id,
      code: c.code,
      maxUses: c.maxUses,
      usedCount: c.usedCount,
      exhausted: c.exhausted,
      note: c.note,
      createdAt: c.createdAt.toISOString(),
    })),
  });
}

// POST — generate new invite code
export async function POST(request: NextRequest) {
  const { user, response } = await requireAdmin(request);
  if (response) return response;

  const body = await request.json().catch(() => ({}));
  const maxUses = Math.max(1, Math.min(100, body.maxUses ?? 5));
  const note = body.note ?? null;

  const result = await createInviteCode({
    maxUses,
    note,
    createdBy: user!.email,
  });

  return NextResponse.json(result, { status: 201 });
}

// DELETE — delete an invite code
export async function DELETE(request: NextRequest) {
  const { response } = await requireAdmin(request);
  if (response) return response;

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "Missing id" }, { status: 400 });
  }

  await prisma.inviteCode.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
