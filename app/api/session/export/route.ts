import { NextRequest, NextResponse } from "next/server";
import { resolveSession } from "@/lib/auth/resolve";
import { buildSessionExport } from "@/lib/session/export";

// GET /api/session/export
// User-facing export of the caller's own session. Produces the same JSON
// shape as /api/admin/debug/export so files stay compatible with import.
export async function GET(request: NextRequest) {
  const { session } = await resolveSession(request);
  if (!session) {
    return NextResponse.json({ error: "未登录或会话已过期" }, { status: 401 });
  }

  const exportData = await buildSessionExport(session.id);
  if (!exportData) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  const json = JSON.stringify(exportData, null, 2);
  const filename = `lifetide_session_${session.id}_${Date.now()}.json`;
  return new NextResponse(json, {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="${filename}"`,
    },
  });
}
