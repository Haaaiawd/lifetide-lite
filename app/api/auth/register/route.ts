import { NextRequest, NextResponse } from "next/server";
import { registerUser, bindGuestSessionToUser, AUTH_TOKEN_COOKIE, AUTH_TOKEN_TTL } from "@/lib/auth/user";
import { requireGuestSession } from "@/lib/auth/session";
import { validateAndConsumeInviteCode } from "@/lib/auth/invite";

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

    const codeValid = await validateAndConsumeInviteCode(inviteCode);
    if (!codeValid) {
      return NextResponse.json({ error: "邀请码无效或已用完" }, { status: 403 });
    }

    const { user, token } = await registerUser(email, password);

    // Bind existing guest session to the new user if present
    const guestSession = await requireGuestSession(request);
    if (guestSession) {
      await bindGuestSessionToUser(guestSession.id, user.id);
    }

    const response = NextResponse.json({ user });
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
    const status = message === "该邮箱已注册" ? 409 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
