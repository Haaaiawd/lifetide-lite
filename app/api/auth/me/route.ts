import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth/user";

export async function GET(request: NextRequest) {
  const user = await getAuthUser(request);
  if (!user) {
    return NextResponse.json({ user: null }, { status: 200 });
  }
  return NextResponse.json({ user }, { status: 200 });
}
