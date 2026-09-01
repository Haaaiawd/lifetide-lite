import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth/user";

export function isAdminEmail(email: string): boolean {
  const adminEmail = process.env.ADMIN_EMAIL;
  if (!adminEmail) return false;
  return email.toLowerCase() === adminEmail.toLowerCase();
}

export async function requireAdmin(request: NextRequest) {
  const user = await getAuthUser(request);
  if (!user) {
    return { user: null, response: NextResponse.json({ error: "Not authenticated" }, { status: 401 }) };
  }
  if (!isAdminEmail(user.email)) {
    return { user: null, response: NextResponse.json({ error: "Admin access required" }, { status: 403 }) };
  }
  return { user, response: null };
}
