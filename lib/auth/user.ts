import { randomBytes } from "node:crypto";
import { SignJWT, jwtVerify } from "jose";
import { hash, compare } from "bcryptjs";
import { prisma } from "@/lib/db/prisma";
import type { Session } from "@prisma/client";

export const AUTH_TOKEN_COOKIE = "auth-token";
export const AUTH_TOKEN_TTL = 30 * 24 * 60 * 60 * 1000; // 30 days

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET ?? randomBytes(32).toString("hex")
);

export type AuthUser = {
  id: string;
  email: string;
};

export type AuthResult = {
  user: AuthUser;
  token: string;
};

// ── Password helpers ──

export async function hashPassword(password: string): Promise<string> {
  return hash(password, 10);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return compare(password, hash);
}

// ── JWT helpers ──

export async function signAuthToken(userId: string, email: string): Promise<string> {
  return new SignJWT({ userId, email })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime(Math.floor(Date.now() / 1000) + AUTH_TOKEN_TTL / 1000)
    .setIssuedAt()
    .sign(JWT_SECRET);
}

export async function verifyAuthToken(token: string): Promise<AuthUser | null> {
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);
    if (typeof payload.userId === "string" && typeof payload.email === "string") {
      return { id: payload.userId, email: payload.email };
    }
    return null;
  } catch {
    return null;
  }
}

// ── Registration / Login ──

export async function registerUser(email: string, password: string): Promise<AuthResult> {
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    throw new Error("该邮箱已注册");
  }

  const passwordHash = await hashPassword(password);
  const user = await prisma.user.create({
    data: { email, passwordHash },
  });

  const token = await signAuthToken(user.id, user.email);
  return { user: { id: user.id, email: user.email }, token };
}

export async function loginUser(email: string, password: string): Promise<AuthResult> {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    throw new Error("邮箱或密码错误");
  }

  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) {
    throw new Error("邮箱或密码错误");
  }

  if (user.banned) {
    throw new Error("该账号已被封禁，请联系管理员");
  }

  const token = await signAuthToken(user.id, user.email);
  return { user: { id: user.id, email: user.email }, token };
}

// ── Guest → User migration ──

// When a guest registers, we bind their existing guest session to the new user.
// This way all WorkingMemory, waves, portrait, routes etc. are immediately
// accessible under the user account without any data copying.
export async function bindGuestSessionToUser(
  guestSessionId: string,
  userId: string
): Promise<Session | null> {
  const updated = await prisma.session.update({
    where: { id: guestSessionId },
    data: { userId },
  });
  return updated;
}

// ── Request helpers ──

import type { NextRequest } from "next/server";

export async function getAuthUser(request: NextRequest): Promise<AuthUser | null> {
  const token = request.cookies.get(AUTH_TOKEN_COOKIE)?.value;
  if (!token) return null;
  return verifyAuthToken(token);
}
