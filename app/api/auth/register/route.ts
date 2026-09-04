import { NextRequest, NextResponse } from "next/server";
import {
  bindGuestSessionToUser,
  AUTH_TOKEN_COOKIE,
  AUTH_TOKEN_TTL,
  hashPassword,
  signAuthToken,
  createUserInTx,
} from "@/lib/auth/user";
import { requireGuestSession } from "@/lib/auth/session";
import { consumeInviteCodeInTx } from "@/lib/auth/invite";
import { prisma } from "@/lib/db/prisma";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const email = body.email?.trim()?.toLowerCase();
    const password = body.password;
    const inviteCode = body.inviteCode?.trim()?.toUpperCase();

    if (!email || !password) {
      return NextResponse.json({ error: "邮箱和密码不能为空" }, { status: 400 });
    }

    if (password.length < 6) {
      return NextResponse.json({ error: "密码至少 6 位" }, { status: 400 });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return NextResponse.json({ error: "邮箱格式不正确" }, { status: 400 });
    }

    if (!inviteCode) {
      return NextResponse.json({ error: "请输入邀请码" }, { status: 400 });
    }

    // Hash password outside the transaction (bcrypt is async/CPU-bound).
    const passwordHash = await hashPassword(password);

    // Atomic: email check + invite consumption + user creation in one transaction.
    // If any step fails, the invite slot is NOT consumed.
    const result = await prisma.$transaction(async (tx) => {
      const existing = await tx.user.findUnique({ where: { email } });
      if (existing) {
        throw new Error("该邮箱已注册");
      }

      const codeSource = await consumeInviteCodeInTx(tx, inviteCode);
      if (!codeSource) {
        throw new Error("邀请码无效或已用完");
      }

      const user = await createUserInTx(tx, email, passwordHash);
      return { user };
    });

    const token = await signAuthToken(result.user.id, result.user.email);

    // Bind existing guest session to the new user if present
    const guestSession = await requireGuestSession(request);
    if (guestSession) {
      await bindGuestSessionToUser(guestSession.id, result.user.id);
    }

    const response = NextResponse.json({ user: result.user });
    response.cookies.set(AUTH_TOKEN_COOKIE, token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: AUTH_TOKEN_TTL / 1000,
    });
    return response;
  } catch (err) {
    const message = err instanceof Error ? err.message : "注册失败";
    const status =
      message === "该邮箱已注册" ? 409 :
      message === "邀请码无效或已用完" ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
