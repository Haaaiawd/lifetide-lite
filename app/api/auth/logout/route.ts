import { NextResponse } from "next/server";
import { AUTH_TOKEN_COOKIE } from "@/lib/auth/user";
import { GUEST_TOKEN_COOKIE } from "@/lib/auth/session";

export async function POST() {
  const response = NextResponse.json({ ok: true });
  response.cookies.delete(AUTH_TOKEN_COOKIE);
  // Also clear guest cookie so the next login doesn't pick up a stale
  // session bound to a previous user (CWE-639).
  response.cookies.delete(GUEST_TOKEN_COOKIE);
  return response;
}
