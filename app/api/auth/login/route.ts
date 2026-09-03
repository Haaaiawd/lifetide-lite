import { NextRequest, NextResponse } from "next/server";
import { loginUser, bindGuestSessionToUser, AUTH_TOKEN_COOKIE, AUTH_TOKEN_TTL } from "@/lib/auth/user";
import { requireGuestSession } from "@/lib/auth/session";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const email = body.email?.trim()?.toLowerCase();
    const password = body.password;

    if (!email || !password) {
      return NextResponse.json({ error: "邮箱和密码不能为空" }, { status: 400 });
    }

    const { user, token } = await loginUser(email, password);

    // Bind existing guest session to this user (same as register).
    // Without this, consents/data from the guest session are lost
    // and resolveSession creates a fresh empty authed session.
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
    const message = err instanceof Error ? err.message : "登录失败";
    const status = message === "邮箱或密码错误" ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
