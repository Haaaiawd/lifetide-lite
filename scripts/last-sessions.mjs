import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();
const sessions = await prisma.session.findMany({ orderBy: { createdAt: "desc" }, take: 3 });
for (const s of sessions) {
  console.log(s.id, s.createdAt, s.token);
  const calls = await prisma.modelCallLog.findMany({ where: { sessionId: s.id }, orderBy: { createdAt: "asc" } });
  for (const c of calls) {
    console.log("  ", c.purpose, c.status, c.latency_ms, "ms");
  }
}
await prisma.$disconnect();
