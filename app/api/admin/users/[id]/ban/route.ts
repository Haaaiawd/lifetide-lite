import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireAdmin, isAdminEmail } from "@/lib/auth/admin";

// POST /api/admin/users/[id]/ban — ban a user
// DELETE /api/admin/users/[id]/ban — unban a user

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { user: admin, response } = await requireAdmin(request);
  if (response || !admin) return response;

  const { id } = await params;

  // Prevent self-ban
  if (id === admin.id) {
    return NextResponse.json({ error: "不能封禁自己" }, { status: 400 });
  }

  const target = await prisma.user.findUnique({ where: { id } });
  if (!target) {
    return NextResponse.json({ error: "用户不存在" }, { status: 404 });
  }

  // Prevent banning other admins
  if (isAdminEmail(target.email)) {
    return NextResponse.json({ error: "不能封禁管理员" }, { status: 400 });
  }

  const updated = await prisma.user.update({
    where: { id },
    data: { banned: true, bannedAt: new Date() },
  });

  return NextResponse.json({
    id: updated.id,
    email: updated.email,
    banned: updated.banned,
    bannedAt: updated.bannedAt?.toISOString() ?? null,
  });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { response } = await requireAdmin(request);
  if (response) return response;

  const { id } = await params;

  const target = await prisma.user.findUnique({ where: { id } });
  if (!target) {
    return NextResponse.json({ error: "用户不存在" }, { status: 404 });
  }

  const updated = await prisma.user.update({
    where: { id },
    data: { banned: false, bannedAt: null },
  });

  return NextResponse.json({
    id: updated.id,
    email: updated.email,
    banned: updated.banned,
    bannedAt: null,
  });
}
