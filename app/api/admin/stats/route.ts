import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireAdmin } from "@/lib/auth/admin";

export async function GET(request: NextRequest) {
  const { response } = await requireAdmin(request);
  if (response) return response;

  const [
    userCount,
    sessionCount,
    activeSessions,
    inviteCodes,
    workingMemories,
    waves,
    portraits,
    finalPlans,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.session.count(),
    prisma.session.count({ where: { expiresAt: { gt: new Date() } } }),
    prisma.inviteCode.findMany({ orderBy: { createdAt: "desc" } }),
    prisma.workingMemory.count(),
    prisma.wave.count(),
    prisma.derivedContent.count({ where: { kind: "insight" } }),
    prisma.derivedContent.count({ where: { kind: "route" } }),
  ]);

  // Parse working memories for progress distribution
  const wmRecords = await prisma.workingMemory.findMany();
  const waveDistribution: Record<number, number> = {};
  let portraitCount = 0;
  let finalPlanCount = 0;

  for (const wm of wmRecords) {
    try {
      const payload = JSON.parse(wm.payload);
      const waveIdx = payload.last_wave_index ?? 0;
      waveDistribution[waveIdx] = (waveDistribution[waveIdx] ?? 0) + 1;
      if (payload.persona_portrait) portraitCount++;
      if (payload.finalPlan) finalPlanCount++;
    } catch {}
  }

  // Invite code stats
  const totalInvites = inviteCodes.length;
  const totalInviteUses = inviteCodes.reduce((sum, c) => sum + c.usedCount, 0);
  const activeInvites = inviteCodes.filter((c) => !c.exhausted).length;

  // Recent users (last 10)
  const recentUsers = await prisma.user.findMany({
    orderBy: { createdAt: "desc" },
    take: 10,
    include: { sessions: { take: 1, orderBy: { createdAt: "desc" } } },
  });

  // Recent sessions (last 10)
  const recentSessions = await prisma.session.findMany({
    orderBy: { createdAt: "desc" },
    take: 10,
    include: { user: true, workingMemory: true },
  });

  return NextResponse.json({
    counts: {
      users: userCount,
      sessions: sessionCount,
      activeSessions,
      workingMemories,
      waves,
      portraits: portraitCount,
      finalPlans: finalPlanCount,
      derivedInsights: portraits,
      derivedRoutes: finalPlans,
    },
    invites: {
      total: totalInvites,
      active: activeInvites,
      totalUses: totalInviteUses,
      codes: inviteCodes.map((c) => ({
        id: c.id,
        code: c.code,
        maxUses: c.maxUses,
        usedCount: c.usedCount,
        exhausted: c.exhausted,
        note: c.note,
        source: c.source,
        createdAt: c.createdAt.toISOString(),
      })),
    },
    waveDistribution,
    recentUsers: recentUsers.map((u) => ({
      id: u.id,
      email: u.email,
      createdAt: u.createdAt.toISOString(),
      banned: u.banned,
      bannedAt: u.bannedAt?.toISOString() ?? null,
      lastSessionAt: u.sessions[0]?.createdAt.toISOString() ?? null,
    })),
    recentSessions: recentSessions.map((s) => {
      let progress = "no WM";
      if (s.workingMemory) {
        try {
          const payload = JSON.parse(s.workingMemory.payload);
          const parts = [];
          parts.push(`wave ${payload.last_wave_index ?? 0}`);
          if (payload.persona_portrait) parts.push("portrait");
          if (payload.finalPlan) parts.push("final");
          progress = parts.join(" + ");
        } catch {}
      }
      return {
        id: s.id,
        userId: s.userId,
        userEmail: s.user?.email ?? null,
        expiresAt: s.expiresAt.toISOString(),
        createdAt: s.createdAt.toISOString(),
        progress,
      };
    }),
  });
}
