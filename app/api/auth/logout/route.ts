import { NextResponse } from "next/server";
import { AUTH_TOKEN_COOKIE } from "@/lib/auth/user";

export async function POST() {
  const response = NextResponse.json({ ok: true });
  response.cookies.delete(AUTH_TOKEN_COOKIE);
  return response;
}
